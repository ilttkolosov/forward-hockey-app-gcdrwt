<?php
if (!defined('ABSPATH')) exit;

/**
 * Админка: Стартовая конфигурация для мобильного приложения
 * - Управление версиями данных
 * - Управление версиями приложения, синхронизацией и служебными режимами
 */

add_action('admin_menu', 'app_admin_startup_config_menu');
function app_admin_startup_config_menu() {
    add_menu_page(
        'Стартовая конфигурация',
        'Старт. конфигурация',
        'manage_options',
        'app-startup-config',
        'app_admin_startup_config_page',
        'dashicons-smartphone',
        90
    );
}

/**
 * Единый набор значений по умолчанию. Новые поля добавляются сюда без
 * необходимости вручную мигрировать уже сохранённую option.
 */
function app_startup_config_defaults() {
    return [
        'config_schema_version' => 2,
        'config_revision' => 1,
        'teams_version' => 1,
        'players_version' => 1,
        'venues_version' => 1,
        'leagues_version' => 1,
        'seasons_version' => 1,
        'tournaments_version' => 1,
        'league_id' => 0,
        'season_id' => 0,
        'tournamentsNow' => [],
        'tournamentsPast' => [],
        'app' => [
            'latest_version' => ['ios' => '1.0.58', 'android' => '1.0.58'],
            'minimum_supported_version' => ['ios' => '1.0.0', 'android' => '1.0.0'],
            'update_message' => 'Доступна новая версия приложения.',
            'app_store_url' => '',
            'google_play_url' => '',
            'android_download_url' => '',
        ],
        'api' => [
            'base_url' => home_url('/wp-json/app/v1'),
            'request_timeout_seconds' => 10,
        ],
        'sync' => [
            'historical_start_date' => '2026-08-01',
            'historical_delay_days' => 7,
            'event_chunk_days' => 180,
        ],
        'features' => [
            'push_notifications' => true,
            'live_scores' => true,
            'f2f' => true,
            'mobile_games' => true,
            'home_games' => true,
            'home_news' => true,
        ],
        'maintenance' => [
            'enabled' => false,
            'message' => '',
            'retry_after_seconds' => 300,
        ],
        'announcement' => [
            'enabled' => false,
            'id' => '',
            'title' => '',
            'message' => '',
            'url' => '',
        ],
    ];
}

function app_get_startup_config() {
    $stored = get_option('app_startup_config', []);
    $stored = is_array($stored) ? $stored : [];

    // Совместимость со старой структурой, где отдельной версии для этих
    // справочников не было. Начинаем их нумерацию с текущей teams_version,
    // чтобы уже установленное приложение не восприняло значение 1 как откат.
    $shared_reference_version = max(1, (int)($stored['teams_version'] ?? 1));
    foreach (['venues_version', 'leagues_version', 'seasons_version', 'tournaments_version'] as $key) {
        if (!array_key_exists($key, $stored)) {
            $stored[$key] = $shared_reference_version;
        }
    }

    return array_replace_recursive(app_startup_config_defaults(), $stored);
}

function app_sanitize_version_string($value, $fallback = '1.0.0') {
    $value = sanitize_text_field(wp_unslash((string)$value));
    return preg_match('/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/', $value) ? $value : $fallback;
}

function app_sanitize_iso_date($value, $fallback = '2026-08-01') {
    $value = sanitize_text_field(wp_unslash((string)$value));
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date && $date->format('Y-m-d') === $value ? $value : $fallback;
}

/**
 * Обновляет статический конфиг-файл MobileAppConfig.txt
 */
