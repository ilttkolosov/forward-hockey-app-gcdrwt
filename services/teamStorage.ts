// services/teamStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiTeam } from '../types';
import * as FileSystem from 'expo-file-system/legacy';

const TEAM_LIST_KEY = '@team_list';
const TEAM_LOGO_PREFIX = '@team_logo_';

// Сохранить список команд
export const saveTeamList = async (teams: ApiTeam[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(TEAM_LIST_KEY, JSON.stringify(teams));
  } catch (error) {
    console.error('Failed to save team list', error);
  }
};

// Загрузить список команд
export const loadTeamList = async (): Promise<ApiTeam[] | null> => {
  try {
    const json = await AsyncStorage.getItem(TEAM_LIST_KEY);
    return json ? JSON.parse(json) : null;
  } catch (error) {
    console.error('Failed to load team list', error);
    return null;
  }
};

// Сохранить логотип команды (URI файла)
export const saveTeamLogo = async (teamId: string, logoUri: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${TEAM_LOGO_PREFIX}${teamId}`, logoUri);
  } catch (error) {
    console.error(`Failed to save logo for team ${teamId}`, error);
  }
};

// Загрузить логотип команды (URI файла)
export const loadTeamLogo = async (teamId: string): Promise<string | null> => {
  try {
    const uri = await AsyncStorage.getItem(`${TEAM_LOGO_PREFIX}${teamId}`);
    return uri;
  } catch (error) {
    console.error(`Failed to load logo for team ${teamId}`, error);
    return null;
  }
};

/**
 * Проверяет наличие логотипов для всех команд и восстанавливает отсутствующие.
 * Вызывается после загрузки списка команд и ДО начала загрузки игр.
 */
export const verifyAndRestoreTeamLogos = async (
  teams: ApiTeam[],
  onProgress?: (current: number, total: number) => void
): Promise<void> => {
  const documentDir = FileSystem.documentDirectory;
  if (!documentDir) {
    console.warn('⚠️ documentDirectory недоступен — пропускаем проверку логотипов');
    onProgress?.(0, 0);
    return;
  }

  const logoDirPath = `${documentDir}team_logos/`;
  const total = teams.length;
  const missingTeams: ApiTeam[] = [];

  // 1. Проверяем наличие файла для каждой команды
  for (const team of teams) {
    if (!team.logo_url) continue;

    const fileName = `team_${team.id}.jpg`;
    const fileUri = `${logoDirPath}${fileName}`;

    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        missingTeams.push(team);
      }
    } catch (e) {
      console.warn(`Ошибка проверки логотипа команды ${team.id}:`, e);
      missingTeams.push(team);
    }
  }

  if (missingTeams.length === 0) {
    onProgress?.(total, total);
    console.log('✅ Все логотипы команд на месте');
    return;
  }

  console.log(`🖼️ Найдено ${missingTeams.length} отсутствующих логотипов`);
  onProgress?.(0, missingTeams.length);

  // 2. Восстанавливаем отсутствующие
  for (let i = 0; i < missingTeams.length; i++) {
    const team = missingTeams[i];
    const fileName = `team_${team.id}.jpg`;
    const fileUri = `${logoDirPath}${fileName}`;

    try {
      const result = await FileSystem.downloadAsync(team.logo_url, fileUri);
      if (result.status === 200) {
        await saveTeamLogo(team.id, result.uri);
        console.log(`✅ Логотип команды ${team.id} восстановлен`);
      }
    } catch (err) {
      console.warn(`❌ Не удалось восстановить логотип команды ${team.id}:`, err);
    }

    onProgress?.(i + 1, missingTeams.length);
  }
};