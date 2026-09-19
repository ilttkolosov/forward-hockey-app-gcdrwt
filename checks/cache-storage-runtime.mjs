import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Execute production code against SQLite, with a controllable native adapter.
function harness(initialLegacy = {}) {
  const sql = new DatabaseSync(':memory:');
  const legacy = new Map(Object.entries(initialLegacy));
  const modules = new Map();
  const timers = new Map();
  const state = { now: 1_800_000_000_000, inserts: 0, failures: 0, legacyFailures: false,
    hang: false, openFailure: false, events: [], readKeys: [], warnings: [] };
  let timerId = 0;
  const db = {
    execAsync: async text => sql.exec(text),
    closeAsync: async () => {},
    getAllAsync: async (text, ...args) => sql.prepare(text).all(...args),
    getFirstAsync: async (text, ...args) => sql.prepare(text).get(...args) || null,
    runAsync: async (text, ...args) => {
      if (text.startsWith('INSERT')) {
        state.inserts++;
        state.events.push('insert');
        if (state.failures-- > 0) throw new Error('SQLITE_FULL: database or disk is full');
      } else if (text.startsWith('DELETE')) state.events.push(`delete:${args[0]}`);
      return sql.prepare(text).run(...args);
    },
    withTransactionAsync: async task => {
      sql.exec('BEGIN');
      try { await task(); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const asyncStorage = {
    getAllKeys: async () => [...legacy.keys()],
    getItem: async key => { state.readKeys.push(key); return legacy.get(key) ?? null; },
    setItem: async (key, value) => {
      if (state.legacyFailures) throw new Error('SQLITE_FULL');
      legacy.set(key, value);
    },
    removeItem: async key => { legacy.delete(key); },
  };
  const mocks = {
    '@react-native-async-storage/async-storage': { default: asyncStorage },
    'expo-sqlite': { openDatabaseAsync: async name => {
      assert.equal(name, 'forward-cache.db', 'Only the disposable DB may be opened');
      if (state.hang) return new Promise(() => {});
      if (state.openFailure) throw new Error('cannot open cache');
      return db;
    } },
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      exports,
      require: name => {
        if (name in mocks) return mocks[name];
        if (name.startsWith('./')) return load(`services/${name.slice(2)}.ts`);
        throw new Error(`Unexpected dependency ${name}`);
      },
      Error, Date: class extends Date { static now() { return state.now; } },
      console: { log() {}, warn: (...args) => state.warnings.push(args) },
      setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
      clearTimeout: id => timers.delete(id),
    });
    return exports;
  }
  const api = load('services/cacheStorage.ts');
  return { api, load, sql, legacy, state, mocks, db, timers, async flush() {
    await new Promise(resolve => setImmediate(resolve));
  }, async expire() {
    await this.flush();
    for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); }
  } };
}

