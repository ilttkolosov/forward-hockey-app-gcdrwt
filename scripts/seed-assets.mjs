import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = path.join(projectRoot, 'assets', 'database');
const databasePath = path.join(databaseDir, 'forward_seed.db');
const partsDir = path.join(databaseDir, 'seed-parts');
const manifestPath = path.join(databaseDir, 'seed-manifest.json');
const chunkSize = 750_000;

function checksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function pack() {
  const database = await fs.readFile(databasePath);
  await fs.rm(partsDir, { recursive: true, force: true });
  await fs.mkdir(partsDir, { recursive: true });

  const parts = [];
  for (let offset = 0, index = 0; offset < database.length; offset += chunkSize, index += 1) {
    const name = `forward_seed.db.part${String(index).padStart(3, '0')}`;
    const chunk = database.subarray(offset, Math.min(offset + chunkSize, database.length));
    await fs.writeFile(path.join(partsDir, name), chunk);
    parts.push({ name, bytes: chunk.length, sha256: checksum(chunk) });
  }

  const manifest = {
    format: 1,
    database: 'forward_seed.db',
    bytes: database.length,
    sha256: checksum(database),
    parts,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('[Seed] Части обновлены:', { parts: parts.length, bytes: database.length, sha256: manifest.sha256 });
}

async function restore() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  try {
    const current = await fs.readFile(databasePath);
    if (current.length === manifest.bytes && checksum(current) === manifest.sha256) {
      console.log('[Seed] Локальная база уже актуальна');
      return;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const chunks = [];
  for (const part of manifest.parts) {
    const chunk = await fs.readFile(path.join(partsDir, part.name));
    if (chunk.length !== part.bytes || checksum(chunk) !== part.sha256) {
      throw new Error(`Повреждена часть seed-базы: ${part.name}`);
    }
    chunks.push(chunk);
  }

  const database = Buffer.concat(chunks);
  if (database.length !== manifest.bytes || checksum(database) !== manifest.sha256) {
    throw new Error('Не удалось подтвердить целостность восстановленной seed-базы');
  }
  await fs.writeFile(databasePath, database);
  console.log('[Seed] База восстановлена:', { bytes: database.length, sha256: manifest.sha256 });
}

const command = process.argv[2] ?? 'restore';
if (command === 'pack') await pack();
else if (command === 'restore') await restore();
else throw new Error(`Неизвестная команда seed-assets: ${command}`);
