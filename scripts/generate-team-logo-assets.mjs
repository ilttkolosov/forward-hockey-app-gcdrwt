import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logoDir = path.join(projectRoot, 'assets', 'logo');
const modulePath = path.join(logoDir, 'generated.ts');
const filenamePattern = /^team_(\d+)\.(jpe?g|png|webp|gif)$/i;
const ignoredFiles = new Set(['README.md', 'generated.ts', 'seed-manifest.json', '.gitkeep']);

export async function generateTeamLogoAssets() {
  await fs.mkdir(logoDir, { recursive: true });
  const entries = await fs.readdir(logoDir, { withFileTypes: true });
  const filenames = entries
    .filter(entry => entry.isFile() && !ignoredFiles.has(entry.name))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const invalid = filenames.filter(name => !filenamePattern.test(name));
  if (invalid.length > 0) {
    throw new Error(`Неверные файлы в assets/logo: ${invalid.join(', ')}`);
  }

  const ids = new Set();
  const logos = filenames.map(filename => {
    const match = filename.match(filenamePattern);
    const id = match[1];
    if (ids.has(id)) throw new Error(`Для команды ${id} найдено больше одного логотипа`);
    ids.add(id);
    return { id, filename };
  }).sort((left, right) => Number(left.id) - Number(right.id));

  const generated = [
    '// Сгенерировано scripts/generate-team-logo-assets.mjs. Не редактировать вручную.',
    'export const TEAM_LOGO_ASSETS: Record<string, number> = {',
    ...logos.map(({ id, filename }) => `  '${id}': require('./${filename}'),`),
    '};',
    '',
  ].join('\n');

  await fs.writeFile(modulePath, generated);
  console.log(`[Логотипы] Реестр встроенных assets обновлён: ${logos.length}`);
  return logos;
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  generateTeamLogoAssets().catch(error => {
    console.error('[Логотипы] Ошибка генерации реестра:', error);
    process.exitCode = 1;
  });
}
