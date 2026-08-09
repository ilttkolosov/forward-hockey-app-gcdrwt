# Черновой контракт Messenger API v1

Документ задаёт границы первой версии. Окончательным источником после создания серверного репозитория станет OpenAPI-схема и версионированный список WebSocket-событий.

## Общие правила

- REST base path: `/api/v1`.
- JSON в UTF-8; имена полей `snake_case`.
- Идентификаторы — UUID-строки.
- Даты — ISO 8601 в UTC.
- Авторизация: `Authorization: Bearer <access_token>`.
- Мутации клиента передают `Idempotency-Key`; сообщения дополнительно содержат постоянный `client_message_id`.
- Списки используют cursor pagination, а не номера страниц.
- Серверное время и `sync_cursor` возвращаются в ответе синхронизации.

Успешный ответ:

```json
{
  "data": {},
  "meta": {
    "request_id": "uuid"
  }
}
```

Ошибка:

```json
{
  "error": {
    "code": "room_write_forbidden",
    "message": "Недостаточно прав для отправки сообщения",
    "request_id": "uuid",
    "details": {}
  }
}
```

Клиент принимает решения по `code`, а не по тексту `message`.

## Регистрация и сессии

| Метод | Маршрут | Назначение |
| --- | --- | --- |
| `GET` | `/invites/{token}/preview` | Безопасное описание действующего приглашения без персональных данных |
| `POST` | `/auth/register` | Атомарно принять приглашение и создать учётную запись |
| `POST` | `/auth/login` | Создать сессию устройства |
| `POST` | `/auth/refresh` | Ротировать access/refresh tokens |
| `POST` | `/auth/logout` | Отозвать текущую сессию |
| `GET` | `/auth/sessions` | Список устройств пользователя |
| `DELETE` | `/auth/sessions/{id}` | Отозвать выбранное устройство |
| `POST` | `/auth/logout-all` | Отозвать все устройства |
| `DELETE` | `/account` | Запустить подтверждаемое удаление учётной записи |

`POST /auth/register` никогда не принимает произвольные роли от клиента. Итоговая область и роли берутся из серверной записи приглашения.

## Профиль и устройства

| Метод | Маршрут | Назначение |
| --- | --- | --- |
| `GET` | `/me` | Профиль, членства, роли и эффективные разрешения |
| `PATCH` | `/me/profile` | Отображаемое имя и разрешённые поля профиля |
| `POST` | `/me/avatar` | Начать загрузку аватара |
| `DELETE` | `/me/avatar` | Удалить аватар |
| `PUT` | `/devices/current/push-token` | Создать/обновить Expo push token устройства |
| `DELETE` | `/devices/current/push-token` | Отключить push token |
| `PATCH` | `/devices/current/preferences` | Настройки уведомлений и предпросмотра |

## Комнаты и синхронизация

| Метод | Маршрут | Назначение |
| --- | --- | --- |
| `GET` | `/rooms` | Доступные комнаты, последнее сообщение и unread count |
| `GET` | `/rooms/{id}` | Метаданные и эффективные действия пользователя |
| `GET` | `/rooms/{id}/members` | Разрешённый список участников |
| `GET` | `/rooms/{id}/messages?before=...` | История по cursor pagination |
| `POST` | `/rooms/{id}/read` | Обновить последний прочитанный серверный номер |
| `GET` | `/sync?cursor=...` | Изменения сообщений, реакций, комнат и доступа |

Каждая комната возвращает вычисленные флаги `can_read`, `can_write`, `can_send_media`, `can_react`, `can_moderate`. Эти флаги нужны интерфейсу, но не заменяют серверную проверку мутаций.

## Сообщения и реакции