(async () => {
  // Entry count, eviction order and pinned offline snapshots.
  {
    const h = harness();
    await h.api.writeCacheValue('@offline/startup-config/v1', 'offline-config');
    for (let i = 0; i < 520; i++) {
      h.state.now++;
      await h.api.writeCacheValue(`query-${i}`, 'cached');
    }
    assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM cache_entries').get().n, 512);
    assert.equal(await h.api.readCacheValue('query-0'), null);
    assert.equal(await h.api.readCacheValue('query-519'), 'cached');
    assert.equal(await h.api.readCacheValue('@offline/startup-config/v1'), 'offline-config');
    const lastInsert = h.state.events.lastIndexOf('insert');
    assert(h.state.events[lastInsert - 1].startsWith('delete:'), 'Evict before inserting at capacity');
    h.state.now += 31 * 86400_000;
    await h.api.prepareCacheStorage();
    assert.equal(await h.api.readCacheValue('query-519'), null);
    assert.equal(await h.api.readCacheValue('@offline/startup-config/v1'), 'offline-config');
  }
  // Byte budget and oversized snapshots (must not poison subsequent writes).
  {
    const h = harness();
    for (let i = 0; i < 8; i++) await h.api.writeCacheValue(`large-${i}`, 'я'.repeat(2_000_000));
    assert(h.sql.prepare('SELECT SUM(size_bytes) AS n FROM cache_entries').get().n <= 32 * 1024 * 1024);
    await h.api.writeCacheValue('oversized', 'x'.repeat(3_000_000));
    assert.equal(await h.api.readCacheValue('oversized'), null);
    await h.api.writeCacheValue('small', 'ok');
    assert.equal(await h.api.readCacheValue('small'), 'ok');
  }
  // Genuine SQLITE_FULL via SQLite's page quota: reclaim pages and retry once.
  {
    const h = harness();
    await h.api.writeCacheValue('@offline/startup-config/v1', 'offline');
    await h.api.writeCacheValue('old', 'x'.repeat(80_000));
    const pages = h.sql.prepare('PRAGMA page_count').get().page_count;
    h.sql.exec(`PRAGMA max_page_count = ${pages}`);
    await h.api.writeCacheValue('new', 'y'.repeat(60_000));
    assert.equal(await h.api.readCacheValue('old'), null);
    assert.equal((await h.api.readCacheValue('new')).length, 60_000);
    assert.equal(h.state.inserts, 4, 'Two initial writes + failed insert + successful retry');
    assert.equal(await h.api.readCacheValue('@offline/startup-config/v1'), 'offline');
  }
  // Unrecoverable capacity failure never escapes or retries indefinitely.
  {
    const h = harness({ localPlayersData: '[{"id":"1"}]', login: 'keep', outbox: 'keep', settings: 'keep' });
    h.state.failures = 100;
    await h.api.writeCacheValue('localPlayersData', '[{"id":"2"}]');
    await h.api.writeCacheValue('another', 'ignored');
    assert.equal(h.state.inserts, 2);
    assert.equal(await h.api.readCacheValue('localPlayersData'), '[{"id":"1"}]');
    await h.flush();
    assert.equal(h.legacy.get('login'), 'keep');
    assert.equal(h.legacy.get('outbox'), 'keep');
    assert.equal(h.legacy.get('settings'), 'keep');
  }
  // Migration preserves the source on failure and does not overwrite new data.
  {
    const h = harness({ localPlayersData: 'players', '@offline/games/v1/a': 'games', login: 'keep', outbox: 'keep' });
    await h.api.prepareCacheStorage();
    assert.equal(h.legacy.has('localPlayersData'), false);
    assert.equal(await h.api.readCacheValue('localPlayersData'), 'players');
    assert.deepEqual([...h.legacy.keys()], ['login', 'outbox']);
    h.legacy.set('localPlayersData', 'obsolete');
    await h.api.writeCacheValue('localPlayersData', 'fresh');
    h.legacy.set('localPlayersData', 'obsolete');
    await h.api.prepareCacheStorage();
    assert.equal(await h.api.readCacheValue('localPlayersData'), 'fresh');
  }
  // Cold cache failure still permits offline legacy reads.
  {
    const h = harness({ localPlayersData: 'legacy' });
    h.state.openFailure = true;
    assert.equal(await h.api.readCacheValue('localPlayersData'), 'legacy');
    await h.flush();
    assert.equal(h.legacy.get('localPlayersData'), 'legacy');
  }
  // Hung native operations have a finite deadline and no further writes queue.
  {
    const h = harness({ localPlayersData: 'offline' });
    h.state.hang = true;
    const write = h.api.writeCacheValue('localPlayersData', 'new');
    await h.expire();
    await write;
    assert.equal(await h.api.readCacheValue('localPlayersData'), 'offline');
    await h.api.writeCacheValue('another', 'ignored');
    assert.equal(h.state.inserts, 0);
    assert.equal(h.legacy.get('localPlayersData'), 'offline');
  }
  // Optional flags and consumers must succeed when durable caching fails.
  {
    const h = harness();
    h.state.legacyFailures = true;
    const flags = h.load('services/optionalStorage.ts');
    await flags.writeOptionalStorageValue('playersDataLoaded', 'true');
    assert.equal(await flags.readOptionalStorageValue('playersDataLoaded'), null);
    h.state.failures = 100;
    const persistent = h.load('services/persistentCache.ts');
    await persistent.writePersistentCache('game', { id: 1 });
    assert.equal(await persistent.readPersistentCache('game'), null);
  }
  // Player preparation remains usable even without either auxiliary store.
  {
    const h = harness();
    h.state.openFailure = true;
    h.state.legacyFailures = true;
    Object.assign(h.mocks, {
      'expo-file-system/legacy': { documentDirectory: 'file:///', getInfoAsync: async () => ({ exists: false }) },
      fflate: {}, buffer: {}, 'expo-asset': { Asset: {} }, './httpClient': {},
      '../assets/player-photos/seed-manifest.json': { default: { version: -1 } },
      '../assets/player-photos/generated': { PLAYER_PHOTO_ASSETS: {} },
      '../database/repository': {
        getReferenceVersion: async () => 1,
        loadPlayersFromDatabase: async () => [{ id: 7, name: 'Игрок', number: 7, metrics: {}, photo_url: '' }],
      },
      '../features/messenger/playerIdentity': { replaceMessengerPlayerNumbers() {} },
    });
    const { PlayerDownloadSystem } = h.load('services/playerDataService.ts');
    const playerService = new PlayerDownloadSystem();
    const players = await playerService.initializeFromDatabase(1, false);
    assert.equal(players[0].id, '7');
    assert.equal(await playerService.isDataLoaded(), true);
    assert.equal((await playerService.getPlayersFromStorage())[0].id, '7');
    const restarted = new PlayerDownloadSystem();
    assert.equal((await restarted.getPlayersFromStorage())[0].id, '7', 'Rebuild after restart from primary DB');
  }
  // Expo prebuild must emit the capacity property exactly once, including reruns.
  {
    let mod;
    const exports = {};
    vm.runInNewContext(fs.readFileSync('plugins/withAsyncStorageCapacity.js', 'utf8'), {
      module: exports, require: () => ({ withGradleProperties: (config, fn) => { mod = fn; return config; } }),
    });
    exports.exports({});
    const config = { modResults: [{ type: 'property', key: 'AsyncStorage_db_size_in_MB', value: '6' }] };
    mod(config); mod(config);
    assert.equal(config.modResults.length, 1);
    assert.equal(config.modResults[0].value, '64');
  }
  console.log('Cache capacity, real SQLITE_FULL recovery, migration, deadlines and offline player startup passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
