# Аналитика AppMetrica

## Цели и ограничения

AppMetrica используется для оценки востребованности функций, продуктовых
воронок и стабильности приложения. SDK автоматически собирает установки,
сессии, открытия приложения, крэши и технические сведения. Прикладной код не
дублирует эти события.

В пользовательские события запрещено передавать:

- тексты сообщений и поисковые запросы;
- имена, псевдонимы, e-mail и логины;
- ID пользователей, комнат, сообщений, матчей, команд и тренировок;
- push-токены, точные координаты и названия мест;
- произвольные серверные сообщения об ошибках.

`analyticsService` дополнительно отбрасывает опасные ключи и любые параметры,
заканчивающиеся на `_id`. Автоматический сбор геопозиции AppMetrica отключён.
Локальный ID установки на экране «О программе» в AppMetrica не отправляется.

## Словарь событий

Словарь намеренно ограничен четырьмя событиями. Новое действие предпочтительно
добавлять как значение `action`, а не как новое имя события.

| Событие | Назначение | Основные параметры |
| --- | --- | --- |
| `screen_view` | Навигация по всем экранам | `screen_name`, `messenger_role` |
| `schedule_action` | Использование расписания | `action`, `week_offset`, `direction`, `enabled`, `result`, `source`, `training_count` |
| `mobile_game_action` | Выбор, старт и завершение мини-игр | `game`, `action`, `mode`, `difficulty`, `level`, `result`, `moves`, `duration_seconds`, `new_record` |
| `messenger_action` | Основные сценарии мессенджера | `action`, `room_type`, `content_type`, `source`, `scope`, `filter_type`, `result_bucket`, `attachment_count`, `has_reply` |

Ошибки отправляются через `reportError` с постоянными идентификаторами. В
сообщение передаётся только класс ошибки, поэтому группы не дробятся и не
содержат пользовательские данные.

## Рекомендуемые отчёты

1. В отчёте **События** сохранить представление «Экраны»: событие
   `screen_view`, группировка по `screen_name`, дополнительный срез по версии
   приложения и `messenger_role`.
2. Сохранить представление «Расписание»: `schedule_action`, группировка сначала
   по `action`, затем по `result`/`source`. Отдельно контролировать долю
   `manual_refresh` с `cached_fallback`.
3. Сохранить представление «Мини-игры»: `mobile_game_action`, группировки по
   `game`, `action`, `result`, а для `five_in_row` — по `mode` и `difficulty`.
4. Сохранить представление «Мессенджер»: `messenger_action`, группировки по
   `action`, `room_type`, `content_type`, `source` и `messenger_role`.
5. Создать воронки:
   - `screen_view(messenger_rooms)` → `chat_opened` → `message_sent`;
   - `share_sheet_opened` → `share_sheet_sent`;
   - `screen_view(messenger_search)` → `search_completed(result=success)` →
     `search_result_opened`;
   - `mobile_game_action(selected)` → `started` → `completed` с фильтром по
     одному значению `game`;
   - `screen_view(schedule)` → `schedule_action(week_changed или
     manual_refresh)`.
6. В **Аудитории/Retention** сравнивать пользователей расписания, игр и
   мессенджера по наличию соответствующего события за 7 и 28 дней.
7. В **Крэшах и ошибках** контролировать crash-free users по версии приложения и
   отдельные группы `app_initialization_failed`, `schedule_refresh_failed`,
   `messenger_search_failed`, `messenger_media_send_failed` и
   `messenger_share_send_failed`.

Не следует вызывать `sendEventsBuffer()` после каждого действия: SDK сам
буферизует события, а частая принудительная отправка увеличивает расход батареи
и трафика.

## Настройки кабинета

- включить маскирование IP-адресов пользователей из ЕС;
- добавить AppMetrica в опубликованную политику конфиденциальности и принять
  договор обработки данных;
- добавить комментарии к четырём событиям в **Настройки → События**;
- дать аналитикам доступ только на чтение, если редактирование счётчика им не
  требуется;
- при тестировании фильтровать данные по версии приложения, чтобы не смешивать
  старую бессистемную схему с новой.

Документация: [React Native SDK](https://appmetrica.yandex.ru/docs/ru/sdk/react-native/analytics/react-native-operations),
[события](https://appmetrica.yandex.ru/docs/ru/data-collection/about-events),
[отчёты](https://appmetrica.yandex.ru/docs/ru/mobile-reports/),
[GDPR](https://appmetrica.yandex.ru/docs/ru/data-security/gdpr).
