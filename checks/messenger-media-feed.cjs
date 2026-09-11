const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/messenger/room/[id].tsx'), 'utf8');
const file = ts.createSourceFile('room.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function locate(predicate) {
  let result;
  function visit(node) { if (predicate(node)) result = node; else ts.forEachChild(node, visit); }
  visit(file); assert(result, 'target handler is present'); return result;
}
function execute(node, scope) {
  const output = ts.transpileModule('var handler = ' + node.getText(file) + '; handler;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(output, scope);
}
const list = locate(n => (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText(file) === 'FlatList');
const attribute = name => list.attributes.properties.find(p => p.name?.getText(file) === name).initializer.expression;
let scrolls = [], height = 200, contentPending = true;
const scope = {
  Math, feedHeight: height, setFeedHeight: value => { height = value; },
  visibleMessages: [{}], initialListContentMeasured: { current: false }, pendingInitialPosition: { current: false },
  followSentMessage: { current: 'outgoing-video' }, keyboardScrollPending: { current: false }, nearLatest: { current: false },
  messageNavigationTarget: { current: null }, pendingScrollAnimation: { current: null },
  listRef: { current: { scrollToEnd: options => scrolls.push(options) } },
  clearPendingLatestScroll: () => { contentPending = false; }, requestAnimationFrame: fn => fn(),
};
const content = execute(attribute('onContentSizeChange'), scope);
// Native resize/large video can report "not near latest" before the row's new size is known.
content(); assert.equal(scrolls.length, 1, 'new bubble wins over stale scroll distance');
content(); assert.equal(scrolls.length, 2, 'poster -> confirmed video grows without losing the tail');
const layout = execute(attribute('onLayout'), scope);
layout({ nativeEvent: { layout: { height: 180 } } });
assert.equal(scrolls.length, 3, 'composer/media draft layout leaves newest bubble visible');
assert.equal(height, 180);
const anchor = execute(attribute('maintainVisibleContentPosition'), {
  ...scope, listReady: true, authorFilter: null, messageNavigationId: null,
});
assert.equal(anchor, undefined, 'native anchor to previous bubble is disabled while following a send');
scope.followSentMessage.current = null; // explicit manual scroll cancels follow
content(); assert.equal(scrolls.length, 3, 'later progress/metadata must not drag a reader back');
assert.equal(contentPending, true);
const handler = locate(n => ts.isVariableDeclaration(n) && n.name.getText(file) === 'sendAttachmentDraft').initializer.arguments[0];
let visible = [], queued = [], navigationCancelled = false;
const sentId = { current: null }, near = { current: false };
const send = execute(handler, {
  attachmentDraft: { source: 'library', files: [{ uri: 'video.mp4', kind: 'video' }] }, roomId: 'room', session: { user: { id: 'me' } }, sending: false,
  text: 'caption', replyingTo: null, Crypto: { randomUUID: () => 'stable-id' },
  pendingMessengerAttachmentMessage: (room, id, source, text, user, reply, files) => ({ room_id: room, client_message_id: id, pending: true, text, files }),
  setText: () => {}, setReplyingTo: () => {}, setAttachmentDraft: () => {}, setAuthorFilter: () => {},
  cancelMessageNavigation: () => { navigationCancelled = true; }, followSentMessage: sentId, nearLatest: near,
  setMessages: fn => { visible = fn(visible); }, mergeMessengerMessages: (current, incoming) => [...current, ...incoming],
  queueMessengerMediaMessage: async (...args) => { queued.push(args); }, db: 'sqlite',
});
send();
assert.equal(visible.length, 1, 'bubble exists synchronously on send, before any file/network await');
assert.equal(visible[0].client_message_id, sentId.current);
assert.equal(queued.length, 1); assert.equal(queued[0][1].client_message_id, sentId.current);
assert.equal(near.current, true); assert(navigationCancelled, 'pin focus cannot swallow a newly sent bubble');
// The worker emits only after cache seeding. Clear the transitional picker
// preview before merging that acceptance, so cleanup cannot leave a blank tile.
const feedExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../features/messenger/feed.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: feedExports });
const delivery = { status: 'sent', recipient_count: 0, delivered_count: 0, read_count: 0 };
let pendingRows = [{ id: 'pending-id', client_message_id: 'id', pending: true, delivery, reactions: [],
  media_items: [], pending_attachment: { stage: 'uploading', local_uri: 'file:///outbox/video.mp4' } }];
const receive = execute(locate(n => ts.isCallExpression(n) && n.expression.getText(file) === 'subscribeMessengerMediaOutbox').arguments[0], {
  roomId: 'room', session: { user: { id: 'me' } }, reactionMutationIds: { current: new Set() },
  setMessages: fn => { pendingRows = fn(pendingRows); }, mergeMessengerMessages: feedExports.mergeMessengerMessages,
});
receive({ id: 'server-id', client_message_id: 'id', room_id: 'room', author: { id: 'me' },
  pending: false, delivery, reactions: [], media_items: [{ id: 'video' }] });
assert.equal(pendingRows.length, 1);
assert.equal(pendingRows[0].pending_attachment, null, 'cache-ready media must replace the soon-to-be-released upload preview');
console.log('Actual room handlers: immediate bubble, stable ID, last-row follow after media/viewport growth, native anchor exclusion and manual scrolling passed.');
