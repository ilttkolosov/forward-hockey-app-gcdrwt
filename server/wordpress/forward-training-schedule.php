<?php
/**
 * Plugin Name: Forward — расписание тренировок
 * Description: Безопасный импорт JSON/XML в The Events Calendar и API для мобильного приложения.
 * Version: 1.0.0
 * Author: HC Forward
 *
 * Рекомендуемое размещение:
 * wp-content/mu-plugins/forward-training-schedule.php
 */

if (!defined('ABSPATH')) {
    exit;
}

const FORWARD_TRAINING_API_SCHEMA = 1;
const FORWARD_TRAINING_MAX_EVENTS = 400;
const FORWARD_TRAINING_DEFAULT_TEAM_ID = 'forward-2014';
const FORWARD_TRAINING_DEFAULT_TEAM_NAME = 'Динамо-Форвард 2014';

add_action('rest_api_init', 'forward_training_register_rest_routes');
add_action('admin_menu', 'forward_training_register_admin_page');

function forward_training_register_rest_routes() {
    register_rest_route('app/v1', '/get-trainings', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'forward_training_rest_get_schedule',
        'permission_callback' => '__return_true',
        'args' => array(
            'date_from' => array('sanitize_callback' => 'sanitize_text_field'),
            'date_to' => array('sanitize_callback' => 'sanitize_text_field'),
            'team' => array('sanitize_callback' => 'sanitize_key'),
        ),
    ));
}

function forward_training_register_admin_page() {
    add_management_page(
        'Импорт тренировок',
        'Импорт тренировок',
        'edit_others_posts',
        'forward-training-import',
        'forward_training_render_admin_page'
    );
}

function forward_training_current_year() {
    return (int) wp_date('Y');
}

function forward_training_default_timezone() {
    $timezone = wp_timezone_string();
    return $timezone ? $timezone : 'Europe/Moscow';
}

function forward_training_lower($value) {
    $value = trim((string) $value);
    $value = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    return str_replace('ё', 'е', $value);
}

function forward_training_normalize_weekday($value) {
    return preg_replace('/[^a-zа-я0-9]+/u', '', forward_training_lower($value));
}

function forward_training_weekday_number($value) {
    $aliases = array(
        'понедельник' => 1, 'пн' => 1,
        'вторник' => 2, 'вт' => 2,
        'среда' => 3, 'ср' => 3,
        'четверг' => 4, 'чт' => 4,
        'пятница' => 5, 'пт' => 5,
        'суббота' => 6, 'сб' => 6,
        'воскресенье' => 7, 'вс' => 7,
    );
    $normalized = forward_training_normalize_weekday($value);
    return isset($aliases[$normalized]) ? $aliases[$normalized] : 0;
}

function forward_training_weekday_name($number) {
    $names = array(
        1 => 'понедельник', 2 => 'вторник', 3 => 'среда', 4 => 'четверг',
        5 => 'пятница', 6 => 'суббота', 7 => 'воскресенье',
    );
    return isset($names[(int) $number]) ? $names[(int) $number] : '';
}

function forward_training_parse_date($value, $default_year, DateTimeZone $timezone) {
    $value = trim((string) $value);
    $format = '';
    $expanded = $value;

    if (preg_match('/^\d{2}\.\d{2}$/', $value)) {
        $format = '!d.m.Y';
        $expanded = $value . '.' . $default_year;
    } elseif (preg_match('/^\d{2}\.\d{2}\.\d{4}$/', $value)) {
        $format = '!d.m.Y';
    } elseif (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        $format = '!Y-m-d';
    } else {
        return new WP_Error('invalid_date', 'Дата должна иметь формат ДД.ММ, ДД.ММ.ГГГГ или ГГГГ-ММ-ДД.');
    }

    $date = DateTimeImmutable::createFromFormat($format, $expanded, $timezone);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || (is_array($errors) && ($errors['warning_count'] || $errors['error_count']))) {
        return new WP_Error('invalid_date', 'Указана несуществующая календарная дата.');
    }
    if (($format === '!d.m.Y' && $date->format('d.m.Y') !== $expanded)
        || ($format === '!Y-m-d' && $date->format('Y-m-d') !== $expanded)) {
        return new WP_Error('invalid_date', 'Указана некорректная календарная дата.');
    }
    return $date->setTime(0, 0, 0);
}

