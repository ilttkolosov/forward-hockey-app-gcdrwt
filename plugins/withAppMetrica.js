// plugins/withAppMetrica.js
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = (config, { apiKey }) => {
  return withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application || [];
    if (!Array.isArray(application)) {
      modConfig.modResults.manifest.application = [application];
    }
    const mainApp = modConfig.modResults.manifest.application[0] || {};
    mainApp.$ = mainApp.$ || {};
    mainApp['meta-data'] = mainApp['meta-data'] || [];
    const existingMeta = mainApp['meta-data'].find(
      (item) => item.$?.['android:name'] === 'yandex.metrica.APP_METRICA_API_KEY'
    );
    if (!existingMeta) {
      mainApp['meta-data'].push({
        $: {
          'android:name': 'yandex.metrica.APP_METRICA_API_KEY',
          'android:value': apiKey,
        },
      });
    }
    modConfig.modResults.manifest.application = [mainApp];
    return modConfig;
  });
};