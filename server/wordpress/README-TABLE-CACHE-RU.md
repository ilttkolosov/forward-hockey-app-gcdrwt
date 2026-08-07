# Быстрые турнирные таблицы SportPress

Расчёт таблицы по-прежнему выполняет SportPress через `[team_standings]`. Оптимизация не заменяет его SQL-запросом: результат материализуется в JSON, после чего обычные запросы обслуживаются без запуска WordPress.

## Файлы

- `forward-table-common.php` — общий генератор и работа с JSON-кэшем; корень WordPress.
- `forward-get-table-fast.php` — быстрый публичный обработчик; корень WordPress.
- `get-tables-endpoint.php` — замена текущего файла endpoint в теме.
- `htaccess-get-table-fast.txt` — правило маршрутизации, которое добавляется перед `# BEGIN WordPress`.
- `admin-startup-config-table-cache.patch` — изменения админки стартовой конфигурации; готовый обновлённый `admin-startup-config.php` сохранён отдельно.

## Установка без перерыва в работе

1. Сохраните резервные копии `.htaccess` и прежнего PHP endpoint.
2. Загрузите `forward-table-common.php` в корень сайта рядом с `wp-load.php`.
3. Замените прежний endpoint содержимым `get-tables-endpoint.php`. Подключение файла из `functions.php` менять не надо.
4. Прогрейте кэш через прежний REST URL, пока rewrite ещё не добавлен:

```powershell
$config = (Invoke-RestMethod 'https://www.hc-forward.com/wp-content/themes/marquee/inc/MobileAppConfig.txt').data
$ids = @($config.tournamentsNow + $config.tournamentsPast) |
    ForEach-Object { [string]$_.tournament_ID } |
    Sort-Object -Unique

$ids | ForEach-Object {
    $result = Invoke-RestMethod "https://www.hc-forward.com/wp-json/app/v1/get-table/$_"
    [PSCustomObject]@{ Id = $_; Rows = @($result.data).Count; Version = $result.version }
} | Format-Table -AutoSize
```

5. Убедитесь, что появились файлы `wp-content/cache/forward-mobile/tables/table-<ID>.json`.
6. Загрузите `forward-get-table-fast.php` в корень WordPress.
7. Добавьте правило из `htaccess-get-table-fast.txt` перед `# BEGIN WordPress`.
8. Проверьте несколько последовательных запросов. Заголовки должны содержать `X-Forward-Endpoint: standalone-table-cache-v1` и `X-Forward-Cache: hit`.

## Проверка скорости

```powershell
$url = 'https://www.hc-forward.com/wp-json/app/v1/get-table/5977'
1..5 | ForEach-Object {
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$url`?_probe=$([guid]::NewGuid())"
    $watch.Stop()
    $body = $response.Content | ConvertFrom-Json
    [PSCustomObject]@{
        Run          = $_
        Rows         = @($body.data).Count
        TotalMs      = [math]::Round($watch.Elapsed.TotalMilliseconds, 1)
        Cache        = $response.Headers['X-Forward-Cache']
        Endpoint     = $response.Headers['X-Forward-Endpoint']
        ServerTiming = $response.Headers['Server-Timing']
    }
} | Format-Table -AutoSize
```

Первый запрос после истечения TTL или изменения версии может занимать прежние 1,7–2,0 секунды: он пересчитывает таблицу через SportPress. Последующие запросы читают готовый JSON.

TTL задаётся полем `api.tournament_table_cache_ttl_seconds` в `MobileAppConfig.txt`, по умолчанию 300 секунд. Сохранение записи `sp_event` или `sp_table` автоматически увеличивает `tournaments_version`, поэтому следующий запрос гарантированно пересчитает кэш.

## Откат

Удалите только правило `get-table` из `.htaccess`. Запросы немедленно вернутся к WordPress REST endpoint. Файлы JSON можно оставить: они не влияют на сайт без rewrite.
