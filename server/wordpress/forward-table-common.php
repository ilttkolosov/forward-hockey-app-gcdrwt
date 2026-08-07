<?php
/**
 * Общая логика материализации турнирных таблиц мобильного приложения.
 *
 * При установке файл должен находиться в корне WordPress рядом с wp-load.php.
 * Функции определения путей намеренно используют __DIR__, чтобы чтение готового
 * кэша не требовало загрузки WordPress.
 */

if (!function_exists('forward_mobile_table_config_path')) {
    function forward_mobile_table_config_path() {
        return __DIR__ . '/wp-content/themes/marquee/inc/MobileAppConfig.txt';
    }
}

if (!function_exists('forward_mobile_table_cache_directory')) {
    function forward_mobile_table_cache_directory() {
        return __DIR__ . '/wp-content/cache/forward-mobile/tables';
    }
}

if (!function_exists('forward_mobile_table_cache_path')) {
    function forward_mobile_table_cache_path($table_id) {
        return forward_mobile_table_cache_directory() . '/table-' . (int)$table_id . '.json';
    }
}

if (!function_exists('forward_mobile_read_startup_config')) {
    function forward_mobile_read_startup_config() {
        $path = forward_mobile_table_config_path();
        $json = @file_get_contents($path);
        if ($json === false) return [];
        $payload = json_decode($json, true);
        return is_array($payload) && isset($payload['data']) && is_array($payload['data'])
            ? $payload['data']
            : [];
    }
}

if (!function_exists('forward_mobile_table_expected_version')) {
    function forward_mobile_table_expected_version() {
        $config = forward_mobile_read_startup_config();
        $nested = isset($config['data_versions']['tournaments'])
            ? (int)$config['data_versions']['tournaments']
            : 0;
        return max(0, $nested ?: (int)($config['tournaments_version'] ?? 0));
    }
}

if (!function_exists('forward_mobile_table_cache_ttl')) {
    function forward_mobile_table_cache_ttl() {
        $config = forward_mobile_read_startup_config();
        $value = (int)($config['api']['tournament_table_cache_ttl_seconds'] ?? 300);
        return min(86400, max(30, $value));
    }
}

if (!function_exists('forward_mobile_read_table_cache')) {
    function forward_mobile_read_table_cache($table_id) {
        $path = forward_mobile_table_cache_path($table_id);
        $raw = @file_get_contents($path);
        if ($raw === false) return null;
        $payload = json_decode($raw, true);
        if (!is_array($payload) || ($payload['status'] ?? '') !== 'success' || !isset($payload['data'])) {
            return null;
        }
        return [
            'payload' => $payload,
            'raw' => $raw,
            'modified_at' => (int)(@filemtime($path) ?: 0),
        ];
    }
}

if (!function_exists('forward_mobile_table_cache_is_fresh')) {
    function forward_mobile_table_cache_is_fresh($cache, $expected_version, $ttl) {
        if (!is_array($cache) || !isset($cache['payload'])) return false;
        $cache_version = (int)($cache['payload']['version'] ?? 0);
        if ($expected_version > 0 && $cache_version !== (int)$expected_version) return false;
        return (int)$cache['modified_at'] >= time() - (int)$ttl;
    }
}

if (!function_exists('forward_mobile_table_normalize_heading')) {
    function forward_mobile_table_normalize_heading($value) {
        $value = str_replace("\xC2\xA0", ' ', trim((string)$value));
        return preg_replace('/\s+/u', ' ', $value);
    }
}

if (!function_exists('forward_mobile_table_header_map')) {
    function forward_mobile_table_header_map() {
        return [
            'Поз.' => 'position',
            'Поз' => 'position',
            'Команда' => 'team_name',
            'Иг' => 'games',
            'И' => 'games',
            'В' => 'wins',
            'П' => 'losses',
            'Н' => 'draws',
            'ОтВ' => 'overtime_wins',
            'ОтП' => 'overtime_losses',
            'Оч' => 'points_2x',
            'О' => 'points_3x',
            'Заб' => 'goals_for',
            'Проп' => 'goals_against',
            'Kf' => 'coefficient',
            '+/-' => 'goal_diff',
            'ГолБ' => 'ppg',
            'КолБ' => 'ppo',
            'Pб%' => 'ppg_percent',
            'Рб%' => 'ppg_percent',
            '%Б' => 'ppg_percent',
            'ГолПМ' => 'ppa',
            'КолМ' => 'ppoa',
            'Нб%' => 'pkpercent',
            'Нм%' => 'pkpercent',
            '%М' => 'pkpercent',
        ];
    }
}

