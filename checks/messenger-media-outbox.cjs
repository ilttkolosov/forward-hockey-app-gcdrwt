const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const user = { id: 'user', username: 'user', display_name: 'Sender', avatar_url: null };
const files = [{ uri: 'file:///picker/video.mp4', name: 'video.mp4', kind: 'video', type: 'video/mp4', size_bytes: 800, original_size_bytes: 800 }];
const feed = compile('features/messenger/feed.ts', {});
function compile(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => {
    if (!(name in mocks)) throw Error('Unexpected import: ' + name);
    return mocks[name];
  }, ...mocks.globals });
  return exports;
}
function environment() {
  let now = 1000, session = { user }, transport = async () => { throw Error('network'); };
  let cacheFails = 0, nextTimer = 0;
  const timers = new Map(), calls = [], events = [], order = [];
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE messenger_messages (client_message_id TEXT PRIMARY KEY, raw_json TEXT); PRAGMA user_version = 12;');
  const migrations = JSON.parse(fs.readFileSync(path.join(root, 'database/migrations.json')));
  assert.equal(migrations.schemaVersion, 13);
  sql.exec(migrations.migrations.find(m => m.version === 13).sql);
  const db = {
    runAsync: async (query, ...params) => sql.prepare(query).run(...params),
    getAllAsync: async (query, ...params) => sql.prepare(query).all(...params),
    getFirstAsync: async (query, ...params) => sql.prepare(query).get(...params) || null,
  };
  const repo = compile('features/messenger/mediaOutboxRepository.ts', {
    '../../database/writeCoordinator': { enqueueDatabaseWrite: fn => fn() },
  });
  class ApiError extends Error { constructor(status) { super('HTTP ' + status); this.status = status; } }
  class Cancelled extends Error {}
  function makeService() {
    const service = compile('services/messengerMediaOutbox.ts', {
      '../features/messenger/mediaOutboxRepository': repo,
      '../features/messenger/repository': { cacheIncomingMessengerMessage: async (_db, message) => {
        if (cacheFails-- > 0) throw Error('SQLITE_BUSY');
        order.push('cache');
        await db.runAsync('INSERT OR REPLACE INTO messenger_messages VALUES (?, ?)', message.client_message_id, JSON.stringify(message));
      } },
      './messengerApi': { MessengerApiError: ApiError, isMessengerUploadCancelledError: e => e instanceof Cancelled,
        messengerErrorMessage: e => e.message, sendMessengerMedia: async (...args) => {
          order.push('network'); calls.push({ id: args[1], at: now, files: args[2] }); return transport(...args);
        } },
      './messengerSession': { loadMessengerSession: async () => session },
      './messengerAttachmentPicker': { assertMessengerUploadLimits: () => {} },
      './messengerMediaCache': { beginLocalMessengerMediaUpload: () => {}, endLocalMessengerMediaUpload: () => {}, seedMessengerMediaCache: async () => { order.push('seed'); } },
      './messengerMediaUploadManager': { runManagedMessengerMediaUpload: async options => options.run(new AbortController().signal) },
      './messengerMediaOutboxFiles': {
        retainMessengerMediaFiles: async (id, items) => {
          assert.equal((await repo.loadMessengerMediaOutbox(db, user.id)).filter(j => j.message.client_message_id === id).length, 1,
            'full SQL message must exist before copying or networking');
          order.push('retain'); return items.map(file => ({ ...file, uri: 'file:///documents/' + id + '/video.mp4' }));
        },
        createMessengerMediaPosters: async items => items.map(file => ({ ...file, thumbnail_uri: file.uri + '.jpg' })),
        releaseMessengerMediaFiles: async () => { order.push('release'); },
      },
      './messengerLogger': { messengerLog: () => {} }, './analyticsService': { trackMessengerAction: () => {} },
      globals: { Date: class extends Date { static now() { return now; } },
        setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { at: now + delay, fn }); return id; },
        clearTimeout: id => timers.delete(id) },
    });
    service.subscribeMessengerMediaOutbox(message => events.push(message));
    return service;
  }
  const pending = id => feed.pendingMessengerAttachmentMessage('room', id, 'library', 'caption', user, undefined, files);
  const accepted = id => ({ ...pending(id), id: 'server-' + id, sequence: '50', pending: false, pending_attachment: null,
    media: { id: 'asset', type: 'video', size_bytes: 800 }, media_items: [{ id: 'asset', type: 'video', size_bytes: 800 }] });
  const drain = async () => { for (let i = 0; i < 35; i++) await new Promise(resolve => setImmediate(resolve)); };
  const advance = async ms => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    await drain();
  };
  return { db, repo, sql, calls, events, order, pending, accepted, makeService, drain, advance, ApiError,
    transport: fn => { transport = fn; }, session: value => { session = value; }, cacheFails: n => { cacheFails = n; } };
}
(async () => {
  // Durable first, screen unsubscription never cancels upload, single-flight across all triggers.
  {
    const e = environment(), s = e.makeService(); let resolveUpload;
    e.transport(() => new Promise(resolve => { resolveUpload = resolve; }));
    const unsubscribe = s.subscribeMessengerMediaOutbox(() => {});
    await s.queueMessengerMediaMessage(e.db, e.pending('one'), files);
    unsubscribe();
    await e.drain();
    for (let i = 0; i < 5; i++) s.requestMessengerMediaOutboxFlush(e.db, user.id);
    assert.equal(e.calls.length, 1);
    const [stored] = await e.repo.loadMessengerMediaOutbox(e.db, user.id);
    assert.equal(stored.message.text, 'caption');
    assert.match(stored.message.pending_attachment.thumbnail_uri, /\.jpg$/);
    resolveUpload({ message: e.accepted('one'), created: true }); await e.drain();
    assert.equal((await e.repo.loadMessengerMediaOutbox(e.db, user.id)).length, 0);
    assert(e.order.indexOf('retain') < e.order.indexOf('network'));
    assert(e.order.indexOf('seed') < e.order.indexOf('cache'));
    assert(e.order.indexOf('cache') < e.order.indexOf('release'));
  }
  // Exact retry budget and intervals. Reconnection triggers cannot bypass backoff or final failure.
  {
    const e = environment(), s = e.makeService();
    await s.queueMessengerMediaMessage(e.db, e.pending('retry'), files); await e.drain();
    for (let attempt = 1; attempt < 5; attempt++) {
      assert.equal(e.calls.length, attempt);
      const [item] = await e.repo.loadMessengerMediaOutbox(e.db, user.id);
      assert.equal(item.message.send_error, null);
      s.requestMessengerMediaOutboxFlush(e.db, user.id); await e.drain();
      await e.advance(2999); assert.equal(e.calls.length, attempt);
      await e.advance(1);
    }
    assert.equal(e.calls.length, 5);
    assert.deepEqual(e.calls.map(c => c.at), [1000, 4000, 7000, 10000, 13000]);
    const [failed] = await e.repo.loadMessengerMediaOutbox(e.db, user.id);
    assert.equal(failed.state, 'failed'); assert.equal(failed.message.pending_attachment.label, 'Неотправлено');
    for (let i = 0; i < 3; i++) { s.requestMessengerMediaOutboxFlush(e.db, user.id); await e.advance(3000); }
    assert.equal(e.calls.length, 5);
    e.transport(async () => ({ message: e.accepted('retry'), created: false }));
    await s.retryMessengerMediaMessage(e.db, user.id, 'retry'); await e.drain();
    assert.equal(e.calls.length, 6); assert(e.calls.every(c => c.id === 'retry'), 'manual retry preserves server idempotency key');
  }
  // Process restart reconstructs SQLite jobs and backoff, without a mounted room.
  {
    const e = environment(), old = e.makeService();
    const stop = old.startMessengerMediaOutbox(e.db, user.id);
    await old.queueMessengerMediaMessage(e.db, e.pending('restart'), files); await e.drain(); stop();
    const fresh = e.makeService(); e.transport(async () => ({ message: e.accepted('restart'), created: true }));
    fresh.startMessengerMediaOutbox(e.db, user.id); await e.drain(); assert.equal(e.calls.length, 1);
    await e.advance(3000); assert.equal(e.calls.length, 2);
    assert.equal((await e.repo.loadMessengerMediaOutbox(e.db, user.id)).length, 0);
  }
  // An accepted network request followed by a cache failure must not upload again.
  {
    const e = environment(), s = e.makeService(); e.cacheFails(1);
    e.transport(async () => ({ message: e.accepted('cache'), created: true }));
    await s.queueMessengerMediaMessage(e.db, e.pending('cache'), files); await e.drain();
    assert.equal((await e.repo.loadMessengerMediaOutbox(e.db, user.id))[0].state, 'accepted');
    await e.advance(3000); assert.equal(e.calls.length, 1);
    assert.equal((await e.repo.loadMessengerMediaOutbox(e.db, user.id)).length, 0);
  }
  // Permanent rejection is not retried; jobs cannot be sent with another account's token.
  {
    const e = environment(), s = e.makeService(); e.transport(async () => { throw new e.ApiError(413); });
    await s.queueMessengerMediaMessage(e.db, e.pending('invalid'), files); await e.drain(); await e.advance(15000);
    assert.equal(e.calls.length, 1);
    e.session({ user: { id: 'other' } });
    await s.queueMessengerMediaMessage(e.db, e.pending('private'), files); await e.drain();
    assert.equal(e.calls.length, 1);
  }
  // A backoff in one room does not block a newly queued message in another.
  {
    const e = environment(), s = e.makeService();
    e.transport(async (_room, id) => { if (id === 'slow') throw Error('offline'); return { message: e.accepted(id), created: true }; });
    await s.queueMessengerMediaMessage(e.db, e.pending('slow'), files); await e.drain();
    await s.queueMessengerMediaMessage(e.db, { ...e.pending('next'), room_id: 'other-room' }, files); await e.drain();
    assert.deepEqual(e.calls.map(c => c.id), ['slow', 'next']);
    assert.equal((await e.repo.loadMessengerMediaOutbox(e.db, user.id))[0].message.client_message_id, 'slow');
  }
  // Logout/account change during a request cannot emit/cache its late acceptance.
  {
    const e = environment(), s = e.makeService(); let finish;
    e.transport(() => new Promise(resolve => { finish = resolve; }));
    const stop = s.startMessengerMediaOutbox(e.db, user.id);
    await s.queueMessengerMediaMessage(e.db, e.pending('logout'), files); await e.drain();
    stop(); e.session({ user: { id: 'another' } });
    finish({ message: e.accepted('logout'), created: true }); await e.drain();
    assert.equal(await e.repo.findAcceptedMessengerMedia(e.db, 'logout'), null);
    assert.equal(e.events.filter(m => !m.pending).length, 0);
  }
  // SQL/progress racing with realtime never resurrects a pending/failed bubble or duplicates it.
  {
    const e = environment();
    const merged = feed.mergeMessengerMessages([e.accepted('merge')], [e.pending('merge')]);
    assert.equal(merged.length, 1); assert.equal(merged[0].pending, false);
  }
  console.log('Durable media outbox: real SQLite, immediate persistence, unmounted room, posters, retry budget/backoff, restart, account isolation, idempotency and cache recovery passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