function update_mobile_app_config_file() {
    $config = app_get_startup_config();
    $config['generated_at'] = gmdate('c');
    $config['data_versions'] = [
        'teams' => (int)$config['teams_version'],
        'players' => (int)$config['players_version'],
        'venues' => (int)$config['venues_version'],
        'leagues' => (int)$config['leagues_version'],
        'seasons' => (int)$config['seasons_version'],
        'tournaments' => (int)$config['tournaments_version'],
    ];

    $data = ['status' => 'success', 'data' => $config];
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!$json) return false;

    $path = WP_CONTENT_DIR . '/themes/marquee/inc/MobileAppConfig.txt';
    $directory = dirname($path);
    if (!wp_mkdir_p($directory)) return false;

    $temporary_path = $path . '.tmp';
    if (file_put_contents($temporary_path, $json, LOCK_EX) === false) return false;
    if (!rename($temporary_path, $path)) {
        @unlink($temporary_path);
        return false;
    }
    return true;
}

/**
 * Возвращает текущее назначенное изображение опубликованных sp_player.
 * История из _xmlsf_image_attached намеренно не используется: актуальное
 * фото игрока определяется стандартным WordPress-полем _thumbnail_id.
 *
 * @return array|WP_Error
 */
function app_startup_config_get_players_for_archive() {
    global $wpdb;

    $player_ids = $wpdb->get_col(
        "SELECT p.ID
         FROM {$wpdb->posts} p
         WHERE p.post_type = 'sp_player'
           AND p.post_status = 'publish'
         ORDER BY p.ID ASC"
    );

    if (!is_array($player_ids) || !$player_ids) {
        return new WP_Error('players_not_found', 'В базе не найдены опубликованные игроки.');
    }

    $players = [];
    foreach ($player_ids as $player_id) {
        $player_id = absint($player_id);
        $attachment_id = get_post_thumbnail_id($player_id);
        if ($player_id < 1 || $attachment_id < 1) {
            continue;
        }

        // Берём уменьшенную версию того же актуального вложения, если WordPress
        // её создал. В противном случае используем оригинал.
        $photo_url = wp_get_attachment_image_url($attachment_id, 'medium');
        $original_url = wp_get_attachment_url($attachment_id);
        if (!$photo_url) {
            $photo_url = $original_url;
        }
        if (!$photo_url) {
            continue;
        }

        $players[] = [
            'id' => $player_id,
            'attachment_id' => $attachment_id,
            'photo_url' => $photo_url,
            'original_url' => $original_url ?: $photo_url,
        ];
    }

    return $players ?: new WP_Error(
        'player_photos_not_found',
        'У опубликованных игроков не найдены назначенные изображения (_thumbnail_id).'
    );
}

/**
 * Получает байты фотографии. Для файлов из uploads сначала используется
 * локальный путь, чтобы не выполнять HTTP-запрос к собственному сайту.
 *
 * @return string|WP_Error
 */
function app_startup_config_get_player_photo($photo_url) {
    $photo_url = esc_url_raw((string)$photo_url);
    if ($photo_url === '') {
        return new WP_Error('player_photo_empty_url', 'У фотографии отсутствует URL.');
    }

    $uploads = wp_get_upload_dir();
    $base_url = trailingslashit($uploads['baseurl']);
    if (strpos($photo_url, $base_url) === 0) {
        $relative_path = rawurldecode(substr($photo_url, strlen($base_url)));
        $candidate = wp_normalize_path(trailingslashit($uploads['basedir']) . ltrim($relative_path, '/'));
        $uploads_root = trailingslashit(wp_normalize_path($uploads['basedir']));

        if (strpos($candidate, $uploads_root) === 0 && is_readable($candidate) && is_file($candidate)) {
            $contents = file_get_contents($candidate);
            if ($contents !== false && $contents !== '') {
                return $contents;
            }
        }
    }

    $response = wp_safe_remote_get($photo_url, [
        'timeout' => 30,
        'redirection' => 3,
        'limit_response_size' => 15 * MB_IN_BYTES,
    ]);
    if (is_wp_error($response)) {
        return $response;
    }
    if ((int)wp_remote_retrieve_response_code($response) !== 200) {
        return new WP_Error(
            'player_photo_http_error',
            sprintf('Фотография вернула HTTP %d.', (int)wp_remote_retrieve_response_code($response))
        );
    }

    $body = wp_remote_retrieve_body($response);
    return $body !== '' ? $body : new WP_Error('player_photo_empty', 'Получен пустой файл фотографии.');
}