if (!function_exists('forward_mobile_table_extract_slug')) {
    function forward_mobile_table_extract_slug($href) {
        if (!$href) return '';
        $path = function_exists('wp_parse_url')
            ? wp_parse_url($href, PHP_URL_PATH)
            : parse_url($href, PHP_URL_PATH);
        if (!$path) return '';
        return rawurldecode(basename(rtrim($path, '/')));
    }
}

if (!function_exists('forward_mobile_table_resolve_teams')) {
    function forward_mobile_table_resolve_teams(&$data) {
        global $wpdb;
        $slugs = [];
        $names = [];
        foreach ($data as $row) {
            if (!empty($row['_team_slug'])) $slugs[$row['_team_slug']] = true;
            if (!empty($row['team_name'])) $names[$row['team_name']] = true;
        }
        if (!$slugs && !$names) return;

        $conditions = [];
        $arguments = [];
        if ($slugs) {
            $values = array_keys($slugs);
            $conditions[] = 'post_name IN (' . implode(',', array_fill(0, count($values), '%s')) . ')';
            $arguments = array_merge($arguments, $values);
        }
        if ($names) {
            $values = array_keys($names);
            $conditions[] = 'post_title IN (' . implode(',', array_fill(0, count($values), '%s')) . ')';
            $arguments = array_merge($arguments, $values);
        }

        $sql = "SELECT ID, post_name, post_title FROM {$wpdb->posts} "
            . "WHERE post_type = 'sp_team' AND post_status NOT IN ('trash', 'auto-draft') "
            . 'AND (' . implode(' OR ', $conditions) . ')';
        $prepared = $wpdb->prepare($sql, $arguments);
        $posts = $wpdb->get_results($prepared, ARRAY_A);
        $by_slug = [];
        $by_name = [];
        foreach ($posts as $post) {
            $by_slug[(string)$post['post_name']] = (string)$post['ID'];
            $by_name[(string)$post['post_title']] = (string)$post['ID'];
        }

        foreach ($data as &$row) {
            if (!empty($row['team_id'])) continue;
            $slug = (string)($row['_team_slug'] ?? '');
            $name = (string)($row['team_name'] ?? '');
            $row['team_id'] = $by_slug[$slug] ?? $by_name[$name] ?? '';
        }
        unset($row);
    }
}

