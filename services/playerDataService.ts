// services/playerDataService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  downloadAsync,
  deleteAsync
} from 'expo-file-system/legacy'; // <-- ВАЖНО: /legacy в конце
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
const PLAYER_PHOTOS_DOWNLOADED_KEY = 'playerPhotosDownloaded'; // <-- НОВЫЙ ФЛАГ
const PLAYERS_DIRECTORY = `${documentDirectory || ''}players/`;

export class PlayerDownloadService {
  private baseUrl = 'https://www.hc-forward.com/wp-json/app/v1';

  async isDataLoaded(): Promise<boolean> {
    try {
      const loaded = await AsyncStorage.getItem(PLAYERS_DATA_LOADED_KEY);
      return loaded === 'true';
    } catch (error) {
      console.error('Error checking if data is loaded:', error);
      return false;
    }
  }

  // --- НОВАЯ ФУНКЦИЯ ДЛЯ ПРОВЕРКИ ФЛАГА ФОТО ---
  async arePhotosDownloaded(): Promise<boolean> {
    try {
      const downloaded = await AsyncStorage.getItem(PLAYER_PHOTOS_DOWNLOADED_KEY);
      return downloaded === 'true';
    } catch (error) {
      console.error('Error checking if photos are downloaded:', error);
      return false; // В случае ошибки считаем, что фото не загружены
    }
  }

