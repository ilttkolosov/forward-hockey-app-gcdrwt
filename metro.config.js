const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const { execFileSync } = require('node:child_process');
const path = require('path');

// Refresh the archive reference for builds that reuse installed dependencies.
execFileSync(process.execPath, [path.join(__dirname, 'scripts/player-distribution-assets.mjs'), 'restore'], { stdio: 'inherit' });

const config = getDefaultConfig(__dirname);

// expo-sqlite's browser worker imports its WebAssembly binary as an asset.
// Metro does not include `wasm` in every Expo CLI configuration by default.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}
if (!config.resolver.assetExts.includes('zip')) {
  config.resolver.assetExts.push('zip');
}

// Use turborepo to restore the cache when possible
config.cacheStores = [
    new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') }),
  ];

module.exports = config;
