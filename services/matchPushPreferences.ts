import { getProjectExpoPushToken } from './messengerPush';
import { getConfiguredApiUrl } from './startupConfigRuntime';

export type MatchScope = 'forward' | 'all' | 'selected';
export type MatchPreferences = { mode: MatchScope; team_ids: number[] };
export type MatchTeam = { id: number; name: string };
export type MatchOptions = { preferences: MatchPreferences; teams: MatchTeam[] };

export async function matchOptions(preferences?: MatchPreferences): Promise<MatchOptions> {
  const token = await getProjectExpoPushToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(getConfiguredApiUrl('/fhr-match-preferences'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...(preferences ? { preferences } : {}) }),
      signal: controller.signal,
    });
    if (response.status === 404) throw new Error('Настройки матчей пока недоступны на сервере');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Не удалось получить настройки матчей');
    if (!['forward', 'all', 'selected'].includes(data.preferences?.mode)
        || !Array.isArray(data.preferences?.team_ids) || !Array.isArray(data.teams)) {
      throw new Error('Сервер вернул некорректные настройки матчей');
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
