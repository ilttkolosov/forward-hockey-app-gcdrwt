import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photosDir = path.join(projectRoot, 'assets', 'player-photos');
const sourceDir = path.join(photosDir, 'source');
const manifestPath = path.join(photosDir, 'seed-manifest.json');
const modulePath = path.join(photosDir, 'generated.ts');
const versionPath = path.join(sourceDir, 'version.txt');
const filenamePattern = /^player_(\d+)\.(jpe?g|png|webp)$/i;

async function main() {
  await fs.mkdir(sourceDir, { recursive: true });
  const version = Number((await fs.readFile(versionPath, 'utf8')).trim());
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('assets/player-photos/source/version.txt должен содержать целую версию игроков');
  }

  const filenames = (await fs.readdir(sourceDir))
    .filter(name => !['README.md', 'version.txt', '.gitkeep'].includes(name))
    .sort((left, right) => left.localeCompare(right, 'en'));
  const invalid = filenames.filter(name => !filenamePattern.test(name));
  if (invalid.length > 0) throw new Error(`Неверные имена фото: ${invalid.join(', ')}`);

  const ids = new Set();
  const photos = filenames.map(filename => {
    const [, id] = filename.match(filenamePattern);
    if (ids.has(id)) throw new Error(`Для игрока ${id} найдено больше одного фото`);
    ids.add(id);
    return { id, filename };
  });
  const generated = [
    '// Сгенерировано scripts/generate-player-photo-assets.mjs. Не редактировать вручную.',
    'export const PLAYER_PHOTO_ASSETS: Record<string, number> = {',
    ...photos.map(({ id, filename }) => `  '${id}': require('./source/${filename}'),`),
    '};',
    '',
  ].join('\n');
  await fs.writeFile(modulePath, generated);
  await fs.writeFile(manifestPath, `${JSON.stringify({ version, photos }, null, 2)}\n`);
  console.log('[Photos] Манифест встроенных assets обновлён:', { version, photos: photos.length });
  if (photos.length === 0) console.warn('[Photos] Папка source пока пуста');
}

main().catch(error => {
  console.error('[Photos] Ошибка генерации манифеста:', error);
  process.exitCode = 1;
});
