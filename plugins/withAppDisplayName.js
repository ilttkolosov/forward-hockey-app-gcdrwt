const { withStringsXml } = require('expo/config-plugins');

module.exports = (config, { displayName }) => {
  return withStringsXml(config, (modConfig) => {
    const strings = modConfig.modResults.resources.string || [];
    const appName = strings.find((item) => item.$?.name === 'app_name');

    if (appName) {
      appName._ = displayName;
    } else {
      strings.push({
        $: { name: 'app_name' },
        _: displayName,
      });
    }

    modConfig.modResults.resources.string = strings;
    return modConfig;
  });
};