if (!function_exists('forward_mobile_build_table_payload')) {
    function forward_mobile_build_table_payload($table_id) {
        $started_at = microtime(true);
        $table_id = (int)$table_id;
        if (!$table_id) return new WP_Error('invalid_id', 'Некорректный ID таблицы', ['status' => 400]);
        if (get_post_type($table_id) !== 'sp_table') {
            return new WP_Error('table_not_found', 'Турнирная таблица не найдена', ['status' => 404]);
        }

        $terms_started_at = microtime(true);
        $leagues = wp_get_object_terms($table_id, 'sp_league', ['fields' => 'ids']);
        $seasons = wp_get_object_terms($table_id, 'sp_season', ['fields' => 'ids']);
        if (is_wp_error($leagues)) return $leagues;
        if (is_wp_error($seasons)) return $seasons;
        $league_id = !empty($leagues) ? (int)$leagues[0] : 0;
        $season_id = !empty($seasons) ? (int)$seasons[0] : 0;
        $terms_ms = (microtime(true) - $terms_started_at) * 1000;

        $shortcode_started_at = microtime(true);
        $shortcode = '[team_standings id="' . $table_id
            . '" show_team_logo="1" show_published_events="1" show_future_events="1"'
            . ' show_full_table_link="0"]';
        $html = do_shortcode($shortcode);
        $shortcode_ms = (microtime(true) - $shortcode_started_at) * 1000;
        if (!$html || strpos($html, '<table') === false) {
            return new WP_Error('no_table_html', 'Не удалось получить HTML таблицы', ['status' => 404]);
        }
        if (!class_exists('DOMDocument')) {
            return new WP_Error('dom_extension_missing', 'На сервере отсутствует расширение DOM', ['status' => 500]);
        }

        $parse_started_at = microtime(true);
        $previous_libxml_state = libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        $dom->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($previous_libxml_state);
        $table = $dom->getElementsByTagName('table')->item(0);
        if (!$table) return new WP_Error('no_table_element', 'Элемент <table> не найден', ['status' => 404]);
        $rows = $table->getElementsByTagName('tr');
        if ($rows->length < 1) {
            return new WP_Error('no_table_rows', 'В таблице отсутствует строка заголовков', ['status' => 500]);
        }

        $headers = [];
        $header_map = forward_mobile_table_header_map();
        $header_cells = $rows->item(0)->getElementsByTagName('th');
        foreach ($header_cells as $index => $cell) {
            $raw = forward_mobile_table_normalize_heading($cell->nodeValue);
            $headers[] = $header_map[$raw] ?? ('column_' . $index);
        }

        $data = [];
        for ($index = 1; $index < $rows->length; $index++) {
            $row = $rows->item($index);
            $cells = $row->getElementsByTagName('td');
            if ($cells->length === 0) continue;
            $row_data = ['team_id' => ''];
            $row_class = $row->getAttribute('class');
            if (preg_match('/(?:^|\s)(?:team|post)-(\d+)(?:\s|$)/', $row_class, $matches)) {
                $row_data['team_id'] = (string)$matches[1];
            }

            for ($column = 0; $column < $cells->length; $column++) {
                if (!isset($headers[$column])) continue;
                $cell = $cells->item($column);
                $key = $headers[$column];
                $value = forward_mobile_table_normalize_heading($cell->nodeValue);
                if ($key === 'team_name') {
                    $links = $cell->getElementsByTagName('a');
                    if ($links->length > 0) {
                        $href = $links->item(0)->getAttribute('href');
                        if (preg_match('/[?&](?:p|post)=(\d+)/', $href, $matches)) {
                            $row_data['team_id'] = (string)$matches[1];
                        }
                        $row_data['_team_slug'] = forward_mobile_table_extract_slug($href);
                    }
                }
                $row_data[$key] = $value;
            }

            $points = $row_data['points_3x'] ?? $row_data['points_2x'] ?? '0';
            $row_data['points_2x'] = (string)(int)trim((string)$points);
            unset($row_data['points_3x']);
            $data[] = $row_data;
        }

        forward_mobile_table_resolve_teams($data);
        $defaults = [
            'position' => '', 'team_id' => '', 'team_name' => '', 'games' => '0',
            'wins' => '0', 'losses' => '0', 'draws' => '0', 'overtime_wins' => '0',
            'overtime_losses' => '0', 'points_2x' => '0', 'goals_for' => '0',
            'goals_against' => '0', 'coefficient' => '', 'goal_diff' => '0',
            'ppg' => '0', 'ppo' => '0', 'ppg_percent' => '0', 'ppa' => '0',
            'ppoa' => '0', 'pkpercent' => '0',
        ];
        $unresolved_teams = 0;
        foreach ($data as &$row_data) {
            unset($row_data['_team_slug']);
            $row_data = array_merge($defaults, $row_data);
            if ($row_data['team_id'] === '') $unresolved_teams++;
        }
        unset($row_data);
        $parse_ms = (microtime(true) - $parse_started_at) * 1000;

        $payload = [
            'status' => 'success',
            'schema_version' => 1,
            'version' => forward_mobile_table_expected_version(),
            'generated_at' => gmdate('c'),
            'table_id' => $table_id,
            'league_id' => $league_id,
            'season_id' => $season_id,
            'data' => $data,
        ];
        if ($unresolved_teams > 0) $payload['unresolved_teams'] = $unresolved_teams;

        $GLOBALS['forward_mobile_table_timings'] = [
            'terms' => $terms_ms,
            'shortcode' => $shortcode_ms,
            'parse' => $parse_ms,
            'total' => (microtime(true) - $started_at) * 1000,
        ];
        return $payload;
    }
}

