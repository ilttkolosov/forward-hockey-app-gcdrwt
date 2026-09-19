const { withGradleProperties } = require('expo/config-plugins');

// AsyncStorage 2.x otherwise caps RKStorage at 6 MiB, even on an empty disk.
// Keep headroom for upgrades while bulky caches move to forward-cache.db.
module.exports = config => withGradleProperties(config, modConfig => {
  const key = 'AsyncStorage_db_size_in_MB';
  modConfig.modResults = modConfig.modResults.filter(item => item.key !== key);
  modConfig.modResults.push({ type: 'property', key, value: '64' });
  return modConfig;
});
