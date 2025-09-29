import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  downloadAsync,
  deleteAsync
} from 'expo-file-system';
import { Player } from '../types';

interface PlayerListItem {
  id: string;
  name: string;
  number: number;
  position: string;
  birth_date: string;
}

interface PlayerDetails {
  id: string;
  name: string;
  number: number;
  position: string;
  birth_date: string;
  metrics: {
    onetwofive: string; // handedness
    height: string;
    weight: string;
    ka: string; // captain status
  };
}

interface PlayerPhoto {
  id: string;
  photo_url: string;
}

const PLAYERS_DATA_LOADED_KEY = 'playersDataLoaded';
const PLAYERS_STORAGE_KEY = 'localPlayersData';
const PLAYERS_DIRECTORY = `${documentDirectory || ''}players/`;

export class PlayerDownloadService {
  private baseUrl = 'https://www.hc-forward.com/wp-json/app/v1'; // ← пробелы удалены

  async isDataLoaded(): Promise<boolean> {
    try {
      const loaded = await AsyncStorage.getItem(PLAYERS_DATA_LOADED_KEY);
      return loaded === 'true';
    } catch (error) {
      console.error('Error checking if data is loaded:', error);
      return false;
    }
  }

  async setDataLoaded(loaded: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(PLAYERS_DATA_LOADED_KEY, loaded.toString());
    } catch (error) {
      console.error('Error setting data loaded flag:', error);
    }
  }

  async ensurePlayersDirectoryExists(): Promise<void> {
    try {
      const dirInfo = await getInfoAsync(PLAYERS_DIRECTORY);
      if (!dirInfo.exists) {
        await makeDirectoryAsync(PLAYERS_DIRECTORY, { intermediates: true });
        console.log('Created players directory:', PLAYERS_DIRECTORY);
      }
    } catch (error) {
      console.error('Error creating players directory:', error);
    }
  }

  async downloadAndCacheImage(url: string, playerId: string): Promise<string | null> {
    try {
      if (!url) return null;

      await this.ensurePlayersDirectoryExists();
      
      const filename = `player_${playerId}.jpg`;
      const fileUri = PLAYERS_DIRECTORY + filename;
      
      console.log(`Downloading image for player ${playerId} from ${url}`);
      
      const downloadResult = await downloadAsync(url, fileUri);
      
      if (downloadResult.status === 200) {
        console.log(`Successfully downloaded image for player ${playerId} to ${downloadResult.uri}`);
        return downloadResult.uri;
      } else {
        console.error(`Failed to download image for player ${playerId}, status: ${downloadResult.status}`);
        return null;
      }
    } catch (error) {
      console.error(`Error downloading image for player ${playerId}:`, error);
      return null;
    }
  }

  async fetchPlayersList(): Promise<PlayerListItem[]> {
    try {
      console.log('Fetching players list from API...');
      const response = await fetch(`${this.baseUrl}/get-player/`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`Fetched ${result.data?.length || 0} players from list endpoint`);
      
      // 🔥 ИСПРАВЛЕНИЕ: приводим id к строке
      return (result.data || []).map((item: any) => ({
        id: String(item.id),
        name: item.name,
        number: item.number,
        position: item.position,
        birth_date: item.birth_date,
      }));
    } catch (error) {
      console.error('Error fetching players list:', error);
      throw error;
    }
  }

  async fetchPlayerDetails(playerId: string): Promise<PlayerDetails> {
    try {
      console.log(`Fetching details for player ${playerId}...`);
      const response = await fetch(`${this.baseUrl}/get-player/${playerId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`Fetched details for player ${playerId}`);

      // 🔥 ИСПРАВЛЕНИЕ: приводим id к строке
      return {
        id: String(result.data.id),
        name: result.data.name,
        number: result.data.number,
        position: result.data.position,
        birth_date: result.data.birth_date,
        metrics: result.data.metrics || {
          onetwofive: '',
          height: '',
          weight: '',
          ka: ''
        }
      };
    } catch (error) {
      console.error(`Error fetching details for player ${playerId}:`, error);
      throw error;
    }
  }

  async fetchPlayerPhoto(playerId: string): Promise<PlayerPhoto | null> {
    try {
      console.log(`Fetching photo for player ${playerId}...`);
      const response = await fetch(`${this.baseUrl}/get-photo-players/${playerId}`);
      
      if (!response.ok) {
        console.log(`No photo available for player ${playerId}`);
        return null;
      }
      
      const result = await response.json();
      console.log(`Fetched photo for player ${playerId}`);
      
      return {
        id: String(result.data.id),
        photo_url: result.data.photo_url
      };
    } catch (error) {
      console.error(`Error fetching photo for player ${playerId}:`, error);
      return null;
    }
  }

  private calculateAge(birthDate: string): number {
    try {
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      
      return age;
    } catch (error) {
      console.error('Error calculating age:', error);
      return 0;
    }
  }

  private convertToPlayer(
    listItem: PlayerListItem,
    details: PlayerDetails,
    photoPath: string | null
  ): Player {
    const height = details.metrics?.height ? parseInt(details.metrics.height) || 0 : 0;
    const weight = details.metrics?.weight ? parseInt(details.metrics.weight) || 0 : 0;
    
    return {
      id: listItem.id,
      fullName: details.name,
      name: details.name,
      number: details.number,
      position: details.position,
      birthDate: details.birth_date,
      age: this.calculateAge(details.birth_date),
      handedness: details.metrics?.onetwofive || '',
      height: height,
      weight: weight,
      captainStatus: details.metrics?.ka || '',
      photoPath: photoPath || '',
      // Legacy fields for compatibility
      photo: photoPath || '',
      isCaptain: details.metrics?.ka === 'К',
      isAssistantCaptain: details.metrics?.ka === 'А',
    };
  }

  async processPlayersConcurrently(
    playersList: PlayerListItem[],
    onProgress?: (stage: string, current?: number, total?: number) => void,
    concurrencyLimit: number = 5
  ): Promise<Player[]> {
    const allPlayers: Player[] = [];
    let processed = 0;

    for (let i = 0; i < playersList.length; i += concurrencyLimit) {
      const batch = playersList.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(async (player) => {
        try {
          const [details, photoData] = await Promise.allSettled([
            this.fetchPlayerDetails(player.id),
            this.fetchPlayerPhoto(player.id)
          ]);

          let playerDetails: PlayerDetails;
          if (details.status === 'fulfilled') {
            playerDetails = details.value;
          } else {
            console.error(`Failed to load details for player ${player.id}:`, details.reason);
            playerDetails = {
              id: player.id,
              name: player.name,
              number: player.number,
              position: player.position,
              birth_date: player.birth_date,
              metrics: {
                onetwofive: '',
                height: '',
                weight: '',
                ka: ''
              }
            };
          }

          let photoPath: string | null = null;
          if (photoData.status === 'fulfilled' && photoData.value?.photo_url) {
            try {
              photoPath = await this.downloadAndCacheImage(photoData.value.photo_url, player.id);
            } catch (photoError) {
              console.warn(`Failed to download photo for player ${player.id}:`, photoError);
            }
          }

          const localPlayer = this.convertToPlayer(player, playerDetails, photoPath);
          
          processed++;
          onProgress?.('Загрузка данных игроков…', processed, playersList.length);
          
          return localPlayer;
        } catch (error) {
          console.error(`Failed to process player ${player.id}:`, error);
          processed++;
          onProgress?.('Загрузка данных игроков…', processed, playersList.length);
          
          return this.convertToPlayer(player, {
            id: player.id,
            name: player.name,
            number: player.number,
            position: player.position,
            birth_date: player.birth_date,
            metrics: {
              onetwofive: '',
              height: '',
              weight: '',
              ka: ''
            }
          }, null);
        }
      });

      const batchResults = await Promise.all(batchPromises);
      allPlayers.push(...batchResults);
    }

    return allPlayers;
  }

  async loadAllPlayersData(
    onProgress?: (stage: string, current?: number, total?: number) => void
  ): Promise<Player[]> {
    try {
      console.log('Starting complete player data loading process...');
      
      onProgress?.('Загрузка списка игроков…');
      const playersList = await this.fetchPlayersList();
      console.log(`Loaded ${playersList.length} players from list`);

      if (playersList.length === 0) {
        console.warn('No players found in the list');
        return [];
      }

      const allPlayers = await this.processPlayersConcurrently(
        playersList,
        onProgress,
        5
      );

      allPlayers.sort((a, b) => a.number - b.number);

      onProgress?.('Сохранение данных…');
      await this.savePlayersToStorage(allPlayers);
      await this.setDataLoaded(true);

      console.log(`Successfully loaded and cached ${allPlayers.length} players`);
      return allPlayers;
    } catch (error) {
      console.error('Error loading all players data:', error);
      throw error;
    }
  }

  async savePlayersToStorage(players: Player[]): Promise<void> {
    try {
      const playersData = JSON.stringify(players);
      await AsyncStorage.setItem(PLAYERS_STORAGE_KEY, playersData);
      console.log(`Saved ${players.length} players to local storage`);
    } catch (error) {
      console.error('Error saving players to storage:', error);
      throw error;
    }
  }

  async getPlayersFromStorage(): Promise<Player[]> {
    try {
      const playersData = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
      if (playersData) {
        const players = JSON.parse(playersData);
        console.log(`Loaded ${players.length} players from local storage`);
        return players;
      }
      return [];
    } catch (error) {
      console.error('Error loading players from storage:', error);
      return [];
    }
  }

  async refreshPlayersData(
    onProgress?: (stage: string, current?: number, total?: number) => void
  ): Promise<Player[]> {
    try {
      console.log('Refreshing players data...');
      await this.setDataLoaded(false);
      return await this.loadAllPlayersData(onProgress);
    } catch (error) {
      console.error('Error refreshing players data:', error);
      throw error;
    }
  }

  async clearAllData(): Promise<void> {
    try {
      console.log('Clearing all player data...');
      
      await AsyncStorage.removeItem(PLAYERS_DATA_LOADED_KEY);
      await AsyncStorage.removeItem(PLAYERS_STORAGE_KEY);
      
      try {
        const dirInfo = await getInfoAsync(PLAYERS_DIRECTORY);
        if (dirInfo.exists) {
          await deleteAsync(PLAYERS_DIRECTORY, { idempotent: true });
          console.log('Cleared players directory');
        }
      } catch (error) {
        console.warn('Error clearing players directory:', error);
      }
      
      console.log('All player data cleared');
    } catch (error) {
      console.error('Error clearing player data:', error);
      throw error;
    }
  }
}

export const playerDownloadService = new PlayerDownloadService();