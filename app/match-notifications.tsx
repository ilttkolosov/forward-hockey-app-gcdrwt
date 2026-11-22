import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../components/Icon';
import { usePersistentBottomNavigationInset } from '../components/PersistentBottomNavigation';
import { matchOptions, type MatchOptions, type MatchPreferences, type MatchScope } from '../services/matchPushPreferences';
import { useStartupFeature } from '../services/startupConfigRuntime';
import { colors, commonStyles } from '../styles/commonStyles';

const modes: [MatchScope, string][] = [
  ['forward', 'Только «Динамо-Форвард»'],
  ['all', 'Все матчи первенства на сайте'],
  ['selected', 'Выбранные команды'],
];

export default function MatchNotifications() {
  const router = useRouter();
  const inset = usePersistentBottomNavigationInset();
  const enabled = useStartupFeature('push_notifications');
  const [options, setOptions] = useState<MatchOptions | null>(null);
  const [draft, setDraft] = useState<MatchPreferences | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    if (!enabled) {
      setError('Уведомления отключены в настройках приложения');
      return;
    }
    setError('');
    void matchOptions().then(result => {
      if (current) {
        setOptions(result);
        setDraft(result.preferences);
      }
    }).catch((reason: unknown) => {
      if (current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить команды');
    });
    return () => { current = false; };
  }, [enabled, retry]);

  const toggleTeam = (id: number) => {
    setDraft(value => {
      if (!value) return value;
      return { ...value, team_ids: value.team_ids.includes(id)
        ? value.team_ids.filter(team => team !== id) : [...value.team_ids, id] };
    });
  };

  const save = async () => {
    if (!draft || !options || saving) return;
    setSaving(true);
    setError('');
    try {
      const team_ids = draft.team_ids.filter(id => options.teams.some(team => team.id === id));
      await matchOptions({ mode: draft.mode, team_ids: draft.mode === 'selected' ? team_ids : [] });
      router.back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить выбор');
    } finally {
      setSaving(false);
    }
  };

  const canSave = draft && (draft.mode !== 'selected'
    || options?.teams.some(team => draft.team_ids.includes(team.id)));
  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={() => router.back()} hitSlop={10}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Уведомления о матчах</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: inset + 20 }]}>
        <Text style={styles.description}>Присылать изменения счёта в матчах 2014 г.р.</Text>
        {enabled && !options && !error && <ActivityIndicator color={colors.primary} />}
        {enabled && options && draft && (
          <>
            {modes.map(([mode, label]) => (
              <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ checked: draft.mode === mode }}
                disabled={saving} style={styles.row} onPress={() => setDraft({ ...draft, mode })}>
                <Text style={styles.label}>{label}</Text>
                <Icon name={mode === draft.mode ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.primary} />
              </Pressable>
            ))}
            {draft.mode === 'selected' && <View style={styles.list}>
              {options.teams.length === 0 && <Text>В календаре пока нет команд.</Text>}
              {draft.team_ids.some(id => !options.teams.some(team => team.id === id)) && (
                <Text style={styles.description}>Состав первенства изменился. Проверьте выбор команд.</Text>
              )}
              {options.teams.map(team => (
                <Pressable key={team.id} accessibilityRole="checkbox"
                  accessibilityState={{ checked: draft.team_ids.includes(team.id) }}
                  disabled={saving} style={styles.row} onPress={() => toggleTeam(team.id)}>
                  <Text style={styles.label}>{team.name}</Text>
                  <Icon name={draft.team_ids.includes(team.id) ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
                </Pressable>
              ))}
            </View>}
            <Pressable onPress={save} disabled={!canSave || saving}
              accessibilityRole="button" style={[styles.button, (!canSave || saving) && styles.disabled]}>
              <Text style={styles.buttonText}>{saving ? 'Сохранение…' : 'Сохранить'}</Text>
            </Pressable>
          </>
        )}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {enabled && !options && !!error && (
          <Pressable onPress={() => setRetry(value => value + 1)} accessibilityRole="button" style={styles.row}>
            <Text style={styles.label}>Повторить</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  content: { paddingHorizontal: 18 },
  description: { color: colors.textSecondary, fontSize: 15, marginVertical: 12 },
  label: { color: colors.text, fontSize: 16, flex: 1, paddingRight: 10 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  list: { marginTop: 14 },
  button: { marginTop: 22, borderRadius: 8, padding: 14, backgroundColor: colors.primary, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.white },
  disabled: { opacity: 0.5 },
  error: { color: colors.error, marginVertical: 12 },
});