function forward_training_normalize_time($value) {
    $value = str_replace('.', ':', trim((string) $value));
    if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $value)) {
        return new WP_Error('invalid_time', 'Время должно иметь формат ЧЧ:ММ.');
    }
    return $value;
}

function forward_training_normalize_type($value) {
    $normalized = forward_training_normalize_weekday($value);
    if (in_array($normalized, array('ice', 'лед', 'лёд'), true)) {
        return 'ice';
    }
    if (in_array($normalized, array('ofp', 'офп', 'земля'), true)) {
        return 'ofp';
    }
    return new WP_Error('invalid_type', 'Тип должен быть ice/лед или ofp/ОФП/земля.');
}

function forward_training_parse_payload($raw) {
    $raw = trim((string) $raw);
    if ($raw === '') {
        return new WP_Error('empty_payload', 'Вставьте JSON/XML или выберите файл.');
    }
    if (strlen($raw) > 512 * 1024) {
        return new WP_Error('payload_too_large', 'Файл расписания превышает 512 КБ.');
    }

    if (substr($raw, 0, 1) === '<') {
        if (!function_exists('simplexml_load_string')) {
            return new WP_Error('xml_unavailable', 'На сервере не подключено расширение SimpleXML.');
        }
        $previous = libxml_use_internal_errors(true);
        $xml = simplexml_load_string($raw, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (!$xml) {
            return new WP_Error('invalid_xml', 'Не удалось разобрать XML.');
        }
        $attributes = $xml->attributes();
        $payload = array(
            'year' => (string) ($attributes['year'] ?? ''),
            'timezone' => (string) ($attributes['timezone'] ?? ''),
            'team_id' => (string) ($attributes['team_id'] ?? ''),
            'team_name' => (string) ($attributes['team_name'] ?? ''),
            'range_from' => (string) ($attributes['range_from'] ?? ''),
            'range_to' => (string) ($attributes['range_to'] ?? ''),
            'replace_range' => filter_var((string) ($attributes['replace_range'] ?? ''), FILTER_VALIDATE_BOOLEAN),
            'events' => array(),
        );
        foreach ($xml->event as $event_node) {
            $event = array();
            foreach ($event_node->attributes() as $key => $value) {
                $event[(string) $key] = (string) $value;
            }
            foreach ($event_node->children() as $key => $value) {
                $event[(string) $key] = trim((string) $value);
            }
            $payload['events'][] = $event;
        }
        return $payload;
    }

    $payload = json_decode($raw, true);
    if (!is_array($payload) || json_last_error() !== JSON_ERROR_NONE) {
        return new WP_Error('invalid_json', 'Не удалось разобрать JSON: ' . json_last_error_msg());
    }
    return $payload;
}

function forward_training_normalize_payload(array $payload) {
    $year = isset($payload['year']) && $payload['year'] !== ''
        ? (int) $payload['year']
        : forward_training_current_year();
    if ($year < 2020 || $year > 2100) {
        return new WP_Error('invalid_year', 'Год должен находиться в диапазоне 2020–2100.');
    }

    $timezone_name = sanitize_text_field($payload['timezone'] ?? forward_training_default_timezone());
    if ($timezone_name === '') {
        $timezone_name = forward_training_default_timezone();
    }
    try {
        $timezone = new DateTimeZone($timezone_name);
    } catch (Exception $error) {
        return new WP_Error('invalid_timezone', 'Неизвестная временная зона: ' . $timezone_name);
    }

    $team_value = isset($payload['team']) && is_array($payload['team']) ? $payload['team'] : array();
    $team_id = sanitize_key($payload['team_id'] ?? ($team_value['id'] ?? FORWARD_TRAINING_DEFAULT_TEAM_ID));
    $team_name = sanitize_text_field($payload['team_name'] ?? ($team_value['name'] ?? FORWARD_TRAINING_DEFAULT_TEAM_NAME));
    if ($team_id === '') {
        return new WP_Error('invalid_team', 'Не указан team_id.');
    }

    $source_events = $payload['events'] ?? null;
    if (!is_array($source_events)) {
        return new WP_Error('invalid_events', 'Поле events должно быть массивом.');
    }
    if (count($source_events) > FORWARD_TRAINING_MAX_EVENTS) {
        return new WP_Error('too_many_events', 'За один импорт разрешено не более ' . FORWARD_TRAINING_MAX_EVENTS . ' занятий.');
    }

    $normalized = array();
    $errors = array();
    $known_uids = array();
    foreach ($source_events as $index => $source) {
        $row = $index + 1;
        if (!is_array($source)) {
            $errors[] = "Строка {$row}: запись должна быть объектом.";
            continue;
        }
        $date = forward_training_parse_date($source['date'] ?? '', $year, $timezone);
        $weekday_number = forward_training_weekday_number($source['weekday'] ?? '');
        $type = forward_training_normalize_type($source['type'] ?? '');
        $start_time = forward_training_normalize_time($source['start'] ?? '');
        $end_time = forward_training_normalize_time($source['end'] ?? '');

        foreach (array($date, $type, $start_time, $end_time) as $result) {
            if (is_wp_error($result)) {
                $errors[] = "Строка {$row}: " . $result->get_error_message();
            }
        }
        if ($weekday_number === 0) {
            $errors[] = "Строка {$row}: укажите день недели полностью или сокращённо.";
        }
        if (is_wp_error($date) || is_wp_error($type) || is_wp_error($start_time) || is_wp_error($end_time) || !$weekday_number) {
            continue;
        }

        $actual_weekday = (int) $date->format('N');
        if ($actual_weekday !== $weekday_number) {
            $errors[] = sprintf(
                'Строка %d: дата %s — это %s, а указано «%s».',
                $row,
                $date->format('d.m.Y'),
                forward_training_weekday_name($actual_weekday),
                sanitize_text_field($source['weekday'])
            );
            continue;
        }

        $start = DateTimeImmutable::createFromFormat(
            '!Y-m-d H:i',
            $date->format('Y-m-d') . ' ' . $start_time,
            $timezone
        );
        $end = DateTimeImmutable::createFromFormat(
            '!Y-m-d H:i',
            $date->format('Y-m-d') . ' ' . $end_time,
            $timezone
        );
        if (!$start || !$end || $end <= $start) {
            $errors[] = "Строка {$row}: время окончания должно быть позже времени начала.";
            continue;
        }

        $uid_source = $team_id . '|' . $type . '|' . $start->format(DateTimeInterface::ATOM);
        $uid = !empty($source['uid'])
            ? sanitize_key($source['uid'])
            : 'forward-training-' . sha1($uid_source);
        if ($uid === '' || isset($known_uids[$uid])) {
            $errors[] = "Строка {$row}: повторяющийся или пустой uid.";
            continue;
        }
        $known_uids[$uid] = true;

        $title = $type === 'ice' ? 'Тренировка — Лёд' : 'Тренировка — ОФП';
        $normalized[] = array(
            'row' => $row,
            'uid' => $uid,
            'type' => $type,
            'title' => sanitize_text_field($source['title'] ?? $title),
            'start' => $start,
            'end' => $end,
            'timezone' => $timezone_name,
            'weekday' => forward_training_weekday_name($actual_weekday),
            'location' => sanitize_text_field($source['location'] ?? ''),
            'note' => sanitize_textarea_field($source['note'] ?? ''),
            'team_id' => $team_id,
            'team_name' => $team_name,
        );
    }

    if ($errors) {
        return new WP_Error('validation_failed', implode("\n", $errors), array('errors' => $errors));
    }

    $range_from = null;
    $range_to = null;
    if (!empty($payload['range_from']) || !empty($payload['range_to'])) {
        $range_from = forward_training_parse_date($payload['range_from'] ?? '', $year, $timezone);
        $range_to = forward_training_parse_date($payload['range_to'] ?? '', $year, $timezone);
        if (is_wp_error($range_from) || is_wp_error($range_to) || $range_to < $range_from) {
            return new WP_Error('invalid_range', 'Проверьте range_from/range_to: обе даты обязательны, начало не позже конца.');
        }
    } elseif ($normalized) {
        $timestamps = array_map(function ($event) {
            return $event['start']->getTimestamp();
        }, $normalized);
        $range_from = (new DateTimeImmutable('@' . min($timestamps)))->setTimezone($timezone)->setTime(0, 0, 0);
        $range_to = (new DateTimeImmutable('@' . max($timestamps)))->setTimezone($timezone)->setTime(0, 0, 0);
    }

    return array(
        'schema_version' => FORWARD_TRAINING_API_SCHEMA,
        'year' => $year,
        'timezone' => $timezone_name,
        'team_id' => $team_id,
        'team_name' => $team_name,
        'replace_range' => !empty($payload['replace_range']),
        'range_from' => $range_from,
        'range_to' => $range_to,
        'events' => $normalized,
    );
}

function forward_training_find_event_by_uid($uid) {
    $ids = get_posts(array(
        'post_type' => 'tribe_events',
        'post_status' => array('publish', 'future', 'draft', 'pending', 'private', 'trash'),
        'fields' => 'ids',
        'posts_per_page' => 1,
        'meta_key' => '_forward_training_uid',
        'meta_value' => $uid,
        'no_found_rows' => true,
    ));
    return $ids ? (int) $ids[0] : 0;
}

function forward_training_description(array $event) {
    $lines = array(
        '<p><strong>Команда:</strong> ' . esc_html($event['team_name']) . '</p>',
        '<p><strong>Тип:</strong> ' . ($event['type'] === 'ice' ? 'Лёд' : 'ОФП') . '</p>',
    );
    if ($event['location'] !== '') {
        $lines[] = '<p><strong>Место:</strong> ' . esc_html($event['location']) . '</p>';
    }
    if ($event['note'] !== '') {
        $lines[] = '<p>' . nl2br(esc_html($event['note'])) . '</p>';
    }
    return implode("\n", $lines);
}

function forward_training_apply_event_meta($event_id, array $event) {
    $start_local = $event['start']->format('Y-m-d H:i:s');
    $end_local = $event['end']->format('Y-m-d H:i:s');
    $start_utc = $event['start']->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    $end_utc = $event['end']->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');

    update_post_meta($event_id, '_EventStartDate', $start_local);
    update_post_meta($event_id, '_EventEndDate', $end_local);
    update_post_meta($event_id, '_EventStartDateUTC', $start_utc);
    update_post_meta($event_id, '_EventEndDateUTC', $end_utc);
    update_post_meta($event_id, '_EventTimezone', $event['timezone']);
    update_post_meta($event_id, '_EventDuration', $event['end']->getTimestamp() - $event['start']->getTimestamp());
    update_post_meta($event_id, '_EventAllDay', 'no');
    update_post_meta($event_id, '_forward_training_uid', $event['uid']);
    update_post_meta($event_id, '_forward_training_type', $event['type']);
    update_post_meta($event_id, '_forward_training_team_id', $event['team_id']);
    update_post_meta($event_id, '_forward_training_team_name', $event['team_name']);
    update_post_meta($event_id, '_forward_training_location', $event['location']);
    update_post_meta($event_id, '_forward_training_note', $event['note']);
    update_post_meta($event_id, '_forward_training_import_hash', hash('sha256', wp_json_encode(array(
        $event['uid'], $event['title'], $start_local, $end_local, $event['location'], $event['note'],
    ))));
    update_post_meta($event_id, '_forward_training_source', 'forward-training-import-v1');
    clean_post_cache($event_id);
}

function forward_training_upsert_event(array $event, $dry_run = false) {
    if (!post_type_exists('tribe_events') || !function_exists('tribe_events')) {
        return new WP_Error('tec_missing', 'Плагин The Events Calendar не активен или его ORM недоступен.');
    }
    $existing_id = forward_training_find_event_by_uid($event['uid']);
    if ($dry_run) {
        return array(
            'action' => $existing_id ? 'update' : 'create',
            'event_id' => $existing_id,
            'uid' => $event['uid'],
            'title' => $event['title'],
            'start_at' => $event['start']->format(DateTimeInterface::ATOM),
        );
    }

    $description = forward_training_description($event);
    if ($existing_id) {
        $result = wp_update_post(array(
            'ID' => $existing_id,
            'post_title' => $event['title'],
            'post_content' => $description,
            'post_status' => 'publish',
        ), true);
        if (is_wp_error($result)) {
            return $result;
        }
        if (function_exists('tribe_update_event')) {
            $updated = tribe_update_event($existing_id, array(
                'post_title' => $event['title'],
                'post_content' => $description,
                'post_status' => 'publish',
                'EventStartDate' => $event['start']->format('Y-m-d H:i:s'),
                'EventEndDate' => $event['end']->format('Y-m-d H:i:s'),
                'EventTimezone' => $event['timezone'],
            ));
            if ($updated === false) {
                return new WP_Error('tec_update_failed', 'The Events Calendar не обновил событие ' . $existing_id . '.');
            }
        }
        $event_id = $existing_id;
        $action = 'update';
    } else {
        $created = tribe_events()->set_args(array(
            'title' => $event['title'],
            'description' => $description,
            'status' => 'publish',
            'start_date' => $event['start']->format('Y-m-d H:i:s'),
            'end_date' => $event['end']->format('Y-m-d H:i:s'),
            'timezone' => $event['timezone'],
        ))->create();
        if ($created instanceof WP_Post) {
            $event_id = (int) $created->ID;
        } elseif (is_numeric($created)) {
            $event_id = (int) $created;
        } else {
            return new WP_Error('tec_create_failed', 'The Events Calendar не создал событие.');
        }
        $action = 'create';
    }

    forward_training_apply_event_meta($event_id, $event);
    return array(
        'action' => $action,
        'event_id' => $event_id,
        'uid' => $event['uid'],
        'title' => $event['title'],
        'start_at' => $event['start']->format(DateTimeInterface::ATOM),
    );
}

function forward_training_replace_range(array $schedule, array $retained_uids, $dry_run = false) {
    if (!$schedule['range_from'] || !$schedule['range_to']) {
        return array();
    }
    $ids = get_posts(array(
        'post_type' => 'tribe_events',
        'post_status' => array('publish', 'future', 'draft', 'pending', 'private'),
        'fields' => 'ids',
        'posts_per_page' => FORWARD_TRAINING_MAX_EVENTS,
        'no_found_rows' => true,
        'meta_query' => array(
            'relation' => 'AND',
            array('key' => '_forward_training_team_id', 'value' => $schedule['team_id']),
            array('key' => '_forward_training_uid', 'compare' => 'EXISTS'),
            array(
                'key' => '_EventStartDate',
                'value' => array(
                    $schedule['range_from']->format('Y-m-d 00:00:00'),
                    $schedule['range_to']->format('Y-m-d 23:59:59'),
                ),
                'compare' => 'BETWEEN',
                'type' => 'DATETIME',
            ),
        ),
    ));
    $removed = array();
    foreach ($ids as $event_id) {
        $uid = (string) get_post_meta($event_id, '_forward_training_uid', true);
        if (isset($retained_uids[$uid])) {
            continue;
        }
        $removed[] = array('event_id' => (int) $event_id, 'uid' => $uid);
        if (!$dry_run) {
            wp_trash_post($event_id);
        }
    }
    return $removed;
}

function forward_training_import_schedule(array $schedule, $dry_run = false, $replace_override = false) {
    $results = array();
    $retained_uids = array();
    foreach ($schedule['events'] as $event) {
        $result = forward_training_upsert_event($event, $dry_run);
        if (is_wp_error($result)) {
            return $result;
        }
        $results[] = $result;
        $retained_uids[$event['uid']] = true;
    }
    $replace = $replace_override || $schedule['replace_range'];
    $removed = $replace
        ? forward_training_replace_range($schedule, $retained_uids, $dry_run)
        : array();
    return array(
        'dry_run' => $dry_run,
        'year' => $schedule['year'],
        'timezone' => $schedule['timezone'],
        'created' => count(array_filter($results, function ($row) { return $row['action'] === 'create'; })),
        'updated' => count(array_filter($results, function ($row) { return $row['action'] === 'update'; })),
        'removed' => count($removed),
        'events' => $results,
        'removed_events' => $removed,
    );
}

function forward_training_rest_date($value, $fallback) {
    $value = $value ? (string) $value : $fallback;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, wp_timezone());
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || (is_array($errors) && ($errors['warning_count'] || $errors['error_count']))
        || $date->format('Y-m-d') !== $value) {
        return new WP_Error('invalid_date', 'Дата должна иметь формат YYYY-MM-DD.', array('status' => 400));
    }
    return $date;
}

