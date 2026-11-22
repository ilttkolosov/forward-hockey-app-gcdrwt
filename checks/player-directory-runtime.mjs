import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import initSqlJs from 'sql.js';
import ts from 'typescript';

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync('assets/database/forward_seed.db'));
const migration = JSON.parse(fs.readFileSync('database/migrations.json', 'utf8'));
const installedSchema = db.exec('PRAGMA user_version')[0].values[0][0];
db.run('PRAGMA foreign_keys=ON');
for (const item of migration.migrations) {
  if (item.version > installedSchema) db.run(item.sql);
}

const query = (sql, values) => {
  const statement = db.prepare(sql, values);
  try {
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
};
const connection = {
  getAllAsync: async (sql, ...values) => query(sql, values),
  getFirstAsync: async (sql, ...values) => query(sql, values)[0] || null,
  runAsync: async (sql, ...values) => db.run(sql, values),
  withExclusiveTransactionAsync: async operation => {
    db.run('BEGIN');
    try {
      await operation(connection);
      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  },
};
const exports = {};
const code = ts.transpileModule(fs.readFileSync('database/repository.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const dependencies = {
  'expo-sqlite': { openDatabaseAsync: async () => connection },
  './index': { DATABASE_NAME: 'test', migrateDatabase: async () => {} },
  './writeCoordinator': { enqueueDatabaseWrite: operation => operation() },
};
vm.runInNewContext(code, { exports, require: name => dependencies[name] });

const { mergePlayerDirectory, loadPlayersFromDatabase, loadCurrentPlayerIds, getReferenceVersion, getMetadata } = exports;
const originalCount = (await loadPlayersFromDatabase()).length;
assert.equal((await loadCurrentPlayerIds()).size, originalCount, 'Existing roster survives the schema migration');
const player = (id, name) => ({ id, name, number: 19, nationality: '', position: '', birth_date: '', metrics: {}, photo_url: '' });
const archive = { sha256: 'test-archive', generatedAt: '2099-01-01T00:00:00Z' };
await mergePlayerDirectory([player(435, 'Исторический игрок'), player(92001, 'Первый состав')], [92001], 30, archive);
assert.equal((await loadCurrentPlayerIds()).has('435'), false, 'Archive player excluded from the current roster');
assert.equal((await loadPlayersFromDatabase()).find(item => String(item.id) === '435').name, 'Исторический игрок');
assert.equal(await getMetadata('player_distribution_sha256'), archive.sha256);

await mergePlayerDirectory([player(92002, 'Новый игрок'), player(92001, 'Подмена имени')], [92002, 92001], 31);
await mergePlayerDirectory([player(92002, 'Подмена имени')], [92002], 32);
const players = await loadPlayersFromDatabase();
assert.equal(players.length, originalCount + 3);
assert.equal(players.find(item => item.id === 92001).name, 'Первый состав');
assert.equal(players.find(item => item.id === 92002).name, 'Новый игрок');
assert.equal((await loadCurrentPlayerIds()).has('92001'), false, 'A player can leave the roster and remain in historical games');

await mergePlayerDirectory([player(92003, 'Ещё один архивный игрок')], [92003], 30, { ...archive, sha256: 'older-archive' });
assert.equal(await getReferenceVersion('players'), 32);
assert.equal((await loadCurrentPlayerIds()).has('92002'), true, 'An older distribution keeps the newer current roster');
assert.equal((await loadPlayersFromDatabase()).some(item => item.id === 92003), true, 'An older distribution can restore a missing archived ID');
await mergePlayerDirectory([player(92004, 'Повторная установка')], [92004], 30, { ...archive, sha256: 'older-archive' });
assert.equal((await loadPlayersFromDatabase()).some(item => item.id === 92004), false, 'The same bundled archive is installed once');
assert.equal(db.exec('PRAGMA foreign_key_check').length, 0);
console.log('Player directory preserves archived IDs, current membership, existing rows and newer versions.');
