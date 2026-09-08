/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports, react/prop-types */
// Actual React hook + actual transport scheduler, with only platform/network mocked.
// PIN_TEST_MODULES points to an isolated install of react@19.1.0 and
// react-test-renderer@19.1.0 (CI does not change the application dependencies).
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const testRequire = process.env.PIN_TEST_MODULES
  ? Module.createRequire(path.join(process.env.PIN_TEST_MODULES, 'package.json')) : require;
const React = testRequire('react');
const { create, act } = testRequire('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function compile(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = instance.require.bind(instance);
  instance.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name);
  instance._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return instance.exports;
}

const transport = compile('services/messengerTransport.ts');
const policy = compile('features/messenger/pins.ts');
class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}
const listeners = new Set();
const requests = [];
const request = (url, options = {}) => transport.runMessengerTransportTask(optionsToTransport(options), (signal) => new Promise((resolve, reject) => {
  const entry = { url, options, resolve, reject, aborted: false };
  requests.push(entry);
  signal.addEventListener('abort', () => { entry.aborted = true; reject(new Error('aborted')); }, { once: true });
}));
function optionsToTransport(options) { return { priority: options.transportPriority }; }
const api = { MessengerApiError: ApiError, messengerRequest: request };
const pinsApi = compile('services/messengerPins.ts', {
  './messengerApi': api,
  '../features/messenger/aliases': { applyMessengerAliases: (message) => message },
});
const { usePinnedMessages } = compile('features/messenger/usePinnedMessages.ts', {
  react: React,
  'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
  '../../services/messengerApi': api,
  '../../services/messengerPins': pinsApi,
  '../../services/messengerRealtime': { subscribeMessengerRealtime: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } },
  '../../services/messengerLogger': { messengerLog() {} },
  './pins': policy,
});
let latest;
function Harness({ room = 'direct', user = 'user-a', active = true, canWrite = true }) {
  latest = usePinnedMessages(room, user, active, canWrite);
  return React.createElement('button', { hidden: !latest.canPin }, 'Закрепить сообщение');
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function flush() { await act(async () => { await tick(); }); }
const answer = { can_pin: true, items: [] };
const pin = { message: { id: 'pin-1', room_id: 'direct', sequence: '123', text: 'Pinned', kind: 'text' } };

(async () => {
  // Prove the original failure: a foreground history/read request displaces
  // the background pins GET. It is not a server write-permission denial.
  const old = request('/old-pins', { transportPriority: 'background' });
  const oldRejected = assert.rejects(old, transport.MessengerBackgroundRequestCancelledError);
  await tick();
  await transport.runMessengerTransportTask({ priority: 'foreground' }, async () => {});
  await oldRejected;
  assert.equal(requests[0].aborted, true);
  requests.length = 0;

  let tree;
  await act(async () => { tree = create(React.createElement(Harness)); });
  assert.equal(latest.canPin, true, 'first pin action is visible before GET completes');
  assert.equal(requests[0].options.transportPriority, 'normal');
  await act(async () => {
    await transport.runMessengerTransportTask({ priority: 'foreground' }, async () => {});
    requests[0].resolve(answer);
    await tick();
  });
  assert.equal(requests[0].aborted, false, 'pins request survives competing chat operations');
  assert.equal(latest.canPin, true, 'an empty pin list must still allow the first pin');

  // Explicit server denial overrides the room metadata fallback.
  await act(async () => { void latest.refresh(); await tick(); requests.at(-1).resolve({ can_pin: false, items: [pin] }); await tick(); });
  assert.equal(latest.canPin, false);
  assert.equal(latest.items.length, 1, 'read-only users still see existing pins');
  await act(async () => { tree.update(React.createElement(Harness, { room: 'group-b', canWrite: false })); });
  assert.equal(latest.canPin, false);
  assert.equal(latest.items.length, 0, 'no prior-room pins leak during switching');
  await act(async () => { requests.at(-1).resolve({ can_pin: false, items: [] }); await tick(); });

  // Old-server fallback must hide only this feature, and cleanly recover.
  await act(async () => { tree.update(React.createElement(Harness, { room: 'old-server' })); });
  await act(async () => { requests.at(-1).reject(new ApiError('not found', 404, 'not_found')); await tick(); });
  assert.equal(latest.canPin, false);
  await act(async () => { void latest.refresh(); await tick(); requests.at(-1).resolve(answer); await tick(); });
  assert.equal(latest.canPin, true);

  // Temporary failure is retried promptly, without hiding the first-pin action.
  await act(async () => { tree.update(React.createElement(Harness, { room: 'offline' })); });
  await act(async () => { requests.at(-1).reject(new Error('offline')); await tick(); });
  assert.equal(latest.canPin, true);
  const count = requests.length;
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
  assert.equal(requests.length, count + 1, 'short retry runs before the periodic timer');
  await act(async () => { requests.at(-1).resolve(answer); await tick(); });

  // Stale responses are ignored after identity changes; an invalidation while
  // GET is in-flight must not overwrite the new list with the older snapshot.
  await act(async () => { void latest.refresh(); await tick(); });
  const stale = requests.at(-1);
  await act(async () => { tree.update(React.createElement(Harness, { room: 'other' })); });
  const fresh = requests.at(-1);
  await act(async () => { stale.resolve({ can_pin: false, items: [pin] }); fresh.resolve(answer); await tick(); });
  assert.equal(latest.canPin, true);
  assert.equal(latest.items.length, 0);
  await act(async () => { void latest.refresh(); await tick(); });
  const invalidated = requests.at(-1);
  await act(async () => { void latest.refresh(); invalidated.resolve({ can_pin: false, items: [pin] }); await tick(); });
  assert.equal(latest.canPin, true, 'invalidated permission snapshot must not apply');
  await act(async () => { requests.at(-1).resolve(answer); await tick(); });
  await act(async () => { tree.unmount(); });
  assert.equal(listeners.size, 0);
  await flush();
  console.log('Pin hook/transport regression checks passed: displacement reproduced; visibility, retry, read-only, compatibility, races and cleanup verified.');
})().catch((error) => { console.error(error); process.exit(1); });
