# Локальная база данных и синхронизация

## Цель

Приложение должно открываться на чистом устройстве без интернета и сразу содержать стартовый набор:

- команды и их логотипы;
- арены;
- игроки и их фото;
- лиги и сезоны;
- игры до 7 августа 2026 года;
- метаданные версий и курсор синхронизации.

## Выбор хранилища

Для справочников и матчей используется `expo-sqlite`. SQLite подходит лучше AsyncStorage, потому что даёт:

- атомарные транзакции;
- `UPSERT` по уникальному ID;
- индексы по дате, команде, сезону и лиге;
- быстрый локальный F2F без сетевого запроса;
- миграции схемы.

В сборку включается `assets/database/forward_seed.db`. При первом запуске он копируется в изменяемое хранилище приложения. Обновления никогда не меняют bundled asset напрямую.

## Схема SQLite

- `metadata(key PRIMARY KEY, value)` — версия схемы, дата seed и курсор синхронизации.
- `teams(id PRIMARY KEY, name, logo_url, logo_revision, updated_at)`.
- `venues(id PRIMARY KEY, name, address, updated_at)`.
- `players(id PRIMARY KEY, name, number, position, birth_date, metrics_json, photo_url, photo_revision, updated_at)`.
- `leagues(id PRIMARY KEY, name, updated_at)`.
- `seasons(id PRIMARY KEY, name, updated_at)`.
- `events(id PRIMARY KEY, title, event_date, venue_id, results_json, protocol_json, player_stats_json, updated_at)`.
- `event_teams(event_id, team_id, side, PRIMARY KEY(event_id, team_id))`.
- `event_leagues(event_id, league_id, PRIMARY KEY(event_id, league_id))`.
- `event_seasons(event_id, season_id, PRIMARY KEY(event_id, season_id))`.
- `sync_versions(entity PRIMARY KEY, version, synced_at)`.

Основные индексы: `events(event_date)`, `event_teams(team_id, event_id)` и составные индексы для экранов архива.

## Изображения

Фото и логотипы не хранятся BLOB-ами в SQLite. Для каждого ID источник выбирается в порядке:

1. скачанный актуальный файл в document directory;
2. встроенный asset из seed-набора;
3. placeholder.

Генератор seed создаёт также TypeScript-манифест `ID -> require(asset)`, чтобы Metro и EAS гарантированно включали файлы в сборку. Перед добавлением изображения приводятся к ограниченному размеру.

## Контракт API

### Пустая выборка

`GET /get-events` должен возвращать HTTP `200`:

```json
{"status":"success","data":[],"count":0}
```

HTTP `404` зарезервирован для несуществующего endpoint или конкретного ID, но не для пустого списка.

### Bootstrap

`Генератор seed` должен получать версионированный снимок:

`GET /bootstrap?schema=1&events_to=2026-08-07`

Ответ содержит `generated_at`, `schema_version`, `cursor`, `versions`, `teams`, `venues`, `players`, `leagues`, `seasons` и `events`. Для большого списка матчей допускается пагинация.

### Delta-обновление

`GET /changes?cursor=<opaque_cursor>&limit=500`

Ответ содержит:

- `next_cursor` и `has_more`;
- `upserts` по каждому типу данных;
- `deleted_ids` по каждому типу;
- версии наборов.

Все страницы delta применяются в одной SQLite-транзакции. Курсор меняется только после успешного commit.

## Локальный F2F

F2F выбирает матчи, в которых одновременно участвуют обе команды, исключает текущую игру и сортирует по дате по убыванию. Сеть для этого не нужна.

## Этапы внедрения

1. Исправить контракт пустого `/get-events` на сервере; клиентская совместимость уже добавлена.
2. Добавить `expo-sqlite`, миграции и слой repository.
3. Создать build-time генератор seed-базы и отчёт о размере данных/assets.
4. Подключить стартовую инициализацию и перенос данных из AsyncStorage.
5. Перевести экраны на SQLite через единый repository API.
6. Внедрить delta-синхронизацию и транзакционные upsert/delete.
7. Перевести F2F на локальный SQL-запрос.
8. После smoke-тестов удалить дублирующие legacy-кэши.
