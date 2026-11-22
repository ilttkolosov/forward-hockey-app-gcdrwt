import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fetchWithTimeout } from './httpClient';
import { getProjectExpoPushToken, messengerNotificationPermissionGranted } from './messengerPush';
import { remotePushNotificationsSupported } from './runtimeEnvironment';
import { getActiveStartupConfig, getConfiguredApiUrl } from './startupConfigRuntime';
import { fetchTournamentConfig, getCachedTournamentConfig } from './tournamentsApi';

const SELECTION_KEY = 'match_push_subscriptions';
const TOKEN_KEY = 'expo_push_token';
const FORWARD_TEAM = '74';
const ALL_MATCHES = 'matches:all';
const SELECTED_TEAMS = 'matches:teams';

export const MATCH_PUSH_ENABLED_KEY = 'push_notifications_enabled';
export const MATCH_PUSH_CHANNEL = 'match-scores';

export type MatchPushSelection =
  | { mode: 'forward' }
  | { mode: 'all' }
  | { mode: 'teams'; teamIds: string[] };

export type MatchPushTeam = { id: string; name: string };

type SubscriptionResponse = {
  status?: string;
  message?: string;
  data?: { is_subscribed?: boolean; subscriptions?: unknown };
};

const defaultSelection: MatchPushSelection = { mode: 'forward' };

function teamIds(values: unknown): string[] {
  return Array.isArray(values)
    ? [...new Set(values.filter((id): id is string => typeof id === 'string' && /^[1-9]\d*$/.test(id)))]
    : [];
}

export function readMatchPushSelection(subscriptions: unknown): MatchPushSelection | null {
  if (!Array.isArray(subscriptions)) return null;
  if (subscriptions.includes(ALL_MATCHES)) return { mode: 'all' };
  const ids = teamIds(subscriptions.flatMap(value => {
    const match = typeof value === 'string' ? /^team:([1-9]\d*)$/.exec(value) : null;
    return match ? [match[1]] : [];
  }));
  if (ids.length === 1 && ids[0] === FORWARD_TEAM && !subscriptions.includes(SELECTED_TEAMS)) {
    return defaultSelection;
  }
  return ids.length ? { mode: 'teams', teamIds: ids } : null;
}

export function matchPushSubscriptions(selection: MatchPushSelection): string[] {
  if (selection.mode === 'all') return [ALL_MATCHES];
  if (selection.mode === 'forward') return [`team:${FORWARD_TEAM}`];
  const ids = teamIds(selection.teamIds);
  return ids.length ? [SELECTED_TEAMS, ...ids.map(id => `team:${id}`)] : [];
}

async function request(
  path: '/push-token' | '/push-subscription',
  method: 'POST' | 'DELETE',
  body: Record<string, unknown>,
): Promise<SubscriptionResponse> {
  const response = await fetchWithTimeout(getConfiguredApiUrl(path), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 6_000);
  const payload = await response.json().catch(() => null) as SubscriptionResponse | null;
  if (!response.ok || payload?.status !== 'success') {
    throw new Error(payload?.message || 'Не удалось обновить подписку на матчи');
  }
  return payload;
}

async function readLocalSelection(): Promise<MatchPushSelection> {
  try {
    const stored = await AsyncStorage.getItem(SELECTION_KEY);
    return readMatchPushSelection(stored ? JSON.parse(stored) : null) ?? defaultSelection;
  } catch {
    return defaultSelection;
  }
}

export async function getMatchPushSettings(): Promise<{ enabled: boolean; selection: MatchPushSelection }> {
  const local = await readLocalSelection();
  if (!remotePushNotificationsSupported) return { enabled: false, selection: local };
  const permission = await Notifications.getPermissionsAsync();
  if (!messengerNotificationPermissionGranted(permission)) return { enabled: false, selection: local };
  const token = await getProjectExpoPushToken();
  const { data } = await request('/push-subscription', 'POST', { token });
  const remote = readMatchPushSelection(data?.subscriptions);
  return {
    enabled: data?.is_subscribed === true && remote !== null,
    selection: remote ?? local,
  };
}

export async function saveMatchPushSelection(selection: MatchPushSelection, enabled: boolean): Promise<void> {
  const subscriptions = matchPushSubscriptions(selection);
  if (!subscriptions.length) throw new Error('Выберите хотя бы одну команду');
  if (enabled) {
    const token = await getProjectExpoPushToken();
    const osVersion = Platform.Version?.toString() || 'unknown';
    const deviceModel = Constants.deviceName || 'Unknown device';
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    await request('/push-token', 'POST', {
      token,
      subscriptions,
      device_info: `${Platform.OS} ${osVersion}, ${deviceModel}, v${appVersion}`,
    });
  }
  await AsyncStorage.setItem(SELECTION_KEY, JSON.stringify(subscriptions));
}

export async function enableMatchPush(): Promise<boolean> {
  if (!remotePushNotificationsSupported) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MATCH_PUSH_CHANNEL, {
      name: 'Уведомления о матчах',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!messengerNotificationPermissionGranted(permission) && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!messengerNotificationPermissionGranted(permission)) return false;
  await saveMatchPushSelection(await readLocalSelection(), true);
  return true;
}

export async function disableMatchPush(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY) || await getProjectExpoPushToken();
  await request('/push-token', 'DELETE', { token });
}

export async function loadMatchPushTeams(): Promise<MatchPushTeam[]> {
  const config = getActiveStartupConfig();
  if (!config) return [];
  const current = await Promise.all(config.tournamentsNow.map(async entry => {
    const id = String(entry.tournament_ID);
    try {
      return await fetchTournamentConfig(id);
    } catch (error) {
      const cached = await getCachedTournamentConfig(id);
      if (cached) return cached;
      throw error;
    }
  }));
  const leagueId = Number(config.league_id);
  const seasonId = Number(config.season_id);
  const rows = current
    .filter(table => (!leagueId || table.league_id === leagueId) && (!seasonId || table.season_id === seasonId))
    .flatMap(table => table.tables);
  const teams = new Map<string, MatchPushTeam>();
  for (const team of rows) {
    if (/^[1-9]\d*$/.test(team.team_id) && team.team_name.trim()) {
      teams.set(team.team_id, { id: team.team_id, name: team.team_name });
    }
  }
  return [...teams.values()].sort((left, right) => left.name.localeCompare(right.name, 'ru'));
}

export function matchPushEventId(data: Record<string, unknown> | undefined): string | null {
  if (data?.type !== 'match.score' && data?.type !== 'match.event') return null;
  const id = data.event_id;
  return (typeof id === 'number' || typeof id === 'string') && /^[1-9]\d*$/.test(String(id))
    ? String(id)
    : null;
}