| Метод | Маршрут | Назначение |
| --- | --- | --- |
| `POST` | `/rooms/{id}/messages` | Отправить текст/ответ с `client_message_id` |
| `PATCH` | `/messages/{id}` | Редактировать собственное разрешённое сообщение |
| `DELETE` | `/messages/{id}` | Удалить/скрыть сообщение по правилам |
| `PUT` | `/messages/{id}/reactions/{emoji}` | Добавить собственную реакцию |
| `DELETE` | `/messages/{id}/reactions/{emoji}` | Удалить собственную реакцию |
| `POST` | `/messages/{id}/report` | Создать жалобу |

Пример отправки:

```json
{
  "client_message_id": "0a565c94-1d5a-4cb9-a8b2-593135c04ccb",
  "text": "Тренировка начнётся на 15 минут раньше",
  "reply_to_message_id": null,
  "attachment_ids": []
}
```

Повтор этого запроса с тем же отправителем и `client_message_id` возвращает исходное сообщение и не создаёт дубликат.

## Медиа

| Метод | Маршрут | Назначение |
| --- | --- | --- |
| `POST` | `/media/uploads` | Создать временную авторизованную загрузку |
| `POST` | `/media/uploads/{id}/complete` | Зафиксировать окончание и поставить проверку в очередь |
| `GET` | `/media/{id}` | Получить состояние обработки/разрешённый URL |
| `DELETE` | `/media/{id}` | Отменить неприсоединённую загрузку |

Сообщение может ссылаться только на готовое вложение текущего пользователя, предназначенное для той же комнаты. До завершения проверки медиа не публикуется.

## Приглашения и администрирование

| Метод | Маршрут | Назначение |
| --- | --- | --- |
| `POST` | `/invites` | Создать приглашение в допустимой области |
| `GET` | `/invites` | Активные/использованные приглашения в доступной области |
| `DELETE` | `/invites/{id}` | Отозвать приглашение |
| `GET` | `/admin/users` | Поиск пользователей по разрешённой области |
| `PATCH` | `/admin/users/{id}/status` | Блокировка/разблокировка |
| `PUT` | `/admin/memberships/{id}/roles` | Назначение допустимых ролей |
| `GET` | `/admin/rooms` | Метаданные управляемых комнат |
| `PATCH` | `/admin/rooms/{id}` | Настройки комнаты без скрытого чтения истории |
| `GET` | `/admin/reports` | Очередь жалоб |
| `POST` | `/admin/reports/{id}/decision` | Журналируемое решение |
| `POST` | `/admin/moderation-grants` | Временный доступ с обязательной причиной |
| `GET` | `/admin/audit` | Разрешённая выборка журнала аудита |

## WebSocket

Соединение устанавливается после REST-аутентификации. После подключения клиент передаёт последний `sync_cursor`; при разрыве всё равно выполняет REST catch-up.

Серверные события:

- `message.created`, `message.updated`, `message.deleted`;
- `reaction.updated`;
- `receipt.updated`;
- `room.updated`, `room.membership_revoked`;
- `permissions.updated`;
- `session.revoked`;
- `media.ready`, `media.rejected`;
- `sync.required` — клиент обязан выполнить REST-синхронизацию.

Клиентские события ограничиваются необязательными краткоживущими состояниями, например `typing.start` и `typing.stop`. Отправка постоянных сообщений выполняется REST-мутацией для простой идемпотентности и повторов.

## Базовые коды ошибок

- `authentication_required`, `session_expired`, `session_revoked`;
- `invite_invalid`, `invite_expired`, `invite_used`, `invite_scope_forbidden`;
- `room_not_found`, `room_read_forbidden`, `room_write_forbidden`;
- `role_assignment_forbidden`, `membership_inactive`;
- `message_not_found`, `message_edit_window_expired`;
- `media_too_large`, `media_type_forbidden`, `media_processing_failed`;
- `rate_limit_exceeded`, `validation_failed`, `conflict`.

Объекты, к которым у пользователя нет доступа, по возможности отвечают одинаково с отсутствующими объектами, чтобы не раскрывать существование закрытых комнат и сообщений.
