import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiTeam } from '../types';

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

// Сохранить логотип команды (base64 или URI)
export const saveTeamLogo = async (teamId: string, logoUri: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${TEAM_LOGO_PREFIX}${teamId}`, logoUri);
  } catch (error) {
    console.error(`Failed to save logo for team ${teamId}`, error);
  }
};

// Загрузить логотип команды
export const loadTeamLogo = async (teamId: string): Promise<string | null> => {
  try {
    const uri = await AsyncStorage.getItem(`${TEAM_LOGO_PREFIX}${teamId}`);
    //console.log(`[DEBUG] loadTeamLogo(${teamId}) → ${uri || 'null'}`);
    return uri;
  } catch (error) {
    console.error(`Failed to load logo for team ${teamId}`, error);
    return null;
  }
};