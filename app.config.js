// app.config.js
import fs from 'node:fs';
import path from 'node:path';

export default ({ config }) => {
  const localGoogleServicesPath = path.resolve(process.cwd(), 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
    || (fs.existsSync(localGoogleServicesPath) ? './google-services.json' : undefined);

  return {
    ...config,
    name: 'ХК Форвард 14',
    slug: 'Forward',
    version: '1.0.58',
    orientation: 'portrait',
    icon: './assets/icons/myIcon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/icons/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.aleksandrkolosov.forward2014',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/icons/myIcon.png',
        backgroundColor: '#ffffffff',
      },
      edgeToEdgeEnabled: true,
      package: 'com.kolosovaleksandr.Forward2014',
      ...(googleServicesFile ? { googleServicesFile } : {}),
      jsEngine: 'hermes',
    },
    web: {
      favicon: './assets/images/final_quest_240x240.png',
      bundler: 'metro',
    },
    plugins: [
      'expo-font',
      'expo-router',
      'expo-web-browser',
      'expo-notifications',
      ['./plugins/withAppMetrica.js', {
        apiKey: '2a2cbf5f-f609-4a7b-80c6-99ba84d59501',
      }],
    ],
    scheme: 'natively',
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: 'bfe76357-fffa-4dbf-b498-214a56573bcd',
      },
    },
  };
};
