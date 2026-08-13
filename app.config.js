// app.config.js
import fs from "node:fs";
import path from "node:path";

export default ({ config }) => {
  const localGoogleServicesPath = path.resolve(
    process.cwd(),
    "google-services.json",
  );
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync(localGoogleServicesPath)
      ? "./google-services.json"
      : undefined);
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  return {
    ...config,
    // Keep the native project/target name ASCII-only. The localized name shown
    // to users is restored per platform by withAppDisplayName below.
    name: "ForwardHockey14",
    slug: "Forward",
    version: "1.0.62",
    orientation: "portrait",
    icon: "./assets/icons/myIcon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/icons/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.aleksandrkolosov.forward2014",
      infoPlist: {
        CFBundleDisplayName: "ХК Форвард 14",
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/icons/myIcon.png",
        backgroundColor: "#ffffff",
      },
      // The chat composer must participate in the Activity resize when the
      // IME opens. Edge-to-edge currently prevents reliable adjustResize on
      // a number of Android 13-15 vendor firmwares and leaves the composer
      // underneath the keyboard.
      edgeToEdgeEnabled: false,
      softwareKeyboardLayoutMode: "resize",
      package: "com.kolosovaleksandr.Forward2014",
      ...(googleServicesFile ? { googleServicesFile } : {}),
      ...(googleMapsApiKey
        ? { config: { googleMaps: { apiKey: googleMapsApiKey } } }
        : {}),
      jsEngine: "hermes",
    },
    web: {
      favicon: "./assets/images/final_quest_240x240.png",
      bundler: "metro",
    },
    plugins: [
      "expo-font",
      "expo-router",
      "expo-web-browser",
      [
        "expo-notifications",
        {
          defaultChannel: "messenger",
          enableBackgroundRemoteNotifications: true,
        },
      ],
      "expo-secure-store",
      [
        "expo-camera",
        {
          cameraPermission:
            "Разрешите доступ к камере для сканирования QR-кода и отправки фотографий в мессенджере.",
          recordAudioAndroid: false,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Разрешите доступ к фотографиям для аватара и отправки медиа в мессенджере.",
          cameraPermission:
            "Разрешите доступ к камере для отправки фотографий в мессенджере.",
        },
      ],
      [
        "expo-media-library",
        {
          photosPermission:
            "Разрешите доступ к медиатеке для просмотра сохранённых вложений мессенджера.",
          savePhotosPermission:
            "Разрешите сохранять фотографии и видео из мессенджера в медиатеку.",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Разрешите доступ к геопозиции, чтобы отправлять своё местоположение в мессенджере.",
        },
      ],
      "react-native-compressor",
      [
        "./plugins/withAppMetrica.js",
        {
          apiKey: "2a2cbf5f-f609-4a7b-80c6-99ba84d59501",
        },
      ],
      [
        "./plugins/withAppDisplayName.js",
        {
          displayName: "ХК Форвард 14",
        },
      ],
    ],
    scheme: "natively",
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      runtimeFeatures: {
        // android.config is build-only and is not exposed through Constants.
        // Mirror only the safe boolean so JS never mounts Google MapView when
        // the native manifest was built without the required API key.
        androidGoogleMapsConfigured: Boolean(googleMapsApiKey),
      },
      eas: {
        projectId: "bfe76357-fffa-4dbf-b498-214a56573bcd",
      },
    },
  };
};
