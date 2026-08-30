import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTeamLogoAssets } from './generate-team-logo-assets.mjs';

const API_URL = 'https://www.hc-forward.com/wp-json/app/v1/get-team';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logoDir = path.join(projectRoot, 'assets', 'logo');
const manifestPath = path.join(logoDir, 'seed-manifest.json');
const concurrency = 8;
const requestTimeoutMs = 90_000;

const detectExtension = buffer => {
  if (buffer.length >= 8
    && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
    return 'gif';
  }
  throw new Error('ответ не является поддерживаемым растровым изображением');
};

const normalizedCandidates = rawUrl => {
  const original = new URL(rawUrl);
  const secure = new URL(original);
  secure.protocol = 'https:';
  const imageCdn = new URL(`https://i0.wp.com/${original.hostname}${original.pathname}`);
  imageCdn.searchParams.set('w', '300');
  return [...new Set([imageCdn.toString(), secure.toString(), original.toString()])];
};

const downloadLogo = async team => {
  let lastError;
  for (const url of normalizedCandidates(team.logo_url)) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Forward-Hockey-App-Asset-Sync/1.0' },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const extension = detectExtension(buffer);
      const filename = `team_${team.id}.${extension}`;
      const destination = path.join(logoDir, filename);
      const temporary = `${destination}.tmp-${process.pid}`;
      await fs.writeFile(temporary, buffer);
      await fs.rename(temporary, destination);

      const possibleExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
      await Promise.all(possibleExtensions
        .filter(candidate => candidate !== extension)
        .map(candidate => fs.rm(path.join(logoDir, `team_${team.id}.${candidate}`), { force: true })));

      return {
        id: String(team.id),
        name: team.name,
        logo_url: team.logo_url,
        filename,
        bytes: buffer.length,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('не удалось скачать логотип');
};

async function main() {
  await fs.mkdir(logoDir, { recursive: true });
  console.log(`[Логотипы] Получение списка команд: ${API_URL}`);
  const response = await fetch(API_URL, {
    headers: { 'User-Agent': 'Forward-Hockey-App-Asset-Sync/1.0' },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`API команд вернул HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.status !== 'success' || !Array.isArray(payload.data)) {
    throw new Error('API команд вернул некорректный ответ');
  }

  const teamsWithLogos = payload.data.filter(team => String(team.logo_url || '').trim() !== '');
  const teamsWithoutLogos = payload.data
    .filter(team => String(team.logo_url || '').trim() === '')
    .map(team => ({ id: String(team.id), name: team.name }));
  const downloaded = [];
  const failures = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < teamsWithLogos.length) {
      const index = cursor++;
      const team = teamsWithLogos[index];
      try {
        const item = await downloadLogo(team);
        downloaded.push(item);
        console.log(`[Логотипы] ${index + 1}/${teamsWithLogos.length}: ${team.name} (${team.id})`);
      } catch (error) {
        const retainedFilename = (await fs.readdir(logoDir))
          .find(name => new RegExp(`^team_${team.id}\\.(png|jpe?g|webp|gif)$`, 'i').test(name));
        if (retainedFilename) {
          const stat = await fs.stat(path.join(logoDir, retainedFilename));
          downloaded.push({
            id: String(team.id),
            name: team.name,
            logo_url: team.logo_url,
            filename: retainedFilename,
            bytes: stat.size,
            retained: true,
          });
          console.warn(`[Логотипы] Сохранён встроенный файл ${team.name} (${team.id}):`, error);
        } else {
          failures.push({ id: String(team.id), name: team.name, error: String(error) });
          console.warn(`[Логотипы] Не скачан ${team.name} (${team.id}):`, error);
        }
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(concurrency, Math.max(1, teamsWithLogos.length)) },
    () => worker()
  ));
  downloaded.sort((left, right) => Number(left.id) - Number(right.id));

  await fs.writeFile(manifestPath, `${JSON.stringify({
    api_url: API_URL,
    downloaded_at: new Date().toISOString(),
    teams: downloaded,
    teams_without_logo: teamsWithoutLogos,
  }, null, 2)}\n`);
  await generateTeamLogoAssets();

  const totalBytes = downloaded.reduce((sum, item) => sum + item.bytes, 0);
  console.log('[Логотипы] Синхронизация завершена:', {
    teams: payload.data.length,
    downloaded: downloaded.length,
    withoutLogo: teamsWithoutLogos.length,
    megabytes: Number((totalBytes / 1024 / 1024).toFixed(2)),
  });
  if (failures.length > 0) {
    throw new Error(`Не удалось скачать ${failures.length} логотипов: ${JSON.stringify(failures)}`);
  }
}

main().catch(error => {
  console.error('[Логотипы] Ошибка синхронизации:', error);
  process.exitCode = 1;
});