function forward_training_event_iso($value, $timezone_name) {
    try {
        $timezone = new DateTimeZone($timezone_name ?: forward_training_default_timezone());
        return (new DateTimeImmutable($value, $timezone))->format(DateTimeInterface::ATOM);
    } catch (Exception $error) {
        return '';
    }
}

function forward_training_rest_get_schedule(WP_REST_Request $request) {
    $today = new DateTimeImmutable('today', wp_timezone());
    $date_from = forward_training_rest_date(
        $request->get_param('date_from'),
        $today->modify('-7 days')->format('Y-m-d')
    );
    $date_to = forward_training_rest_date(
        $request->get_param('date_to'),
        $today->modify('+90 days')->format('Y-m-d')
    );
    if (is_wp_error($date_from)) return $date_from;
    if (is_wp_error($date_to)) return $date_to;
    if ($date_to < $date_from || $date_from->diff($date_to)->days > 366) {
        return new WP_Error('invalid_range', 'Диапазон должен быть от 0 до 366 дней.', array('status' => 400));
    }
    $team_id = sanitize_key($request->get_param('team') ?: FORWARD_TRAINING_DEFAULT_TEAM_ID);

    $query = new WP_Query(array(
        'post_type' => 'tribe_events',
        'post_status' => 'publish',
        'posts_per_page' => FORWARD_TRAINING_MAX_EVENTS,
        'orderby' => 'meta_value',
        'order' => 'ASC',
        'meta_key' => '_EventStartDate',
        'no_found_rows' => true,
        'meta_query' => array(
            'relation' => 'AND',
            array('key' => '_forward_training_type', 'compare' => 'EXISTS'),
            array('key' => '_forward_training_team_id', 'value' => $team_id),
            array(
                'key' => '_EventStartDate',
                'value' => array(
                    $date_from->format('Y-m-d 00:00:00'),
                    $date_to->format('Y-m-d 23:59:59'),
                ),
                'compare' => 'BETWEEN',
                'type' => 'DATETIME',
            ),
        ),
    ));

    $items = array();
    foreach ($query->posts as $post) {
        $event_id = (int) $post->ID;
        $timezone = (string) get_post_meta($event_id, '_EventTimezone', true);
        if ($timezone === '') $timezone = forward_training_default_timezone();
        $items[] = array(
            'id' => (string) $event_id,
            'uid' => (string) get_post_meta($event_id, '_forward_training_uid', true),
            'type' => (string) get_post_meta($event_id, '_forward_training_type', true),
            'title' => get_the_title($event_id),
            'start_at' => forward_training_event_iso(get_post_meta($event_id, '_EventStartDate', true), $timezone),
            'end_at' => forward_training_event_iso(get_post_meta($event_id, '_EventEndDate', true), $timezone),
            'timezone' => $timezone,
            'location' => (string) get_post_meta($event_id, '_forward_training_location', true),
            'note' => (string) get_post_meta($event_id, '_forward_training_note', true),
            'team' => array(
                'id' => (string) get_post_meta($event_id, '_forward_training_team_id', true),
                'name' => (string) get_post_meta($event_id, '_forward_training_team_name', true),
            ),
            'updated_at' => get_post_modified_time(DateTimeInterface::ATOM, true, $post),
        );
    }
    wp_reset_postdata();

    $payload = array(
        'status' => 'success',
        'schema_version' => FORWARD_TRAINING_API_SCHEMA,
        'data' => $items,
        'count' => count($items),
        'timezone' => forward_training_default_timezone(),
        'generated_at' => wp_date(DateTimeInterface::ATOM),
    );
    $response = new WP_REST_Response($payload, 200);
    $response->header('Cache-Control', 'public, max-age=60, must-revalidate');
    $response->header('X-Forward-Endpoint', 'training-schedule-v1');
    return $response;
}

