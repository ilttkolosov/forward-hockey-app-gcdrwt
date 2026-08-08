import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../components/Icon';
import { commonStyles, colors } from '../styles/commonStyles';
import type { Training } from '../types/training';
import {
  getTrainingSyncWindow,
  loadCachedTrainings,
  subscribeTrainingUpdates,
  synchronizeTrainings,
} from '../services/trainingService';
import { useNetworkStatus } from '../contexts/NetworkStatusContext';
import { useTrackScreenView } from '../hooks/useTrackScreenView';

interface TrainingSection {
  date: string;
  items: Training[];
}

interface WeekRange {
  startDate: string;
  endDate: string;
  label: string;
}

const formatCalendarDate = (date: string): string => {
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const formatTime = (iso: string, timezone: string): string => {
  const date = new Date(iso);
  try {
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone || 'Europe/Moscow',
    });
  } catch {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
};

const formatWeekDate = (date: Date): string => date.toLocaleDateString('ru-RU', {
  day: 'numeric',
  month: 'long',
});

const formatIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekRange = (weekOffset = 0, today = new Date()): WeekRange => {
  const monday = new Date(today);
  monday.setHours(12, 0, 0, 0);
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday + weekOffset * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDate: formatIsoDate(monday),
    endDate: formatIsoDate(sunday),
    label: `Неделя с ${formatWeekDate(monday)} по ${formatWeekDate(sunday)}`,
  };
};

const getWeekTitle = (weekOffset: number): string => {
  if (weekOffset === -1) return 'Предыдущая неделя';
  if (weekOffset === 0) return 'Текущая неделя';
  if (weekOffset === 1) return 'Следующая неделя';
  return weekOffset < 0 ? `${Math.abs(weekOffset)} недели назад` : `Через ${weekOffset} недели`;
};

const MIN_WEEK_OFFSET = -1;
const MAX_WEEK_OFFSET = 12;

const getRussianForm = (
  value: number,
  forms: [string, string, string]
): string => {
  const remainder100 = Math.abs(value) % 100;
  const remainder10 = remainder100 % 10;
  if (remainder100 >= 11 && remainder100 <= 19) return forms[2];
  if (remainder10 === 1) return forms[0];
  if (remainder10 >= 2 && remainder10 <= 4) return forms[1];
  return forms[2];
};

const formatDuration = (startIso: string, endIso: string): string => {
  const durationMinutes = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000
  );
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return '';

  if (durationMinutes < 60) {
    return `${durationMinutes} ${getRussianForm(durationMinutes, ['минута', 'минуты', 'минут'])}`;
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (minutes === 0) {
    return `${hours} ${getRussianForm(hours, ['час', 'часа', 'часов'])}`;
  }
  if (minutes === 30) {
    return `${hours},5 часа`;
  }

  const hourText = `${hours} ${getRussianForm(hours, ['час', 'часа', 'часов'])}`;
  const minuteText = `${minutes} ${getRussianForm(minutes, ['минута', 'минуты', 'минут'])}`;
  return `${hourText} ${minuteText}`;
};

const isCurrentOrFuture = (training: Training): boolean => {
  const beginningOfToday = new Date();
  beginningOfToday.setHours(0, 0, 0, 0);
  return new Date(training.end_at).getTime() >= beginningOfToday.getTime();
};

