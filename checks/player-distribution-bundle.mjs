import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const [exportDir, platform] = process.argv.slice(2);
assert(exportDir && platform, 'Pass the Expo export directory and platform');

const sources = new URL('../assets/player-photos/', import.meta.url);
const releases = fs.readdirSync(sources, { withFileTypes: true }).flatMap(entry => {
  const match = entry.isFile() && /^players_distribution_v([1-9]\d*)\.zip$/.exec(entry.name);
  return match ? [{ name: entry.name, version: Number(match[1]) }] : [];
});
const release = releases.sort((a, b) => b.version - a.version)[0];
if (!release) {
  console.log('No versioned player ZIP in this checkout');
  process.exit(0);
}

const expected = fs.readFileSync(new URL(release.name, sources));
const metadata = JSON.parse(fs.readFileSync(path.join(exportDir, 'metadata.json'), 'utf8'));
const assets = metadata.fileMetadata[platform].assets;
assert(
  assets.some(asset => asset.ext === 'zip' && fs.readFileSync(path.join(exportDir, asset.path)).equals(expected)),
  `${platform} bundle is missing the repository asset ${release.name}`,
);
console.log(`${platform} bundle contains ${release.name} with matching contents`);