/**
 * Создаёт архив player_photos_v{version}.zip в wp-content/uploads/app.
 * Архив сначала формируется во временном файле и только затем атомарно
 * публикуется, поэтому приложение не скачает недописанный ZIP.
 *
 * @return array|WP_Error Массив с URL архива и количеством фотографий.
 */
function app_startup_config_build_player_photo_archive($version) {
    $version = max(1, (int)$version);
    if (!class_exists('ZipArchive')) {
        return new WP_Error('ziparchive_unavailable', 'На сервере недоступно PHP-расширение ZipArchive.');
    }

    $players = app_startup_config_get_players_for_archive();
    if (is_wp_error($players)) {
        return $players;
    }

    $uploads = wp_get_upload_dir();
    if (!empty($uploads['error'])) {
        return new WP_Error('uploads_unavailable', (string)$uploads['error']);
    }

    $archive_directory = trailingslashit($uploads['basedir']) . 'app';
    if (!wp_mkdir_p($archive_directory)) {
        return new WP_Error('archive_directory_failed', 'Не удалось создать каталог uploads/app.');
    }

    $archive_name = 'player_photos_v' . $version . '.zip';
    $archive_path = trailingslashit($archive_directory) . $archive_name;
    $temporary_path = $archive_path . '.tmp-' . wp_generate_password(12, false, false);
    $zip = new ZipArchive();
    $opened = $zip->open($temporary_path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    if ($opened !== true) {
        return new WP_Error('archive_open_failed', sprintf('Не удалось открыть временный ZIP (код %s).', (string)$opened));
    }

    $added = 0;
    $errors = [];
    $allowed_extensions = ['jpg', 'jpeg', 'png', 'webp'];

    foreach ($players as $player) {
        $player_id = isset($player['id']) ? absint($player['id']) : 0;
        $photo_url = isset($player['photo_url']) ? trim((string)$player['photo_url']) : '';
        if ($player_id < 1 || $photo_url === '') {
            continue;
        }

        $url_path = (string)wp_parse_url($photo_url, PHP_URL_PATH);
        $extension = strtolower((string)pathinfo($url_path, PATHINFO_EXTENSION));
        if (!in_array($extension, $allowed_extensions, true)) {
            $errors[] = sprintf('игрок %d: неподдерживаемое расширение %s', $player_id, $extension ?: 'без расширения');
            continue;
        }

        // photo_url уже указывает на medium-вариант именно текущего вложения.
        // Оригинал того же вложения остаётся безопасным fallback.
        $candidates = array_filter([
            $photo_url,
            isset($player['original_url']) ? (string)$player['original_url'] : '',
        ]);
        $photo = null;
        $last_error = null;
        foreach (array_unique($candidates) as $candidate_url) {
            $candidate = app_startup_config_get_player_photo($candidate_url);
            if (!is_wp_error($candidate)) {
                $photo = $candidate;
                break;
            }
            $last_error = $candidate;
        }
        if ($photo === null) {
            $errors[] = sprintf(
                'игрок %d: %s',
                $player_id,
                $last_error instanceof WP_Error ? $last_error->get_error_message() : 'фотография недоступна'
            );
            continue;
        }

        $entry_name = sprintf('player_%d.%s', $player_id, $extension);
        if (!$zip->addFromString($entry_name, $photo)) {
            $errors[] = sprintf('игрок %d: не удалось добавить файл в ZIP', $player_id);
            continue;
        }
        $added++;
    }

    $closed = $zip->close();
    if (!$closed || $added === 0 || $errors) {
        @unlink($temporary_path);
        if ($errors) {
            $details = implode('; ', array_slice($errors, 0, 5));
            if (count($errors) > 5) {
                $details .= sprintf('; и ещё %d', count($errors) - 5);
            }
            return new WP_Error('archive_incomplete', 'Архив не опубликован: ' . $details . '.');
        }
        return new WP_Error('archive_empty', 'Архив не опубликован: в него не добавлено ни одной фотографии.');
    }

    if (!rename($temporary_path, $archive_path)) {
        @unlink($temporary_path);
        return new WP_Error('archive_publish_failed', 'Не удалось опубликовать готовый архив фотографий.');
    }

    return [
        'count' => $added,
        'path' => $archive_path,
        'url' => trailingslashit($uploads['baseurl']) . 'app/' . $archive_name,
    ];
}

/**
 * Обработчик сохранения формы
 */
add_action('admin_init', 'app_admin_startup_config_save');
function app_admin_startup_config_save() {
    // Ручное пересоздание архива для текущей версии игроков.
    if (isset($_POST['app_generate_photos_zip'])) {
        if (!current_user_can('manage_options')) return;
        if (
            !isset($_POST['app_generate_photos_zip_nonce'])
            || !wp_verify_nonce($_POST['app_generate_photos_zip_nonce'], 'generate_photos_zip')
        ) {
            return;
        }

        $current_config = app_get_startup_config();
        $manual_result = app_startup_config_build_player_photo_archive((int)$current_config['players_version']);
        add_action('admin_notices', function() use ($manual_result) {
            if (is_wp_error($manual_result)) {
                echo '<div class="notice notice-error"><p>'
                    . esc_html('❌ Не удалось сформировать архив фотографий: ' . $manual_result->get_error_message())
                    . '</p></div>';
                return;
            }
            echo '<div class="notice notice-success is-dismissible"><p>'
                . esc_html(sprintf(
                    '✅ Архив фотографий сформирован: %d файлов (%s).',
                    (int)$manual_result['count'],
                    $manual_result['url']
                ))
                . '</p></div>';
        });
        return;
    }

    // Сохранение конфигурации
    if (!isset($_POST['app_startup_config_nonce']) || !wp_verify_nonce($_POST['app_startup_config_nonce'], 'app_startup_config_save')) {
        return;
    }
    if (!current_user_can('manage_options')) return;

    $old_config = app_get_startup_config();
    $new_version = max(1, (int)($_POST['players_version'] ?? 1));

    $config = [
        'config_schema_version' => 2,
        'config_revision' => max(1, (int)$old_config['config_revision'] + 1),
        'teams_version' => max(1, (int)($_POST['teams_version'] ?? 1)),
        'players_version' => $new_version,
        'venues_version' => max(1, (int)($_POST['venues_version'] ?? 1)),
        'leagues_version' => max(1, (int)($_POST['leagues_version'] ?? 1)),
        'seasons_version' => max(1, (int)($_POST['seasons_version'] ?? 1)),
        'tournaments_version' => max(1, (int)($_POST['tournaments_version'] ?? 1)),
        'league_id' => (int)($_POST['league_id'] ?? 0),
        'season_id' => (int)($_POST['season_id'] ?? 0),
        'tournamentsNow' => [],
        'tournamentsPast' => [],
        'app' => [
            'latest_version' => [
                'ios' => app_sanitize_version_string($_POST['latest_ios_version'] ?? '', $old_config['app']['latest_version']['ios']),
                'android' => app_sanitize_version_string($_POST['latest_android_version'] ?? '', $old_config['app']['latest_version']['android']),
            ],
            'minimum_supported_version' => [
                'ios' => app_sanitize_version_string($_POST['minimum_ios_version'] ?? '', $old_config['app']['minimum_supported_version']['ios']),
                'android' => app_sanitize_version_string($_POST['minimum_android_version'] ?? '', $old_config['app']['minimum_supported_version']['android']),
            ],
            'update_message' => sanitize_textarea_field(wp_unslash($_POST['update_message'] ?? '')),
            'app_store_url' => esc_url_raw(wp_unslash($_POST['app_store_url'] ?? '')),
            'google_play_url' => esc_url_raw(wp_unslash($_POST['google_play_url'] ?? '')),
            'android_download_url' => esc_url_raw(wp_unslash($_POST['android_download_url'] ?? '')),
        ],
        'api' => [
            'base_url' => esc_url_raw(wp_unslash($_POST['api_base_url'] ?? home_url('/wp-json/app/v1'))),
            'request_timeout_seconds' => min(60, max(3, (int)($_POST['request_timeout_seconds'] ?? 10))),
        ],
        'sync' => [
            'historical_start_date' => app_sanitize_iso_date($_POST['historical_start_date'] ?? '2026-08-01'),
            'historical_delay_days' => min(30, max(1, (int)($_POST['historical_delay_days'] ?? 7))),
            'event_chunk_days' => min(365, max(7, (int)($_POST['event_chunk_days'] ?? 180))),
        ],
        'features' => [
            'push_notifications' => !empty($_POST['feature_push_notifications']),
            'live_scores' => !empty($_POST['feature_live_scores']),
            'f2f' => !empty($_POST['feature_f2f']),
            'mobile_games' => !empty($_POST['feature_mobile_games']),
            'home_games' => !empty($_POST['feature_home_games']),
            'home_news' => !empty($_POST['feature_home_news']),
        ],
        'maintenance' => [
            'enabled' => !empty($_POST['maintenance_enabled']),
            'message' => sanitize_textarea_field(wp_unslash($_POST['maintenance_message'] ?? '')),
            'retry_after_seconds' => min(86400, max(30, (int)($_POST['maintenance_retry_after_seconds'] ?? 300))),
        ],
        'announcement' => [
            'enabled' => !empty($_POST['announcement_enabled']),
            'id' => sanitize_key(wp_unslash($_POST['announcement_id'] ?? '')),
            'title' => sanitize_text_field(wp_unslash($_POST['announcement_title'] ?? '')),
            'message' => sanitize_textarea_field(wp_unslash($_POST['announcement_message'] ?? '')),
            'url' => esc_url_raw(wp_unslash($_POST['announcement_url'] ?? '')),
        ],
    ];

    foreach (['tournamentsNow', 'tournamentsPast'] as $key) {
        if (!empty($_POST[$key])) {
            foreach ($_POST[$key] as $item) {
                if (!empty($item['id']) && !empty($item['name'])) {
                    $config[$key][] = [
                        'tournament_ID' => sanitize_text_field($item['id']),
                        'tournament_Name' => sanitize_text_field($item['name'])
                    ];
                }
            }
        }
    }

    $archive_result = null;
    if ($new_version > (int)$old_config['players_version']) {
        $archive_result = app_startup_config_build_player_photo_archive($new_version);
        if (is_wp_error($archive_result)) {
            add_action('admin_notices', function() use ($archive_result) {
                echo '<div class="notice notice-error"><p>'
                    . esc_html('❌ Конфигурация не сохранена. Не удалось создать архив фотографий: ' . $archive_result->get_error_message())
                    . '</p></div>';
            });
            return;
        }
    }

    update_option('app_startup_config', $config, false);
    $file_updated = update_mobile_app_config_file();

    add_action('admin_notices', function() use ($file_updated, $archive_result) {
        $class = $file_updated ? 'notice-success' : 'notice-warning';
        $message = $file_updated
            ? '✅ Конфигурация сохранена. MobileAppConfig.txt обновлён.'
            : '⚠️ Настройки сохранены, но MobileAppConfig.txt обновить не удалось.';
        if (is_array($archive_result)) {
            $message .= sprintf(
                ' Архив фотографий создан: %d файлов (%s).',
                (int)$archive_result['count'],
                $archive_result['url']
            );
        }
        echo '<div class="notice ' . esc_attr($class) . ' is-dismissible"><p>' . esc_html($message) . '</p></div>';
    });
}

/**
 * Админ-страница
 */
function app_admin_startup_config_page() {
    $config = app_get_startup_config();
    $uploads = wp_get_upload_dir();
    $archive_name = 'player_photos_v' . (int)$config['players_version'] . '.zip';
    $archive_path = trailingslashit($uploads['basedir']) . 'app/' . $archive_name;
    $archive_url = trailingslashit($uploads['baseurl']) . 'app/' . $archive_name;
    ?>
    <div class="wrap">
        <h1>Стартовая конфигурация для мобильного приложения</h1>

        <div style="background:#f9f9f9; padding:15px; margin-bottom:30px; border:1px solid #ddd;">
            <h2>📸 Архив фотографий игроков</h2>
            <p>
                При увеличении версии игроков архив создаётся автоматически:
                <code><?php echo esc_html($archive_name); ?></code>
            </p>
            <p class="description">
                Для каждого игрока используется текущее назначенное изображение WordPress (_thumbnail_id), а не исторические записи фотографий.
            </p>
            <form method="post" style="display:inline;">
                <?php wp_nonce_field('generate_photos_zip', 'app_generate_photos_zip_nonce'); ?>
                <input type="hidden" name="app_generate_photos_zip" value="1">
                <button type="submit" class="button button-primary"
                    onclick="return confirm('Пересоздать архив фотографий для текущей версии игроков?')">
                    Сформировать архив вручную
                </button>
            </form>
            <?php if (is_file($archive_path)): ?>
                <a href="<?php echo esc_url($archive_url); ?>" class="button" target="_blank" rel="noopener" style="margin-left:8px;">
                    Скачать текущий архив
                </a>
                <p class="description" style="margin-top:10px;">
                    Размер: <?php echo esc_html(size_format((int)filesize($archive_path))); ?>,
                    изменён: <?php echo esc_html(wp_date('d.m.Y H:i:s', (int)filemtime($archive_path))); ?>
                </p>
            <?php endif; ?>
        </div>

        <form method="post">
            <?php wp_nonce_field('app_startup_config_save', 'app_startup_config_nonce'); ?>
            <h2>Версии данных</h2>
            <table class="form-table">
                <tr>
                    <th scope="row">Версия данных команд</th>
                    <td>
                        <input type="number" name="teams_version" value="<?php echo esc_attr($config['teams_version']); ?>" min="1" style="width: 100px;">
                    </td>
                </tr>
                <tr>
                    <th scope="row">Версия данных игроков</th>
                    <td>
                        <input type="number" name="players_version" value="<?php echo esc_attr($config['players_version']); ?>" min="1" style="width: 100px;">
                        <p class="description">При увеличении версии будет создан архив <code>uploads/app/player_photos_v{version}.zip</code>, после чего приложение обновит данные и фотографии игроков.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Версия арен</th>
                    <td><input type="number" name="venues_version" value="<?php echo esc_attr($config['venues_version']); ?>" min="1" style="width:100px;"></td>
                </tr>
                <tr>
                    <th scope="row">Версия лиг</th>
                    <td><input type="number" name="leagues_version" value="<?php echo esc_attr($config['leagues_version']); ?>" min="1" style="width:100px;"></td>
                </tr>
                <tr>
                    <th scope="row">Версия сезонов</th>
                    <td><input type="number" name="seasons_version" value="<?php echo esc_attr($config['seasons_version']); ?>" min="1" style="width:100px;"></td>
                </tr>
                <tr>
                    <th scope="row">Версия списка турниров</th>
                    <td><input type="number" name="tournaments_version" value="<?php echo esc_attr($config['tournaments_version']); ?>" min="1" style="width:100px;"></td>
                </tr>
                <tr>
                    <th scope="row">ID лиги</th>
                    <td><input type="number" name="league_id" value="<?php echo esc_attr($config['league_id']); ?>" style="width: 100px;"></td>
                </tr>
                <tr>
                    <th scope="row">ID сезона</th>
                    <td><input type="number" name="season_id" value="<?php echo esc_attr($config['season_id']); ?>" style="width: 100px;"></td>
                </tr>
            </table>

            <h2>Версии мобильного приложения</h2>
            <p>Latest — версия, которую предлагается установить. Minimum — самая старая версия, которой разрешено продолжать работу.</p>
            <table class="form-table">
                <tr>
                    <th scope="row">iOS: latest / minimum</th>
                    <td>
                        <input type="text" name="latest_ios_version" value="<?php echo esc_attr($config['app']['latest_version']['ios']); ?>" placeholder="1.0.58" style="width:120px;">
                        <input type="text" name="minimum_ios_version" value="<?php echo esc_attr($config['app']['minimum_supported_version']['ios']); ?>" placeholder="1.0.58" style="width:120px;">
                    </td>
                </tr>
                <tr>
                    <th scope="row">Android: latest / minimum</th>
                    <td>
                        <input type="text" name="latest_android_version" value="<?php echo esc_attr($config['app']['latest_version']['android']); ?>" placeholder="1.0.58" style="width:120px;">
                        <input type="text" name="minimum_android_version" value="<?php echo esc_attr($config['app']['minimum_supported_version']['android']); ?>" placeholder="1.0.58" style="width:120px;">
                    </td>
                </tr>
                <tr>
                    <th scope="row">Сообщение об обновлении</th>
                    <td><textarea name="update_message" rows="2" class="large-text"><?php echo esc_textarea($config['app']['update_message']); ?></textarea></td>
                </tr>
                <tr><th scope="row">App Store URL</th><td><input type="url" name="app_store_url" value="<?php echo esc_attr($config['app']['app_store_url']); ?>" class="regular-text"></td></tr>
                <tr><th scope="row">Google Play URL</th><td><input type="url" name="google_play_url" value="<?php echo esc_attr($config['app']['google_play_url']); ?>" class="regular-text"></td></tr>
                <tr><th scope="row">Прямая ссылка на APK</th><td><input type="url" name="android_download_url" value="<?php echo esc_attr($config['app']['android_download_url']); ?>" class="regular-text"></td></tr>
            </table>

            <h2>API и синхронизация</h2>
            <table class="form-table">
                <tr><th scope="row">Базовый URL API</th><td><input type="url" name="api_base_url" value="<?php echo esc_attr($config['api']['base_url']); ?>" class="regular-text"></td></tr>
                <tr><th scope="row">Таймаут запроса, секунд</th><td><input type="number" name="request_timeout_seconds" value="<?php echo esc_attr($config['api']['request_timeout_seconds']); ?>" min="3" max="60"></td></tr>
                <tr><th scope="row">Начало пополняемого архива</th><td><input type="date" name="historical_start_date" value="<?php echo esc_attr($config['sync']['historical_start_date']); ?>"></td></tr>
                <tr><th scope="row">Задержка архива, дней</th><td><input type="number" name="historical_delay_days" value="<?php echo esc_attr($config['sync']['historical_delay_days']); ?>" min="1" max="30"><p class="description">Матчи моложе этого возраста продолжают загружаться из API.</p></td></tr>
                <tr><th scope="row">Размер порции матчей, дней</th><td><input type="number" name="event_chunk_days" value="<?php echo esc_attr($config['sync']['event_chunk_days']); ?>" min="7" max="365"></td></tr>
            </table>

            <h2>Функции и служебные режимы</h2>
            <table class="form-table">
                <tr><th scope="row">Доступные функции</th><td>
                    <?php foreach (['push_notifications' => 'Push', 'live_scores' => 'Live-счёт', 'f2f' => 'F2F', 'mobile_games' => 'Мобильные игры', 'home_games' => 'Текущие и прошедшие игры на главной', 'home_news' => 'Новости на главной'] as $key => $label): ?>
                        <label style="display:block;"><input type="checkbox" name="feature_<?php echo esc_attr($key); ?>" value="1" <?php checked(!empty($config['features'][$key])); ?>> <?php echo esc_html($label); ?></label>
                    <?php endforeach; ?>
                </td></tr>
                <tr><th scope="row">Технические работы</th><td><label><input type="checkbox" name="maintenance_enabled" value="1" <?php checked(!empty($config['maintenance']['enabled'])); ?>> Включить режим обслуживания</label></td></tr>
                <tr><th scope="row">Сообщение обслуживания</th><td><textarea name="maintenance_message" rows="2" class="large-text"><?php echo esc_textarea($config['maintenance']['message']); ?></textarea></td></tr>
                <tr><th scope="row">Повторить через, секунд</th><td><input type="number" name="maintenance_retry_after_seconds" value="<?php echo esc_attr($config['maintenance']['retry_after_seconds']); ?>" min="30" max="86400"></td></tr>
                <tr><th scope="row">Объявление</th><td><label><input type="checkbox" name="announcement_enabled" value="1" <?php checked(!empty($config['announcement']['enabled'])); ?>> Показывать объявление</label></td></tr>
                <tr><th scope="row">ID объявления</th><td><input type="text" name="announcement_id" value="<?php echo esc_attr($config['announcement']['id']); ?>"><p class="description">Меняйте ID, чтобы ранее закрытое объявление снова показалось.</p></td></tr>
                <tr><th scope="row">Заголовок объявления</th><td><input type="text" name="announcement_title" value="<?php echo esc_attr($config['announcement']['title']); ?>" class="regular-text"></td></tr>
                <tr><th scope="row">Текст объявления</th><td><textarea name="announcement_message" rows="3" class="large-text"><?php echo esc_textarea($config['announcement']['message']); ?></textarea></td></tr>
                <tr><th scope="row">Ссылка объявления</th><td><input type="url" name="announcement_url" value="<?php echo esc_attr($config['announcement']['url']); ?>" class="regular-text"></td></tr>
            </table>

            <h2>Текущие турниры</h2>
            <div id="tournaments-now">
                <?php foreach ($config['tournamentsNow'] as $index => $item): ?>
                    <div class="tournament-item">
                        <input type="text" name="tournamentsNow[<?php echo $index; ?>][id]" placeholder="ID" value="<?php echo esc_attr($item['tournament_ID']); ?>" style="width:120px;"> 
                        <input type="text" name="tournamentsNow[<?php echo $index; ?>][name]" placeholder="Название" value="<?php echo esc_attr($item['tournament_Name']); ?>" style="width:200px;">
                        <button type="button" class="button remove-tournament">Удалить</button>
                    </div>
                <?php endforeach; ?>
            </div>
            <button type="button" class="button" onclick="addTournament('tournaments-now')">+ Добавить</button>

            <h2>Прошедшие турниры</h2>
            <div id="tournaments-past">
                <?php foreach ($config['tournamentsPast'] as $index => $item): ?>
                    <div class="tournament-item">
                        <input type="text" name="tournamentsPast[<?php echo $index; ?>][id]" placeholder="ID" value="<?php echo esc_attr($item['tournament_ID']); ?>" style="width:120px;"> 
                        <input type="text" name="tournamentsPast[<?php echo $index; ?>][name]" placeholder="Название" value="<?php echo esc_attr($item['tournament_Name']); ?>" style="width:200px;">
                        <button type="button" class="button remove-tournament">Удалить</button>
                    </div>
                <?php endforeach; ?>
            </div>
            <button type="button" class="button" onclick="addTournament('tournaments-past')">+ Добавить</button>

            <?php submit_button('Сохранить конфигурацию'); ?>
        </form>
    </div>

    <script>
    function addTournament(containerId) {
        const container = document.getElementById(containerId);
        const items = container.querySelectorAll('.tournament-item');
        const newIndex = items.length;
        const type = containerId === 'tournaments-now' ? 'tournamentsNow' : 'tournamentsPast';
        const div = document.createElement('div');
        div.className = 'tournament-item';
        div.innerHTML = `
            <input type="text" name="${type}[${newIndex}][id]" placeholder="ID" style="width:120px;"> 
            <input type="text" name="${type}[${newIndex}][name]" placeholder="Название" style="width:200px;">
            <button type="button" class="button remove-tournament">Удалить</button>
        `;
        container.appendChild(div);
    }
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-tournament')) {
            e.target.closest('.tournament-item').remove();
        }
    });
    </script>
    <?php
}
