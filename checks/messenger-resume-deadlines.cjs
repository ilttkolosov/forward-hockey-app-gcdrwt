const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
function harness(file, mocks = {}) {
  const timers = new Map(); let id = 0;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: name => { assert(name in mocks, name); return mocks[name]; },
    console, Date, AbortController,
    setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => 0, clearInterval: () => {},
  });
  return { exports, fire(delay) {
    const found = [...timers].find(([, t]) => t.delay === delay);
    assert(found, `Missing deadline ${delay}`);
    timers.delete(found[0]); found[1].fn();
  }};
}
(async () => {
  const transport = harness('services/messengerTransport.ts');
  const task = transport.exports.runMessengerTransportTask({ priority: 'foreground', timeoutMs: 50 }, () => new Promise(() => {}));
  transport.fire(50);
  await assert.rejects(task, /Сервер не ответил/);
  assert.equal(await transport.exports.runMessengerTransportTask({ priority: 'background' }, async () => 42), 42);

  let stateHandler; let socket; let connects = 0;
  const AppState = { currentState: 'active', addEventListener: (_, fn) => { stateHandler = fn; return { remove() {} }; } };
  const realtime = harness('services/messengerRealtime.ts', {
    'socket.io-client': { io: () => {
      socket = new EventEmitter(); socket.connected = true;
      socket.io = new EventEmitter(); socket.io.engine = new EventEmitter(); socket.io.open = () => {};
      socket.disconnect = () => { socket.connected = false; socket.emit('disconnect', 'io client disconnect'); };
      socket.connect = () => { connects++; socket.connected = true; socket.emit('connect'); };
      return socket;
    } },
    'react-native': { AppState }, '../features/messenger/aliases': { applyMessengerAliases: x => x },
    './messengerApi': { MESSENGER_SERVER_ORIGIN: 'https://example.invalid' },
    './messengerLogger': { messengerLog() {} },
    './messengerTransport': { prioritizeMessengerForegroundTransport() {} },
  });
  const api = realtime.exports;
  api.connectMessengerRealtime('test');
  socket.emit('connect'); socket.emit('connection.ready', {});
  AppState.currentState = 'background'; stateHandler();
  AppState.currentState = 'active'; stateHandler();
  api.resumeMessengerRealtime();
  assert.equal(api.getMessengerRealtimeConnectionState(), false);
  socket.io.engine.emit('packet', { type: 'ping' });
  assert.equal(api.getMessengerRealtimeConnectionState(), true, 'Inbound packet confirms the authenticated transport');
  assert.equal(connects, 0);
  AppState.currentState = 'background'; stateHandler();
  AppState.currentState = 'active'; stateHandler();
  api.resumeMessengerRealtime();
  AppState.currentState = 'background'; stateHandler();
  AppState.currentState = 'active'; stateHandler();
  api.resumeMessengerRealtime();
  realtime.fire(2000);
  assert.equal(connects, 1, 'A stale connected socket must be replaced');
  realtime.fire(4000); realtime.fire(4000); realtime.fire(4000);
  assert.equal(connects, 3, 'Authorization retries must be finite');
  api.disconnectMessengerRealtime();
  console.log('Resume probe, bounded authorization retries and uncooperative fetch deadline passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
