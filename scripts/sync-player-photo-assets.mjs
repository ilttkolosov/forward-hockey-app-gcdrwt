import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photosDir = path.join(projectRoot, 'assets', 'player-photos');
const sourceDir = path.join(photosDir, 'source');
const configUrl = 'https://www.hc-forward.com/wp-content/themes/marquee/inc/MobileAppConfig.txt';
const archiveBaseUrl = 'https://www.hc-forward.com/wp-content/uploads/app/player_photos_v';
const filenamePattern = /^player_(\d+)\.(jpe?g|png|webp)$/i;
const timeoutMs = 120_000;
const localArchivePath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : null;

function validateImage(filename, data) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
  const isWebp = Buffer.from(data.subarray(0, 4)).toString('ascii') === 'RIFF'
    && Buffer.from(data.subarray(8, 12)).toString('ascii') === 'WEBP';
  if ((extension === 'jpg' || extension === 'jpeg') && isJpeg) return;
  if (extension === 'png' && isPng) return;
  if (extension === 'webp' && isWebp) return;
  throw new Error(`Содержимое ${filename} не соответствует расширению файла`);
}

async function readPlayersVersion() {
  const response = await fetch(`${configUrl}?_t=${Date.now()}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Startup-config вернул HTTP ${response.status}`);
  const payload = await response.json();
  const version = Number(payload.data?.data_versions?.players ?? payload.data?.players_version ?? 0);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Некорректная версия игроков: ${version}`);
  }
  return version;
}

async function loadArchive(version) {
  if (localArchivePath) {
    return {
      archiveSource: localArchivePath,
      bytes: new Uint8Array(await fs.readFile(localArchivePath)),
    };
  }
  const archiveUrl = `${archiveBaseUrl}${version}.zip`;
  const response = await fetch(archiveUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Forward-Hockey-App-Asset-Sync/1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Архив фотографий вернул HTTP ${response.status}`);
  return { archiveSource: archiveUrl, bytes: new Uint8Array(await response.arrayBuffer()) };
}

async function replaceSourceDirectory(version, archiveBytes) {
  const entries = unzipSync(archiveBytes);
  const photos = new Map();
  for (const [archiveName, data] of Object.entries(entries)) {
    if (archiveName.endsWith('/')) continue;
    const filename = path.posix.basename(archiveName);
    const match = filenamePattern.exec(filename);
    if (!match) throw new Error(`Архив содержит неожиданный файл: ${archiveName}`);
    if (photos.has(match[1])) throw new Error(`Архив содержит несколько фотографий игрока ${match[1]}`);
    validateImage(filename, data);
    photos.set(match[1], { filename, data });
  }
  if (photos.size === 0) throw new Error('Архив фотографий игроков пуст');

  const stagingDir = path.join(photosDir, `source-staging-${process.pid}`);
  const backupDir = path.join(photosDir, `source-backup-${process.pid}`);
  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.rm(backupDir, { recursive: true, force: true });
  await fs.mkdir(stagingDir, { recursive: true });

  try {
    const readmePath = path.join(sourceDir, 'README.md');
    try {
      await fs.copyFile(readmePath, path.join(stagingDir, 'README.md'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    for (const { filename, data } of photos.values()) {
      await fs.writeFile(path.join(stagingDir, filename), data);
    }
    await fs.writeFile(path.join(stagingDir, 'version.txt'), `${version}\n`);

    await fs.rename(sourceDir, backupDir);
    try {
      await fs.rename(stagingDir, sourceDir);
    } catch (error) {
      await fs.rename(backupDir, sourceDir);
      throw error;
    }
    await fs.rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(stagingDir, { recursive: true, force: true });
    throw error;
  }

  return photos.size;
}

const version = await readPlayersVersion();
const { archiveSource, bytes } = await loadArchive(version);
const photos = await replaceSourceDirectory(version, bytes);
console.log('[Photos] Синхронизация из архива завершена:', {
  archiveSource,
  version,
  photos,
  archiveBytes: bytes.length,
});