  // --- НОВАЯ ФУНКЦИЯ ДЛЯ РУЧНОЙ УСТАНОВКИ ФЛАГА (для отладки) ---
  async setPhotosDownloadedFlag(downloaded: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(PLAYER_PHOTOS_DOWNLOADED_KEY, downloaded.toString());
      console.log(`PlayerDownloadService: PLAYER_PHOTOS_DOWNLOADED_KEY set to ${downloaded}`);
    } catch (error) {
      console.error('Error setting photos downloaded flag:', error);
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

  // Проверяет наличие фото для списка игроков и перезагружает отсутствующие
  async verifyAndRestorePlayerPhotos(
    players: Player[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    console.log(`🔍 Проверка фото для ${players.length} игроков...`);
    await this.ensurePlayersDirectoryExists();
    
    let downloadedCount = 0;
    const total = players.length;

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      let photoExists = false;

      try {
        if (player.photoPath) {
          const fileInfo = await getInfoAsync(player.photoPath);
          photoExists = fileInfo.exists;
        }
      } catch (e) {
        console.warn(`Ошибка проверки фото для игрока ${player.id}:`, e);
      }

      if (!photoExists) {
        console.log(`🖼️ Фото для игрока ${player.id} отсутствует — загружаем...`);
        const photoData = await this.fetchPlayerPhoto(player.id);
        if (photoData?.photo_url) {
          const newPhotoPath = await this.downloadAndCacheImage(photoData.photo_url, player.id);
          if (newPhotoPath) {
            // Обновляем путь в объекте игрока
            player.photoPath = newPhotoPath;
            player.photo = newPhotoPath; // для совместимости
            downloadedCount++;
          }
        }
      }

      onProgress?.(i + 1, total);
    }

    // Сохраняем обновлённые пути
    if (downloadedCount > 0) {
      await this.savePlayersToStorage(players);
      console.log(`✅ Восстановлено ${downloadedCount} фото игроков`);
    } else {
      console.log('✅ Все фото игроков на месте');
    }
  }



  //Загрузка фото игроков в оптимальном разрешении  
  async downloadAndCacheImage(originalUrl: string, playerId: string): Promise<string | null> {
    if (!originalUrl) return null;
  
    const normalizedUrl = originalUrl.trim();
    if (!normalizedUrl) return null;
  
    // Определяем расширение файла (последнее вхождение точки)
    const lastDotIndex = normalizedUrl.lastIndexOf('.');
    if (lastDotIndex === -1) {
      console.warn(`PlayerDownloadService: No file extension found in URL for player ${playerId}: ${normalizedUrl}`);
      return null;
    }
  
    const base = normalizedUrl.substring(0, lastDotIndex);
    const ext = normalizedUrl.substring(lastDotIndex); // включая точку: ".jpg"
  
  
    console.log(`Используем  обновленную функцию downloadAndCacheImage`);
    //https://www.hc-forward.com/wp-content/uploads/2014/02/12_petrichko-300x300.jpg
    // Список суффиксов в порядке приоритета
    const sizeSuffixes = ['-640x480', '-300x300', '-150x150'];
    const candidates = [
      ...sizeSuffixes.map(suffix => `${base}${suffix}${ext}`),
      normalizedUrl, // fallback: оригинал
    ];
  
  
  
    // Проверка существования файла через HEAD-запрос
    const checkUrlExists = async (url: string): Promise<boolean> => {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
      } catch (error) {
        console.warn(`PlayerDownloadService: HEAD check failed for ${url}:`, error);
        return false;
      }
    };
  
    // Ищем первый доступный URL
    let finalUrl = normalizedUrl;
    for (const url of candidates) {
      if (await checkUrlExists(url)) {
        finalUrl = url;
        console.log(`PlayerDownloadService: Selected image for player ${playerId}: ${url}`);
        break;
      } else {
        console.log(`PlayerDownloadService: Image not found: ${url}`);
      }
    }
  
    try {
      await this.ensurePlayersDirectoryExists();
      const filename = `player_${playerId}${ext}`;
      const fileUri = `${PLAYERS_DIRECTORY}${filename}`;
      console.log(`PlayerDownloadService: Downloading image for player ${playerId} from ${finalUrl}`);
  
      const downloadResult = await downloadAsync(finalUrl, fileUri);
      if (downloadResult.status === 200) {
        console.log(`PlayerDownloadService: Successfully downloaded image for player ${playerId} to ${downloadResult.uri}`);
        return downloadResult.uri;
      } else {
        console.error(`PlayerDownloadService: Failed to download image for player ${playerId}, status: ${downloadResult.status}`);
        return null;
      }
    } catch (error) {
      console.error(`PlayerDownloadService: Error downloading image for player ${playerId}:`, error);
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
      console.log(`Fetched ${result.data?.length || 0} players from list endpoint. Это функция fetchPlayersList() из файла playerDataService`);

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
      console.log(`Fetched details for player ${playerId}. Это fetchPlayerDetails() из файла playerDataService`);

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

  // --- ОБНОВЛЁННАЯ ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ ФОТО ---
  // --- ОБНОВЛЁННАЯ ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ ФОТО ---
async fetchPlayerPhoto(playerId: string): Promise<PlayerPhoto | null> {
  try {
    console.log(`Fetching photo for player ${playerId}...`);
    const response = await fetch(`${this.baseUrl}/get-photo-players/${playerId}`);

    // Проверяем статус ответа
    if (!response.ok) {
      console.log(`No photo available for player ${playerId} (HTTP ${response.status})`);
      return null; // Если сервер вернул 404 или другую ошибку, считаем, что фото нет
    }

    const result = await response.json();
    console.log(`Fetched photo response for player ${playerId}:`, result); // Логируем ответ для отладки

    // Проверяем, содержит ли ответ ожидаемую структуру
    // Ожидаем: { id: "...", photo_url: "..." } (без обёртки data)
    if (result && typeof result === "object" && result.id && result.photo_url) {
        // Убедимся, что photo_url - это строка и уберём пробелы
        const cleanPhotoUrl = result.photo_url?.trim();
        if (cleanPhotoUrl) {
          console.log(`Fetched photo for player ${playerId}:`, cleanPhotoUrl);
          // Возвращаем объект с id (преобразованным в строку) и URL
          return {
            id: String(result.id),
            photo_url: cleanPhotoUrl
          };
        } else {
          console.log(`Photo URL is empty for player ${playerId} in response`);
          return null;
        }
    } else {
      // Если структура не соответствует
      console.log(`Photo response for player ${playerId} is missing 'id' or 'photo_url' or is not an object`, result);
      return null;
    }

  } catch (error) {
    // Обработка ошибок сети или JSON.parse
    console.error(`Error fetching photo for player ${playerId}:`, error);
    return null; // Возвращаем null в случае любой ошибки
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

  // --- ОБНОВЛЁННАЯ ФУНКЦИЯ ДЛЯ ОБРАБОТКИ ИГРОКОВ ---
  async processPlayersConcurrently(
    playersList: PlayerListItem[],
    onProgress?: (stage: string, current?: number, total?: number) => void,
    concurrencyLimit: number = 5,
    skipPhotoDownload: boolean = false // <-- НОВЫЙ ПАРАМЕТР
  ): Promise<Player[]> {
    const allPlayers: Player[] = [];
    let processed = 0;

    for (let i = 0; i < playersList.length; i += concurrencyLimit) {
      const batch = playersList.slice(i, i + concurrencyLimit);

      const batchPromises = batch.map(async (player) => {
        try {
          const [details, photoData] = await Promise.allSettled([
            this.fetchPlayerDetails(player.id),
            skipPhotoDownload ? null : this.fetchPlayerPhoto(player.id) // <-- УСЛОВИЕ НА ЗАГРУЗКУ ФОТО
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
          if (!skipPhotoDownload && photoData.status === 'fulfilled' && photoData.value?.photo_url) { // <-- УСЛОВИЕ НА ОБРАБОТКУ ФОТО
            try {
              photoPath = await this.downloadAndCacheImage(photoData.value.photo_url, player.id);
            } catch (photoError) {
              console.warn(`Failed to download photo for player ${player.id}:`, photoError);
            }
          } else if (skipPhotoDownload) {
             console.log(`Skipping photo download for player ${player.id} based on flag.`); // <-- ЛОГ ДЛЯ ОТЛАДКИ
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

  // --- ОБНОВЛЁННАЯ ФУНКЦИЯ ДЛЯ ЗАГРУЗКИ ВСЕХ ДАННЫХ ---
   async loadAllPlayersData(
    onProgress?: (stage: string, current?: number, total?: number) => void
    ): Promise<Player[]> {
    try {
            // --- НАЧАЛО: Принудительная очистка для отладки ---
      // ВРЕМЕННО: Раскомментируйте следующую строку для принудительной перезагрузки
       console.log('PlayerDownloadService: DEBUG - Clearing all data before loading...');
       await this.clearAllData();
      // --- КОНЕЦ: Принудительная очистка для отладки ---

      // --- ПРИНУДИТЕЛЬНО УСТАНАВЛИВАЕМ ФЛАГ ФОТО В FALSE ДЛЯ ОТЛАДКИ --
      await this.setPhotosDownloadedFlag(false);
      console.log(`PlayerDownloadService: DEBUG - PLAYER_PHOTOS_DOWNLOADED_KEY forcibly set to FALSE.`);

      console.log('Starting complete player data loading process...');
      
      // --- ПРИНУДИТЕЛЬНО УСТАНАВЛИВАЕМ ФЛАГ В FALSE ДЛЯ ОТЛАДКИ ---
      await this.setPhotosDownloadedFlag(false);
      console.log(`PlayerDownloadService: DEBUG - PLAYER_PHOTOS_DOWNLOADED_KEY forcibly set to FALSE.`);

      console.log('Starting complete player data loading process...');

      onProgress?.('Загрузка списка игроков…');
      const playersList = await this.fetchPlayersList();
      console.log(`Loaded ${playersList.length} players from list`);

      if (playersList.length === 0) {
        console.warn('No players found in the list');
        return [];
      }

      // --- ПРОВЕРКА ФЛАГА ПЕРЕД ЗАГРУЗКОЙ ФОТО ---
      //const photosDownloaded = await this.arePhotosDownloaded();
      //console.log(`PlayerDownloadService: Photos download flag is ${photosDownloaded ? 'TRUE' : 'FALSE'}.`);
      
      // ✅ Загружаем ВСЕ данные, ВКЛЮЧАЯ ФОТО, при полной перезагрузке
      const allPlayers = await this.processPlayersConcurrently(
        playersList,
        onProgress,
        5,
        false, // ← ВСЕГДА загружаем фото при полной загрузке
      );

      allPlayers.sort((a, b) => a.number - b.number);

      onProgress?.('Сохранение данных…');
      await this.savePlayersToStorage(allPlayers);
      await this.setDataLoaded(true);
      await this.setPhotosDownloadedFlag(true); // ← Теперь точно загружены
      // --- УСТАНОВКА ФЛАГА ПОСЛЕ УСПЕШНОЙ ЗАГРУЗКИ ВСЕГО ---
      // Флаг устанавливается ТОЛЬКО если фото *не* были пропущены и *все* данные сохранены
      if (!photosDownloaded) { // Если фото *не* были пропущены, значит они *должны* были быть загружены
          await this.setPhotosDownloadedFlag(true); // <-- УСТАНАВЛИВАЕМ ФЛАГ В TRUE
          console.log(`PlayerDownloadService: Set PLAYER_PHOTOS_DOWNLOADED_KEY to TRUE after successful download.`);
      } else {
          console.log(`PlayerDownloadService: PLAYER_PHOTOS_DOWNLOADED_KEY was TRUE, no new download attempt, flag remains TRUE.`);
      }

      console.log(`Successfully loaded and cached ${allPlayers.length} players`);
      return allPlayers;
    } catch (error) {
      console.error('Error loading all players data:', error);
      throw error;
    }
    await this.setPhotosDownloadedFlag(true); // ← Теперь точно загружены
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

  // --- ОБНОВЛЁННАЯ ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ ---
  async refreshPlayersData(
    onProgress?: (stage: string, current?: number, total?: number) => void
  ): Promise<Player[]> {
    try {
      console.log('Refreshing players data...');
      await this.setDataLoaded(false);
      await this.setPhotosDownloadedFlag(false); // <-- СБРОС ФЛАГА
      return await this.loadAllPlayersData(onProgress);
    } catch (error) {
      console.error('Error refreshing players data:', error);
      throw error;
    }
  }


  // --- НОВАЯ ФУНКЦИЯ С ПОДДЕРЖКОЙ ПРОГРЕССА И ВОССТАНОВЛЕНИЯ ФОТО ---
  async refreshPlayersDataWithProgress(
    onProgress: (loaded: number, total: number) => void
  ): Promise<Player[]> {
    try {
      console.log('🔄 Starting refreshPlayersDataWithProgress...');
      const playersList = await this.fetchPlayersList();
      const total = playersList.length;
      if (total === 0) {
        onProgress(0, 0);
        return [];
      }

      onProgress(0, total);

      // 1. Загрузка деталей и фото (без восстановления — первичная загрузка)
      const allPlayers: Player[] = [];
      for (let i = 0; i < playersList.length; i++) {
        const listItem = playersList[i];
        try {
          const [details, photoData] = await Promise.all([
            this.fetchPlayerDetails(listItem.id),
            this.fetchPlayerPhoto(listItem.id)
          ]);

          let photoPath: string | null = null;
          if (photoData?.photo_url) {
            photoPath = await this.downloadAndCacheImage(photoData.photo_url, listItem.id);
          }

          const player = this.convertToPlayer(listItem, details, photoPath);
          allPlayers.push(player);
        } catch (err) {
          console.warn(`⚠️ Ошибка при обработке игрока ${listItem.id}, сохраняем без фото...`, err);
          allPlayers.push(this.convertToPlayer(listItem, {
            id: listItem.id,
            name: listItem.name,
            number: listItem.number,
            position: listItem.position,
            birth_date: listItem.birth_date,
            metrics: { onetwofive: '', height: '', weight: '', ka: '' }
          }, null));
        }
        onProgress(i + 1, total);
      }

      // 2. Сохраняем игроков
      await this.savePlayersToStorage(allPlayers);
      await this.setDataLoaded(true);
      console.log(`✅ Сохранено ${allPlayers.length} игроков`);

      // 3. 🔁 ВАЖНО: Проверяем и восстанавливаем отсутствующие фото (например, после обновления путей)
      console.log('🔍 Проверка целостности фото игроков...');
      onProgress(0, allPlayers.length); // Сбрасываем прогресс для второго этапа (опционально) или продолжаем
      await this.verifyAndRestorePlayerPhotos(allPlayers, (current, totalPhotos) => {
        // Можно отображать как "Восстановление фото: X из Y"
        onProgress(current, totalPhotos);
      });

      // 4. Устанавливаем флаг загрузки фото
      await this.setPhotosDownloadedFlag(true);

      console.log(`✅ Загрузка и восстановление фото игроков завершены`);
      return allPlayers;
    } catch (error) {
      console.error('💥 Ошибка в refreshPlayersDataWithProgress:', error);
      throw error;
    }
  }


  // --- ОБНОВЛЁННАЯ ФУНКЦИЯ ДЛЯ ОЧИСТКИ ---
  async clearAllData(): Promise<void> {
    try {
      console.log('Clearing all player data...');

      await AsyncStorage.removeItem(PLAYERS_DATA_LOADED_KEY);
      await AsyncStorage.removeItem(PLAYER_PHOTOS_DOWNLOADED_KEY); // <-- СБРОС ФЛАГА ФОТО
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