// services/teamStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiTeam } from '../types';
import * as FileSystem from 'expo-file-system/legacy';
import { getBundledTeamLogoUri, hasBundledTeamLogo } from '../utils/teamLogos';

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
    // Встроенный asset всегда имеет приоритет и доступен сразу после установки.
    const bundledUri = getBundledTeamLogoUri(teamId);
    if (bundledUri) return bundledUri;
    return await AsyncStorage.getItem(`${TEAM_LOGO_PREFIX}${teamId}`);
  } catch (error) {
    console.error(`Failed to load logo for team ${teamId}`, error);
    return null;
  }
};

const getLogoExtension = (url: string): string => {
  const cleanUrl = url.split(/[?#]/, 1)[0];
  const match = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
  const extension = match?.[1]?.toLowerCase();
  return extension && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)
    ? extension
    : 'jpg';
};

const toSecureLogoUrl = (url: string): string => url.replace(/^http:\/\//i, 'https://');

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
  const teamsWithLogos = teams.filter(team => Boolean(team.logo_url?.trim()));
  const bundledCount = teamsWithLogos.filter(team => hasBundledTeamLogo(team.id)).length;
  const downloadableTeams = teamsWithLogos.filter(team => !hasBundledTeamLogo(team.id));
  const total = teamsWithLogos.length;
  const missingTeams: { team: ApiTeam; fileUri: string }[] = [];

  if (downloadableTeams.length === 0) {
    onProgress?.(total, total);
    console.log(`✅ Подключено ${bundledCount} встроенных логотипов команд`);
    return;
  }

  try {
    const directoryInfo = await FileSystem.getInfoAsync(logoDirPath);
    if (!directoryInfo.exists) {
      await FileSystem.makeDirectoryAsync(logoDirPath, { intermediates: true });
    }
  } catch (error) {
    console.warn('⚠️ Не удалось подготовить папку загружаемых логотипов:', error);
    onProgress?.(bundledCount, total);
    return;
  }

  // Проверяем только новые команды, для которых пока нет встроенного asset.
  for (const team of downloadableTeams) {
    const storedUri = await AsyncStorage.getItem(`${TEAM_LOGO_PREFIX}${team.id}`);
    const fileName = `team_${team.id}.${getLogoExtension(team.logo_url)}`;
    const fileUri = storedUri || `${logoDirPath}${fileName}`;

    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        missingTeams.push({ team, fileUri: `${logoDirPath}${fileName}` });
      } else if (!storedUri) {
        await saveTeamLogo(team.id, fileUri);
      }
    } catch (e) {
      console.warn(`Ошибка проверки логотипа команды ${team.id}:`, e);
      missingTeams.push({ team, fileUri: `${logoDirPath}${fileName}` });
    }
  }

  if (missingTeams.length === 0) {
    onProgress?.(total, total);
    console.log(`✅ Логотипы команд готовы: встроено ${bundledCount}, загружено ${downloadableTeams.length}`);
    return;
  }

  console.log(`🖼️ Найдено ${missingTeams.length} отсутствующих логотипов`);
  onProgress?.(bundledCount + downloadableTeams.length - missingTeams.length, total);

  // Загружаем только логотипы команд, которых ещё не было при сборке приложения.
  for (let i = 0; i < missingTeams.length; i++) {
    const { team, fileUri } = missingTeams[i];

    try {
      const result = await FileSystem.downloadAsync(toSecureLogoUrl(team.logo_url), fileUri);
      if (result.status === 200) {
        await saveTeamLogo(team.id, result.uri);
        console.log(`✅ Логотип команды ${team.id} восстановлен`);
      }
    } catch (err) {
      console.warn(`❌ Не удалось восстановить логотип команды ${team.id}:`, err);
    }

    onProgress?.(total - missingTeams.length + i + 1, total);
  }
};
