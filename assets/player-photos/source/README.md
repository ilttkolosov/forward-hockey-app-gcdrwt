# Исходные фотографии игроков

Основной источник встроенного набора — архив админки
`wp-content/uploads/app/player_photos_v{players_version}.zip`.
Команда синхронизации получает актуальную версию из `MobileAppConfig.txt`,
полностью заменяет содержимое этой папки файлами архива и обновляет манифест:

```bash
npm run photos:sync
```

Для проверки уже скачанного архива его путь можно передать скрипту напрямую:

```bash
node scripts/sync-player-photo-assets.mjs /path/to/player_photos_v28.zip
npm run photos:generate
```

Для ручной проверки допустимо поместить фотографии прямо в эту папку. Допустимые имена:

```text
player_5796.jpg
player_3022.png
player_5653.webp
```

Правила:

- число после `player_` — уникальный ID игрока из API;
- форматы: `.jpg`, `.jpeg`, `.png`, `.webp`;
- для одного ID допускается только один файл;
- не добавляйте подпапки и посторонние файлы;
- версия в `version.txt` должна совпадать с `players_version` в `MobileAppConfig.txt`.

Проверка имён и генерация статического asset-манифеста:

```bash
npm run photos:generate
```

Скрипт создаёт `assets/player-photos/generated.ts` с явными `require(...)`, поэтому Metro включает каждый файл непосредственно в APK/IPA. Упаковки и распаковки нет. Фотографии из этой папки должны быть добавлены в commit обычным способом.