if (!function_exists('forward_mobile_write_table_cache')) {
    function forward_mobile_write_table_cache($table_id, $payload) {
        $directory = forward_mobile_table_cache_directory();
        $created = is_dir($directory)
            || (function_exists('wp_mkdir_p') ? wp_mkdir_p($directory) : @mkdir($directory, 0755, true));
        if (!$created) return false;
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) return false;
        $path = forward_mobile_table_cache_path($table_id);
        $temporary_path = $path . '.tmp.' . getmypid();
        if (@file_put_contents($temporary_path, $json, LOCK_EX) === false) return false;
        @chmod($temporary_path, 0644);
        if (!@rename($temporary_path, $path)) {
            @unlink($temporary_path);
            return false;
        }
        return true;
    }
}

if (!function_exists('forward_mobile_get_or_build_table')) {
    function forward_mobile_get_or_build_table($table_id) {
        $expected_version = forward_mobile_table_expected_version();
        $cache = forward_mobile_read_table_cache($table_id);
        if (forward_mobile_table_cache_is_fresh($cache, $expected_version, forward_mobile_table_cache_ttl())) {
            $GLOBALS['forward_mobile_table_cache_source'] = 'hit';
            return $cache['payload'];
        }
        $payload = forward_mobile_build_table_payload($table_id);
        if (is_wp_error($payload)) return $payload;
        if (!forward_mobile_write_table_cache($table_id, $payload)) {
            return new WP_Error('cache_write_failed', 'Не удалось сохранить кэш таблицы', ['status' => 500]);
        }
        $GLOBALS['forward_mobile_table_cache_source'] = 'generated';
        return $payload;
    }
}

if (!function_exists('forward_mobile_table_server_timing')) {
    function forward_mobile_table_server_timing($extra = []) {
        $timings = array_merge($extra, $GLOBALS['forward_mobile_table_timings'] ?? []);
        $parts = [];
        foreach ($timings as $name => $duration) {
            $parts[] = preg_replace('/[^a-z0-9_-]/i', '', $name) . ';dur=' . number_format((float)$duration, 3, '.', '');
        }
        return implode(', ', $parts);
    }
}

if (!function_exists('forward_mobile_update_static_tournament_version')) {
    function forward_mobile_update_static_tournament_version($version, $revision) {
        $path = forward_mobile_table_config_path();
        $raw = @file_get_contents($path);
        $payload = $raw === false ? null : json_decode($raw, true);
        if (!is_array($payload) || !isset($payload['data']) || !is_array($payload['data'])) return false;
        $payload['data']['tournaments_version'] = (int)$version;
        $payload['data']['config_revision'] = (int)$revision;
        $payload['data']['generated_at'] = gmdate('c');
        if (!isset($payload['data']['data_versions']) || !is_array($payload['data']['data_versions'])) {
            $payload['data']['data_versions'] = [];
        }
        $payload['data']['data_versions']['tournaments'] = (int)$version;
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) return false;
        $temporary_path = $path . '.tmp';
        if (@file_put_contents($temporary_path, $json, LOCK_EX) === false) return false;
        if (!@rename($temporary_path, $path)) {
            @unlink($temporary_path);
            return false;
        }
        return true;
    }
}

if (!function_exists('forward_mobile_bump_tournament_version')) {
    function forward_mobile_bump_tournament_version() {
        static $already_bumped = false;
        if ($already_bumped || !function_exists('get_option')) return false;
        $already_bumped = true;
        $config = get_option('app_startup_config', []);
        $config = is_array($config) ? $config : [];
        $version = max(1, (int)($config['tournaments_version'] ?? 0) + 1);
        $revision = max(1, (int)($config['config_revision'] ?? 0) + 1);
        $config['tournaments_version'] = $version;
        $config['config_revision'] = $revision;
        update_option('app_startup_config', $config, false);
        if (function_exists('update_mobile_app_config_file')) {
            update_mobile_app_config_file();
        } else {
            forward_mobile_update_static_tournament_version($version, $revision);
        }
        return $version;
    }
}