function forward_training_example_json() {
    return wp_json_encode(array(
        'schema_version' => 1,
        'timezone' => 'Europe/Moscow',
        'team' => array('id' => 'forward-2014', 'name' => 'Динамо-Форвард 2014'),
        'range_from' => '03.08',
        'range_to' => '09.08',
        'replace_range' => true,
        'events' => array(
            array('date' => '03.08', 'weekday' => 'понедельник', 'type' => 'ofp', 'start' => '14:15', 'end' => '15:15'),
            array('date' => '03.08', 'weekday' => 'понедельник', 'type' => 'ice', 'start' => '16:00', 'end' => '17:30'),
        ),
    ), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function forward_training_render_admin_page() {
    if (!current_user_can('edit_others_posts')) {
        wp_die(esc_html__('Недостаточно прав.', 'forward-training'));
    }

    $result = null;
    $error_messages = array();
    $raw = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['forward_training_action'])) {
        check_admin_referer('forward_training_import', 'forward_training_nonce');
        $raw = isset($_POST['forward_training_payload'])
            ? wp_unslash((string) $_POST['forward_training_payload'])
            : '';
        if (!empty($_FILES['forward_training_file']['tmp_name'])
            && is_uploaded_file($_FILES['forward_training_file']['tmp_name'])) {
            $uploaded = file_get_contents($_FILES['forward_training_file']['tmp_name']);
            if ($uploaded !== false) $raw = $uploaded;
        }
        $parsed = forward_training_parse_payload($raw);
        if (is_wp_error($parsed)) {
            $error_messages[] = $parsed->get_error_message();
        } else {
            $schedule = forward_training_normalize_payload($parsed);
            if (is_wp_error($schedule)) {
                $details = $schedule->get_error_data();
                $error_messages = is_array($details) && !empty($details['errors'])
                    ? $details['errors']
                    : array($schedule->get_error_message());
            } else {
                $dry_run = $_POST['forward_training_action'] !== 'import';
                $replace_override = !empty($_POST['forward_training_replace']);
                $result = forward_training_import_schedule($schedule, $dry_run, $replace_override);
                if (is_wp_error($result)) {
                    $error_messages[] = $result->get_error_message();
                    $result = null;
                }
            }
        }
    }
    if ($raw === '') $raw = forward_training_example_json();
    ?>
    <div class="wrap">
        <h1>Импорт расписания тренировок</h1>
        <p>
            Если поле <code>year</code> отсутствует, используется текущий год сайта:
            <strong><?php echo esc_html(forward_training_current_year()); ?></strong>.
            Перед записью каждая дата сверяется с указанным днём недели.
        </p>
        <?php foreach ($error_messages as $message) : ?>
            <div class="notice notice-error"><p><?php echo esc_html($message); ?></p></div>
        <?php endforeach; ?>
        <?php if (is_array($result)) : ?>
            <div class="notice notice-success"><p>
                <?php echo $result['dry_run'] ? 'Проверка завершена, база не изменялась.' : 'Импорт завершён.'; ?>
                Создать: <?php echo esc_html($result['created']); ?>;
                обновить: <?php echo esc_html($result['updated']); ?>;
                убрать в корзину: <?php echo esc_html($result['removed']); ?>.
            </p></div>
        <?php endif; ?>

        <form method="post" enctype="multipart/form-data">
            <?php wp_nonce_field('forward_training_import', 'forward_training_nonce'); ?>
            <p><input type="file" name="forward_training_file" accept=".json,.xml,application/json,text/xml,application/xml"></p>
            <textarea name="forward_training_payload" rows="24" style="width:100%;font-family:monospace"><?php
                echo esc_textarea($raw);
            ?></textarea>
            <p>
                <label>
                    <input type="checkbox" name="forward_training_replace" value="1">
                    удалить в корзину отсутствующие занятия команды внутри range_from–range_to
                </label>
            </p>
            <p>
                <button class="button" name="forward_training_action" value="preview">Проверить без записи</button>
                <button class="button button-primary" name="forward_training_action" value="import"
                        onclick="return confirm('Записать расписание в The Events Calendar?');">Импортировать</button>
            </p>
        </form>

        <?php if (is_array($result) && !empty($result['events'])) : ?>
            <table class="widefat striped">
                <thead><tr><th>Действие</th><th>ID</th><th>Занятие</th><th>Начало</th><th>UID</th></tr></thead>
                <tbody>
                <?php foreach ($result['events'] as $row) : ?>
                    <tr>
                        <td><?php echo esc_html($row['action']); ?></td>
                        <td><?php echo esc_html($row['event_id'] ?: '—'); ?></td>
                        <td><?php echo esc_html($row['title']); ?></td>
                        <td><?php echo esc_html($row['start_at']); ?></td>
                        <td><code><?php echo esc_html($row['uid']); ?></code></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
    <?php
}
