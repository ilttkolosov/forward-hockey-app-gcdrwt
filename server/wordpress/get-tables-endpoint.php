<?php
/**
 * WordPress REST fallback и генератор кэша турнирных таблиц.
 * Разместить вместо прежнего файла endpoint в теме и оставить его подключение
 * из functions.php без изменений.
 */
if (!defined('ABSPATH')) exit;

$forward_table_common = ABSPATH . 'forward-table-common.php';
if (is_readable($forward_table_common)) require_once $forward_table_common;

add_action('rest_api_init', function () {
    register_rest_route('app/v1', '/get-table/(?P<id>\d+)', [
        'methods' => 'GET',
        'callback' => 'forward_mobile_rest_get_table',
        'permission_callback' => '__return_true',
    ]);
});

function forward_mobile_rest_get_table($request) {
    if (!function_exists('forward_mobile_get_or_build_table')) {
        return new WP_Error(
            'table_common_missing',
            'В корне WordPress отсутствует forward-table-common.php',
            ['status' => 500]
        );
    }
    $started_at = microtime(true);
    $payload = forward_mobile_get_or_build_table(absint($request['id']));
    if (is_wp_error($payload)) return $payload;

    $response = rest_ensure_response($payload);
    $response->header('Cache-Control', 'no-cache');
    $response->header('X-Forward-Endpoint', 'wordpress-sportpress-builder-v2');
    $response->header('X-Forward-Cache', $GLOBALS['forward_mobile_table_cache_source'] ?? 'unknown');
    $response->header(
        'Server-Timing',
        forward_mobile_table_server_timing([
            'request' => (microtime(true) - (float)($_SERVER['REQUEST_TIME_FLOAT'] ?? $started_at)) * 1000,
        ])
    );
    return $response;
}

function forward_mobile_sportpress_data_changed($post_id, $post = null) {
    if (!function_exists('forward_mobile_bump_tournament_version')) return;
    if (wp_is_post_autosave($post_id) || wp_is_post_revision($post_id)) return;
    $post_type = $post instanceof WP_Post ? $post->post_type : get_post_type($post_id);
    if (!in_array($post_type, ['sp_event', 'sp_table'], true)) return;
    $version = forward_mobile_bump_tournament_version();
    if ($version) error_log('[Forward Mobile] Версия турнирных таблиц увеличена до ' . $version);
}

add_action('save_post_sp_event', 'forward_mobile_sportpress_data_changed', 30, 2);
add_action('save_post_sp_table', 'forward_mobile_sportpress_data_changed', 30, 2);
add_action('before_delete_post', 'forward_mobile_sportpress_data_changed', 30, 2);
