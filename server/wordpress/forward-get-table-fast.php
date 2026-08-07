<?php
/**
 * Быстрая выдача материализованной турнирной таблицы без запуска WordPress.
 * Разместить в корне WordPress рядом с wp-load.php и forward-table-common.php.
 */

$request_started_at = microtime(true);
require_once __DIR__ . '/forward-table-common.php';

function forward_mobile_fast_table_headers($cache_source, $server_timing, $etag = '') {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Expose-Headers: ETag, Server-Timing, X-Forward-Cache, X-Forward-Endpoint');
    header('X-Content-Type-Options: nosniff');
    header('X-Forward-Endpoint: standalone-table-cache-v1');
    header('X-Forward-Cache: ' . $cache_source);
    header('Cache-Control: public, max-age=30, stale-while-revalidate=300');
    if ($server_timing) header('Server-Timing: ' . $server_timing);
    if ($etag) header('ETag: ' . $etag);
}

function forward_mobile_fast_table_output($cache, $source, $timing, $status = 200) {
    $raw = isset($cache['raw'])
        ? $cache['raw']
        : json_encode($cache['payload'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $etag = '"' . sha1($raw) . '"';
    forward_mobile_fast_table_headers($source, $timing, $etag);
    if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
        http_response_code(304);
        exit;
    }
    http_response_code($status);
    echo $raw;
    exit;
}

function forward_mobile_fast_table_error($code, $message, $status, $timing) {
    forward_mobile_fast_table_headers('error', $timing);
    http_response_code($status);
    echo json_encode([
        'code' => $code,
        'message' => $message,
        'data' => ['status' => $status],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$request_method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($request_method === 'OPTIONS') {
    forward_mobile_fast_table_headers('preflight', 'total;dur=0');
    http_response_code(204);
    exit;
}
if ($request_method !== 'GET') {
    header('Allow: GET, OPTIONS');
    forward_mobile_fast_table_error('method_not_allowed', 'Разрешён только GET', 405, 'total;dur=0');
}

$table_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if ($table_id <= 0) {
    forward_mobile_fast_table_error('invalid_id', 'Некорректный ID таблицы', 400, 'total;dur=0');
}

$expected_version = forward_mobile_table_expected_version();
$ttl = forward_mobile_table_cache_ttl();
$cache = forward_mobile_read_table_cache($table_id);
if (forward_mobile_table_cache_is_fresh($cache, $expected_version, $ttl)) {
    $total_ms = (microtime(true) - $request_started_at) * 1000;
    forward_mobile_fast_table_output($cache, 'hit', 'cache;dur=' . number_format($total_ms, 3, '.', '') . ', total;dur=' . number_format($total_ms, 3, '.', ''));
}

$stale_cache = $cache;
$directory = forward_mobile_table_cache_directory();
if (!is_dir($directory)) @mkdir($directory, 0755, true);
$lock_handle = @fopen(forward_mobile_table_cache_path($table_id) . '.lock', 'c');
if (!$lock_handle || !flock($lock_handle, LOCK_EX)) {
    if ($stale_cache) {
        $total_ms = (microtime(true) - $request_started_at) * 1000;
        forward_mobile_fast_table_output($stale_cache, 'stale-lock-error', 'total;dur=' . number_format($total_ms, 3, '.', ''));
    }
    forward_mobile_fast_table_error('cache_lock_failed', 'Не удалось заблокировать генерацию таблицы', 503, 'total;dur=0');
}

// Другой процесс мог уже обновить файл, пока текущий запрос ждал блокировку.
$cache = forward_mobile_read_table_cache($table_id);
if (forward_mobile_table_cache_is_fresh($cache, $expected_version, $ttl)) {
    flock($lock_handle, LOCK_UN);
    fclose($lock_handle);
    $total_ms = (microtime(true) - $request_started_at) * 1000;
    forward_mobile_fast_table_output($cache, 'hit-after-wait', 'total;dur=' . number_format($total_ms, 3, '.', ''));
}

$bootstrap_started_at = microtime(true);
define('WP_USE_THEMES', false);
require_once __DIR__ . '/wp-load.php';
$bootstrap_ms = (microtime(true) - $bootstrap_started_at) * 1000;
$payload = forward_mobile_build_table_payload($table_id);

if (is_wp_error($payload)) {
    flock($lock_handle, LOCK_UN);
    fclose($lock_handle);
    $total_ms = (microtime(true) - $request_started_at) * 1000;
    $timing = forward_mobile_table_server_timing(['bootstrap' => $bootstrap_ms, 'total_request' => $total_ms]);
    if ($stale_cache) forward_mobile_fast_table_output($stale_cache, 'stale-if-error', $timing);
    $error_data = $payload->get_error_data();
    $status = is_array($error_data) ? (int)($error_data['status'] ?? 500) : 500;
    forward_mobile_fast_table_error($payload->get_error_code(), $payload->get_error_message(), $status, $timing);
}

if (!forward_mobile_write_table_cache($table_id, $payload)) {
    flock($lock_handle, LOCK_UN);
    fclose($lock_handle);
    $total_ms = (microtime(true) - $request_started_at) * 1000;
    $timing = forward_mobile_table_server_timing(['bootstrap' => $bootstrap_ms, 'total_request' => $total_ms]);
    if ($stale_cache) forward_mobile_fast_table_output($stale_cache, 'stale-write-error', $timing);
    forward_mobile_fast_table_error('cache_write_failed', 'Не удалось сохранить таблицу', 500, $timing);
}

flock($lock_handle, LOCK_UN);
fclose($lock_handle);
$fresh_cache = forward_mobile_read_table_cache($table_id);
$total_ms = (microtime(true) - $request_started_at) * 1000;
$timing = forward_mobile_table_server_timing(['bootstrap' => $bootstrap_ms, 'total_request' => $total_ms]);
if (!$fresh_cache) {
    if ($stale_cache) forward_mobile_fast_table_output($stale_cache, 'stale-read-error', $timing);
    forward_mobile_fast_table_error('cache_read_failed', 'Таблица сохранена, но не может быть прочитана', 500, $timing);
}
forward_mobile_fast_table_output($fresh_cache, 'regenerated', $timing);
