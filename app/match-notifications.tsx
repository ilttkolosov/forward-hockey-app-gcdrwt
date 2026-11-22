import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { usePersistentBottomNavigationInset } from '../components/PersistentBottomNavigation';
import {
  getMatchPushSettings,
  loadMatchPushTeams,
  saveMatchPushSelection,
  type MatchPushSelection,
  type MatchPushTeam,
} from '../services/matchPush';
import { useStartupFeature } from '../services/startupConfigRuntime';
import { buttonStyles, colors, commonStyles } from '../styles/commonStyles';

const options = [
  { mode: 'forward', label: 'Только «Динамо-Форвард»' },
  { mode: 'all', label: 'Все матчи' },
  { mode: 'teams', label: 'Выбранные команды' },
] as const;

export default function MatchNotificationsScreen() {
  const router = useRouter();
  const bottomInset = usePersistentBottomNavigationInset();
  const pushEnabled = useStartupFeature('push_notifications');
  const [mode, setMode] = useState<MatchPushSelection['mode']>('forward');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<MatchPushTeam[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getMatchPushSettings().then(settings => {
      if (!active) return;
      setEnabled(settings.enabled);
      setMode(settings.selection.mode);
      setTeamIds(settings.selection.mode === 'teams' ? settings.selection.teamIds : []);
    }).catch(() => {
      if (active) setError('Не удалось загрузить подписку на матчи.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    void loadMatchPushTeams().then(list => {
      if (active) setTeams(list);
    }).catch(() => {
      if (active) setTeams([]);
    });
    return () => { active = false; };
  }, [attempt]);

  const save = async () => {
    if (!pushEnabled || enabled === null || saving) return;
    setSaving(true);
    setError('');
    const selection: MatchPushSelection = mode === 'teams' ? { mode, teamIds } : { mode };
    try {
      await saveMatchPushSelection(selection, enabled);
      router.back();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось сохранить выбор.');
      setSaving(false);
    }
  };

  const toggleTeam = (id: string) => {
    setTeamIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };

  const canEdit = pushEnabled && enabled !== null && !saving;
  const canSave = canEdit && (mode !== 'teams' || teamIds.length > 0);
  const unavailableTeams = teams?.length
    ? teamIds.filter(id => !teams.some(team => team.id === id))
    : [];
  return (
    <SafeAreaView edges={['top']} style={commonStyles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={() => router.back()} disabled={saving} hitSlop={12}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Уведомления о матчах</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 24 }]}>
        {!pushEnabled && <Text style={styles.note}>Матчевые PUSH временно отключены.</Text>}
        {loading && <ActivityIndicator color={colors.primary} />}
        {!loading && enabled === false && (
          <Text style={styles.note}>Будем использовать этот выбор, когда вы включите уведомления о матчах.</Text>
        )}
        {!loading && enabled !== null && (
          <>
            <View style={styles.card}>
              {options.map(option => (
                <Pressable key={option.mode} accessibilityRole="radio" accessibilityState={{ checked: mode === option.mode, disabled: !canEdit }}
                  disabled={!canEdit} onPress={() => setMode(option.mode)} style={styles.row}>
                  <Text style={styles.label}>{option.label}</Text>
                  <Icon name={mode === option.mode ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.primary} />
                </Pressable>
              ))}
            </View>
            {mode === 'teams' && (
              <View style={styles.card}>
                {teams === null && <ActivityIndicator color={colors.primary} />}
                {teams?.length === 0 && <Text style={styles.note}>Список команд турнира пока недоступен.</Text>}
                {teams?.map(team => {
                  const checked = teamIds.includes(team.id);
                  return (
                    <Pressable key={team.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: !canEdit }}
                      disabled={!canEdit} onPress={() => toggleTeam(team.id)} style={styles.row}>
                      <Text style={styles.label}>{team.name}</Text>
                      <Icon name={checked ? 'checkbox-outline' : 'square-outline'} size={22} color={colors.primary} />
                    </Pressable>
                  );
                })}
                {unavailableTeams.length > 0 && (
                  <Pressable accessibilityRole="button" disabled={!canEdit}
                    onPress={() => setTeamIds(ids => ids.filter(id => !unavailableTeams.includes(id)))} style={styles.row}>
                    <Text style={styles.label}>Удалить из выбора команды вне текущего турнира</Text>
                    <Icon name="close-circle-outline" size={22} color={colors.primary} />
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}
        {error !== '' && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!loading && enabled === null && (
          <Pressable accessibilityRole="button" style={buttonStyles.outline} onPress={() => {
            setLoading(true);
            setError('');
            setAttempt(value => value + 1);
          }}>
            <Text style={styles.label}>Повторить</Text>
          </Pressable>
        )}
        {!loading && enabled !== null && (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={save}
            style={[buttonStyles.primary, !canSave && styles.disabled]}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.save}>Сохранить</Text>}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontWeight: '800', fontSize: 24, flex: 1 },
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 52, paddingVertical: 8 },
  label: { fontSize: 16, color: colors.text, flexShrink: 1 },
  note: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, paddingVertical: 8 },
  error: { fontSize: 14, lineHeight: 20, color: colors.error },
  disabled: { opacity: 0.45 },
  save: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