export default function TrainingsScreen() {
  const router = useRouter();
  const { isOffline } = useNetworkStatus();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [showPastTrainings, setShowPastTrainings] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const selectedWeek = useMemo(() => getWeekRange(weekOffset), [weekOffset]);

  useTrackScreenView('Расписание тренировок');

  const loadSchedule = useCallback(async (forceNetwork = false) => {
    try {
      const local = await loadCachedTrainings(getTrainingSyncWindow());
      setTrainings(local);
      setLoading(false);
      console.log(`[Тренировки] Экран открыт из SQLite: ${local.length} занятий`);

      const result = await synchronizeTrainings(!isOffline, forceNetwork);
      setTrainings(result.trainings);
      setNetworkError(result.error
        ? result.failureStage === 'database'
          ? 'Расписание получено, но не удалось сохранить его на устройстве.'
          : result.failureStage === 'validation'
            ? 'Сервер вернул некорректное расписание. Показаны сохранённые данные.'
            : 'Не удалось получить расписание с сервера. Показаны сохранённые данные.'
        : null);
    } catch (error) {
      console.warn('[Тренировки] Не удалось подготовить экран расписания:', error);
      setNetworkError('Не удалось открыть сохранённое расписание.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOffline]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  useEffect(() => subscribeTrainingUpdates(updated => {
    console.log(`[Тренировки] Экран получил обновление: ${updated.length} занятий`);
    setTrainings(updated);
    setNetworkError(null);
  }), []);

  const sections = useMemo<TrainingSection[]>(() => {
    const grouped = new Map<string, Training[]>();
    trainings.filter(training => {
      const date = training.start_at.slice(0, 10);
      if (date < selectedWeek.startDate || date > selectedWeek.endDate) return false;
      if (weekOffset !== 0 || showPastTrainings) return true;
      return isCurrentOrFuture(training);
    }).forEach(training => {
      const date = training.start_at.slice(0, 10);
      const existing = grouped.get(date) || [];
      existing.push(training);
      grouped.set(date, existing);
    });
    return [...grouped.entries()].map(([date, items]) => ({ date, items }));
  }, [selectedWeek.endDate, selectedWeek.startDate, showPastTrainings, trainings, weekOffset]);

  const selectWeek = (nextOffset: number) => {
    if (nextOffset < MIN_WEEK_OFFSET || nextOffset > MAX_WEEK_OFFSET) return;
    setWeekOffset(nextOffset);
    if (nextOffset !== 0) setShowPastTrainings(false);
  };

  const togglePastTrainings = () => {
    setShowPastTrainings(currentValue => {
      const nextValue = !currentValue;
      console.log(
        `[Тренировки] Прошедшие занятия текущей недели ${nextValue ? 'показаны' : 'скрыты'}`
      );
      return nextValue;
    });
  };

  const onRefresh = () => {
    setRefreshing(true);
    void loadSchedule(true);
  };

  return (
    <SafeAreaView edges={['top']} style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Тренировки</Text>
          <Text style={styles.subtitle}>{selectedWeek.label}</Text>
        </View>
        {weekOffset === 0 ? <TouchableOpacity
          accessibilityHint="Переключает отображение уже прошедших занятий с понедельника текущей недели"
          accessibilityLabel={showPastTrainings
            ? 'Скрыть прошедшие тренировки'
            : 'Показать прошедшие тренировки текущей недели'}
          accessibilityRole="button"
          accessibilityState={{ selected: showPastTrainings }}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          onPress={togglePastTrainings}
          style={[styles.pastToggle, showPastTrainings && styles.pastToggleActive]}
        >
          <Icon
            name={showPastTrainings ? 'time' : 'time-outline'}
            size={24}
            color={showPastTrainings ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity> : <View style={styles.pastToggle} />}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Загрузка сохранённого расписания…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.weekNavigation}>
            <TouchableOpacity
              accessibilityLabel="Предыдущая неделя"
              accessibilityRole="button"
              accessibilityState={{ disabled: weekOffset === MIN_WEEK_OFFSET }}
              disabled={weekOffset === MIN_WEEK_OFFSET}
              onPress={() => selectWeek(weekOffset - 1)}
              style={[styles.weekArrow, weekOffset === MIN_WEEK_OFFSET && styles.weekArrowDisabled]}
            >
              <Icon name="chevron-back" size={24} color={colors.primary} />
            </TouchableOpacity>
            <View style={styles.weekNavigationText}>
              <Text style={styles.weekNavigationTitle}>{getWeekTitle(weekOffset)}</Text>
              <Text style={styles.weekNavigationRange}>{selectedWeek.label}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Следующая неделя"
              accessibilityRole="button"
              accessibilityState={{ disabled: weekOffset === MAX_WEEK_OFFSET }}
              disabled={weekOffset === MAX_WEEK_OFFSET}
              onPress={() => selectWeek(weekOffset + 1)}
              style={[styles.weekArrow, weekOffset === MAX_WEEK_OFFSET && styles.weekArrowDisabled]}
            >
              <Icon name="chevron-forward" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {(isOffline || networkError) && (
            <View accessibilityRole="alert" style={styles.warning}>
              <Icon
                name={isOffline ? 'cloud-offline-outline' : 'warning-outline'}
                size={20}
                color={colors.warning}
              />
              <Text style={styles.warningText}>
                {isOffline
                  ? 'Нет подключения к интернету. Показано сохранённое расписание.'
                  : networkError}
              </Text>
            </View>
          )}

          {sections.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="calendar-outline" size={44} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>Расписание пока не опубликовано</Text>
              <Text style={styles.emptyText}>
                Потяните экран вниз, чтобы проверить обновления.
              </Text>
            </View>
          ) : sections.map(section => (
            <View key={section.date} style={styles.section}>
              <Text style={styles.dateTitle}>{formatCalendarDate(section.date)}</Text>
              {section.items.map(training => {
                const isIce = training.type === 'ice';
                const isGame = training.type === 'game';
                return (
                  <View key={training.uid} style={styles.card}>
                    <View style={[
                      styles.typeMarker,
                      isIce ? styles.iceMarker : isGame ? styles.gameMarker : styles.ofpMarker,
                    ]} />
                    <View style={styles.cardContent}>
                      <View style={styles.cardHeader}>
                        <View style={[
                          styles.badge,
                          isIce ? styles.iceBadge : isGame ? styles.gameBadge : styles.ofpBadge,
                        ]}>
                          <Text style={styles.badgeText}>
                            {isIce ? 'ЛЕД' : isGame ? 'ИГРА' : 'ОФП'}
                          </Text>
                        </View>
                        <View style={styles.timeBlock}>
                          <Text style={styles.time}>
                            {formatTime(training.start_at, training.timezone)}–
                            {formatTime(training.end_at, training.timezone)}
                          </Text>
                          <Text style={styles.duration}>
                            {formatDuration(training.start_at, training.end_at)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.trainingTitle}>{training.title}</Text>
                      {!!training.location && (
                        <View style={styles.detailRow}>
                          <Icon name="location-outline" size={16} color={colors.textSecondary} />
                          <Text style={styles.detailText}>{training.location}</Text>
                        </View>
                      )}
                      {!!training.note && (
                        <View style={styles.detailRow}>
                          <Icon name="information-circle-outline" size={16} color={colors.textSecondary} />
                          <Text style={styles.detailText}>{training.note}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { padding: 4, marginRight: 8 },
  headerText: { flex: 1 },
  pastToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  pastToggleActive: { backgroundColor: '#E9F3FF' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 2, fontSize: 13, color: colors.textSecondary },
  content: { padding: 16, paddingBottom: 40 },
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  weekArrow: {
    width: 52,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekArrowDisabled: { opacity: 0.25 },
  weekNavigationText: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  weekNavigationTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  weekNavigationRange: { marginTop: 3, fontSize: 12, color: colors.textSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: colors.textSecondary },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
  },
  warningText: { flex: 1, marginLeft: 8, color: colors.text, lineHeight: 19 },
  section: { marginBottom: 22 },
  dateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
    marginBottom: 10,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 10,
  },
  typeMarker: { width: 5 },
  iceMarker: { backgroundColor: colors.accent },
  ofpMarker: { backgroundColor: colors.secondary },
  gameMarker: { backgroundColor: colors.success },
  cardContent: { flex: 1, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  iceBadge: { backgroundColor: '#E9F3FF' },
  ofpBadge: { backgroundColor: '#FFF0E9' },
  gameBadge: { backgroundColor: '#EAF7EF' },
  badgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  timeBlock: { alignItems: 'flex-end', marginLeft: 12 },
  time: { fontSize: 18, fontWeight: '800', color: colors.primary },
  duration: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
  trainingTitle: { marginTop: 10, fontSize: 16, fontWeight: '600', color: colors.text },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  detailText: { flex: 1, marginLeft: 6, color: colors.textSecondary, lineHeight: 18 },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 64 },
  emptyTitle: { marginTop: 14, fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyText: { marginTop: 8, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
