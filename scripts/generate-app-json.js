// scripts/generate-app-json.js
const fs = require('fs');
const path = require('path');

// Мокаем Expo config context
const mockConfigContext = {
  config: {
    // Это базовое содержимое app.json от Expo (минимум)
    name: 'ХК Форвард 14',
    slug: 'Forward',
    version: '1.0.56',
    sdkVersion: '51.0.0', // актуально для Expo SDK 51 (обновите, если используется другая)
  },
};

// Загружаем и выполняем app.config.js
const appConfigPath = path.resolve(__dirname, '../app.config.js');
let exportedConfig;

try {
  // Используем dynamic import + vm для изоляции, но проще — переопределим process.env временно
  const originalEnv = process.env.GOOGLE_SERVICES_JSON;
  process.env.GOOGLE_SERVICES_JSON = fs.readFileSync(
    path.resolve(__dirname, '../google-services.json'),
    'utf8'
  );

  // Импортируем как модуль
  const appConfigModule = require(appConfigPath);
  const configFunction = appConfigModule.default || appConfigModule;
  exportedConfig = configFunction(mockConfigContext);

  // Восстанавливаем env
  process.env.GOOGLE_SERVICES_JSON = originalEnv;
} catch (e) {
  console.error('❌ Не удалось обработать app.config.js:', e.message);
  process.exit(1);
}

// Убедимся, что googleServicesFile — строка с содержимым JSON
if (exportedConfig.android?.googleServicesFile && typeof exportedConfig.android.googleServicesFile === 'string') {
  // Если это уже путь — читаем файл, но у нас он уже подставлен как содержимое
  // Ничего не делаем — всё в порядке
} else {
  // На случай, если что-то пошло не так — читаем явно
  try {
    const googleServicesContent = fs.readFileSync(
      path.resolve(__dirname, '../google-services.json'),
      'utf8'
    );
    exportedConfig.android = exportedConfig.android || {};
    exportedConfig.android.googleServicesFile = googleServicesContent;
  } catch (err) {
    console.warn('⚠️ google-services.json не найден. Пропускаем.');
  }
}

// Пишем app.json
const outputPath = path.resolve(__dirname, '../app.json');
fs.writeFileSync(outputPath, JSON.stringify(exportedConfig, null, 2), 'utf8');

console.log('✅ app.json успешно сгенерирован из app.config.js');