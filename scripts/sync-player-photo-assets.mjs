import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(projectRoot, 'assets/player-photos/source');
const apiUrl = 'https://www.hc-forward.com/wp-json/app/v1/get-players-full';
const configUrl = 'https://www.hc-forward.com/wp-content/themes/marquee/inc/MobileAppConfig.txt';
const timeoutMs = 90_000;
const concurrency = 6;

function extension(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  throw new Error('ответ не является PNG, JPEG или WEBP');
}

function candidates(rawUrl) {
  const original = new URL(rawUrl);
  const secure = new URL(original);
  secure.protocol = 'https:';
  const cdn = new URL(`https://i0.wp.com/${original.hostname}${original.pathname}`);
  cdn.searchParams.set('w', '600');
  return [...new Set([cdn.toString(), secure.toString(), original.toString()])];
}

async function download(player) {
  let lastError;
  for (const url of candidates(player.photo_url)) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Forward-Hockey-App-Asset-Sync/1.0' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = extension(buffer);
      const destination = path.join(sourceDir, `player_${player.id}.${ext}`);
      const temporary = `${destination}.tmp-${process.pid}`;
      await fs.writeFile(temporary, buffer);
      await fs.rename(temporary, destination);
      await Promise.all(['jpg', 'jpeg', 'png', 'webp']
        .filter(candidate => candidate !== ext)
        .map(candidate => fs.rm(path.join(sourceDir, `player_${player.id}.${candidate}`), { force: true })));
      return buffer.length;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('не удалось скачать фотографию');
}

await fs.mkdir(sourceDir, { recursive: true });
const [playersResponse, configResponse] = await Promise.all([
  fetch(apiUrl, { signal: AbortSignal.timeout(timeoutMs) }),
  fetch(`${configUrl}?_t=${Date.now()}`, { signal: AbortSignal.timeout(timeoutMs) }),
]);
if (!playersResponse.ok || !configResponse.ok) throw new Error('Не удалось получить API игроков или startup-config');
const playersPayload = await playersResponse.json();
const configPayload = await configResponse.json();
const players = (playersPayload.data || []).filter(player => String(player.photo_url || '').trim());
const version = Number(configPayload.data?.data_versions?.players ?? configPayload.data?.players_version ?? 0);
if (!Number.isInteger(version) || version < 1) throw new Error(`Некорректная версия игроков: ${version}`);

let cursor = 0;
let bytes = 0;
const failures = [];
const worker = async () => {
  while (cursor < players.length) {
    const index = cursor++;
    const player = players[index];
    try {
      bytes += await download(player);
      console.log(`[Photos] ${index + 1}/${players.length}: ${player.name} (${player.id})`);
    } catch (error) {
      failures.push({ id: String(player.id), name: player.name, error: String(error) });
    }
  }
};
await Promise.all(Array.from({ length: Math.min(concurrency, players.length || 1) }, () => worker()));
if (failures.length) throw new Error(`Не скачано фотографий: ${JSON.stringify(failures)}`);
await fs.writeFile(path.join(sourceDir, 'version.txt'), `${version}\n`);
console.log('[Photos] Синхронизация завершена:', { players: playersPayload.data.length, photos: players.length, version, bytes });
