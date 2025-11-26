// services/playerDataService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  downloadAsync,
  deleteAsync,
  readDirectoryAsync,
} from 'expo-file-system/legacy';

import { Player } from '../types';

// === УСЛОВНЫЙ ИМПОРТ ZIP (работает в EAS, не ломает Expo Go) ===
let ZipArchive: any = null;
let isZipSupported = false;
try {
  // @ts-ignore
  ZipArchive = require('react-native-zip-archive').default;
  isZipSupported = true;
  console.log('✅ react-native-zip-archive is available (EAS Build)');
} catch (e) {
  console.warn('⚠️ react-native-zip-archive not available (likely Expo Go). Using fallback.');
  isZipSupported = false;
}

// === КОНСТАНТЫ ===
const PLAYERS_DATA_LOADED_KEY = 'playersDataLoaded';
const PLAYERS_STORAGE_KEY = 'localPlayersData';
const PLAYER_PHOTOS_DOWNLOADED_KEY = 'playerPhotosDownloaded';
const PLAYERS_DIRECTORY = `${documentDirectory || ''}players/`;
const PHOTO_ARCHIVE_BASE_URL = 'https://www.hc-forward.com/wp-content/uploads/app/player_photos_v';

/**
 * Интерфейс для ответа нового эндпоинта /get-players-full
 */
interface PlayerFullApiResponse {
  id: number;
  name: string;
  nationality: string;
  number: number | null;
  position: string;
  birth_date: string;
  metrics: Record<string, string>;
  photo_url: string;
}

export class PlayerDownloadSystem {
  private baseUrl = 'https://www.hc-forward.com/wp-json/app/v1';

  // --- Флаги ---
  async isDataLoaded(): Promise<boolean> {
    const loaded = await AsyncStorage.getItem(PLAYERS_DATA_LOADED_KEY);
    return loaded === 'true';
  }

  async arePhotosDownloaded(): Promise<boolean> {
    const downloaded = await AsyncStorage.getItem(PLAYER_PHOTOS_DOWNLOADED_KEY);
    return downloaded === 'true';
  }

  async setDataLoaded(loaded: boolean): Promise<void> {
    await AsyncStorage.setItem(PLAYERS_DATA_LOADED_KEY, loaded.toString());
  }

  async setPhotosDownloadedFlag(downloaded: boolean): Promise<void> {
    await AsyncStorage.setItem(PLAYER_PHOTOS_DOWNLOADED_KEY, downloaded.toString());
  }

  // --- Вспомогательные ---
  async ensurePlayersDirectoryExists(): Promise<void> {
    const dirInfo = await getInfoAsync(PLAYERS_DIRECTORY);
    if (!dirInfo.exists) {
      await makeDirectoryAsync(PLAYERS_DIRECTORY, { intermediates: true });
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
    } catch {
      return 0;
    }
  }

  private getExtensionFromUrl(url: string): string {
    if (!url) return 'jpg';
    const match = url.match(/\.([a-zA-Z0-9]+)(\?|#|$)/);
    return match ? match[1].toLowerCase() : 'jpg';
  }

  // --- Загрузка фото по одному (fallback) ---
  async downloadAndCacheImage(originalUrl: string, playerId: string): Promise<string | null> {
    if (!originalUrl?.trim()) return null;
    const normalizedUrl = originalUrl.trim();
    const lastDotIndex = normalizedUrl.lastIndexOf('.');
    if (lastDotIndex === -1) return null;

    const base = normalizedUrl.substring(0, lastDotIndex);
    const ext = normalizedUrl.substring(lastDotIndex);
    const sizeSuffixes = ['-640x480', '-300x300', '-150x150'];
    const candidates = [
      ...sizeSuffixes.map(suffix => `${base}${suffix}${ext}`),
      normalizedUrl,
    ];

    // Проверка через HEAD
    const checkExists = async (url: string): Promise<boolean> => {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        return res.ok;
      } catch {
        return false;
      }
    };

    let finalUrl = normalizedUrl;
    for (const url of candidates) {
      if (await checkExists(url)) {
        finalUrl = url;
        break;
      }
    }

    await this.ensurePlayersDirectoryExists();
    const filename = `player_${playerId}${ext}`;
    const fileUri = `${PLAYERS_DIRECTORY}${filename}`;
    const result = await downloadAsync(finalUrl, fileUri);
    return result.status === 200 ? result.uri : null;
  }

  // --- Основные функции ---
  async fetchAllPlayersFull(): Promise<PlayerFullApiResponse[]> {
    const response = await fetch(`${this.baseUrl}/get-players-full`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.status !== 'success' || !Array.isArray(result.data)) {
      throw new Error('Invalid API response structure');
    }
    return result.data;
  }

  async downloadAndExtractPhotoArchive(version: number): Promise<boolean> {
    if (!isZipSupported) return false;

    const zipUrl = `${PHOTO_ARCHIVE_BASE_URL}${version}.zip`;
    const zipPath = `${documentDirectory}players_v${version}.zip`;
    const extractDir = PLAYERS_DIRECTORY;

    try {
      await this.ensurePlayersDirectoryExists();

      // Очистка старых фото
      const dirInfo = await getInfoAsync(extractDir);
      if (dirInfo.exists) {
        const files = await readDirectoryAsync(extractDir);
        await Promise.all(files.map(f => deleteAsync(`${extractDir}${f}`)));
      }

      // Скачивание и распаковка
      const downloadRes = await downloadAsync(zipUrl, zipPath);
      if (downloadRes.status !== 200) return false;
      await ZipArchive.unzip(zipPath, extractDir);
      await deleteAsync(zipPath, { idempotent: true });
      return true;
    } catch (error) {
      console.error('Archive download/extract failed:', error);
      return false;
    }
  }

  // --- Основная загрузка ---
  async loadAllPlayersDataWithBatch(
    version: number,
    onProgress?: (stage: string, current?: number, total?: number) => void
  ): Promise<Player[]> {
    onProgress?.('Загрузка данных игроков…');
    const fullPlayers = await this.fetchAllPlayersFull();

    onProgress?.('Загрузка фото архивом…');
    const photosLoaded = await this.downloadAndExtractPhotoArchive(version);

    let players: Player[] = [];
    if (photosLoaded) {
      // ✅ Архив загружен — строим photoPath по id
      players = fullPlayers.map(data => {
        const ext = this.getExtensionFromUrl(data.photo_url);
        const photoPath = `${PLAYERS_DIRECTORY}player_${String(data.id)}.${ext}`;
        const height = data.metrics?.height ? parseInt(data.metrics.height) || 0 : 0;
        const weight = data.metrics?.weight ? parseInt(data.metrics.weight) || 0 : 0;
        return {
          id: String(data.id),
          fullName: data.name,
          name: data.name,
          number: data.number || 0,
          position: data.position,
          birthDate: data.birth_date,
          age: this.calculateAge(data.birth_date),
          handedness: data.metrics?.onetwofive || '',
          height,
          weight,
          captainStatus: data.metrics?.ka || '',
          photoPath,
          photo: photoPath,
          isCaptain: data.metrics?.ka === 'К',
          isAssistantCaptain: data.metrics?.ka === 'А',
        };
      });
    } else {
      // ⚠️ Fallback — загрузка фото по одному
      onProgress?.('Загрузка фото по одному (fallback)...');
      players = [];
      for (let i = 0; i < fullPlayers.length; i++) {
        const data = fullPlayers[i];
        const photoPath = data.photo_url
          ? await this.downloadAndCacheImage(data.photo_url, String(data.id))
          : null;
        const height = data.metrics?.height ? parseInt(data.metrics.height) || 0 : 0;
        const weight = data.metrics?.weight ? parseInt(data.metrics.weight) || 0 : 0;
        players.push({
          id: String(data.id),
          fullName: data.name,
          name: data.name,
          number: data.number || 0,
          position: data.position,
          birthDate: data.birth_date,
          age: this.calculateAge(data.birth_date),
          handedness: data.metrics?.onetwofive || '',
          height,
          weight,
          captainStatus: data.metrics?.ka || '',
          photoPath: photoPath || '',
          photo: photoPath || '',
          isCaptain: data.metrics?.ka === 'К',
          isAssistantCaptain: data.metrics?.ka === 'А',
        });
        onProgress?.('Загрузка фото...', i + 1, fullPlayers.length);
      }
    }

    players.sort((a, b) => a.number - b.number);
    onProgress?.('Сохранение данных…');
    await this.savePlayersToStorage(players);
    await this.setDataLoaded(true);
    await this.setPhotosDownloadedFlag(true);
    return players;
  }

  // --- Хранилище ---
  async savePlayersToStorage(players: Player[]): Promise<void> {
    await AsyncStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
  }

  async getPlayersFromStorage(): Promise<Player[]> {
    const data = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  // --- Публичный метод для _layout.tsx ---
  async refreshPlayersData(
    version: number,
    onProgress?: (stage: string, current?: number, total?: number) => void
  ): Promise<Player[]> {
    await this.setDataLoaded(false);
    await this.setPhotosDownloadedFlag(false);
    return await this.loadAllPlayersDataWithBatch(version, onProgress);
  }

  /**
   * Проверяет наличие фото для списка игроков и восстанавливает отсутствующие,
   * используя photo_url из полного API-списка (а не старый эндпоинт).
   */
  async verifyAndRestorePlayerPhotosFromApi(
    cachedPlayers: Player[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    console.log(`🔍 Начало проверки фото для ${cachedPlayers.length} игроков...`);
    await this.ensurePlayersDirectoryExists();
    const total = cachedPlayers.length;
    if (total === 0) {
      onProgress?.(0, 0);
      return;
    }

    // 1. Загружаем актуальный список игроков с photo_url
    let apiPlayers: PlayerFullApiResponse[];
    try {
      apiPlayers = await this.fetchAllPlayersFull();
      console.log(`✅ Получено ${apiPlayers.length} записей с photo_url из /get-players-full`);
    } catch (error) {
      console.warn('⚠️ Не удалось получить photo_url из API — пропускаем восстановление фото:', error);
      return;
    }

    // Создаём мапу: id → photo_url
    const photoUrlMap = new Map<string, string>();
    for (const p of apiPlayers) {
      photoUrlMap.set(String(p.id), p.photo_url);
    }

    // 2. Проверяем каждое фото
    const missingPlayers: Player[] = [];
    for (const player of cachedPlayers) {
      if (!player.photoPath || typeof player.photoPath !== 'string' || player.photoPath.trim() === '') {
        missingPlayers.push(player);
        continue;
      }
      try {
        const fileInfo = await getInfoAsync(player.photoPath);
        if (!fileInfo.exists) {
          missingPlayers.push(player);
        }
      } catch (e) {
        console.warn(`Ошибка проверки фото для игрока ${player.id}:`, e);
        missingPlayers.push(player);
      }
    }

    console.log(`🖼️ Найдено ${missingPlayers.length} отсутствующих фото`);
    if (missingPlayers.length === 0) {
      onProgress?.(total, total);
      console.log('✅ Все фото на месте — восстановление не требуется');
      return;
    }

    // 3. Восстанавливаем отсутствующие
    let restoredCount = 0;
    for (let i = 0; i < missingPlayers.length; i++) {
      const player = missingPlayers[i];
      const photoUrl = photoUrlMap.get(player.id);
      if (photoUrl) {
        const newPhotoPath = await this.downloadAndCacheImage(photoUrl, player.id);
        if (newPhotoPath) {
          player.photoPath = newPhotoPath;
          player.photo = newPhotoPath;
          restoredCount++;
        }
      }
      onProgress?.(i + 1, missingPlayers.length);
    }

    // 4. Сохраняем обновлённые пути
    if (restoredCount > 0) {
      await this.savePlayersToStorage(cachedPlayers);
      console.log(`✅ Восстановлено ${restoredCount} фото игроков`);
    }
  }
}

// Экспорт единственного экземпляра
export const playerDownloadService = new PlayerDownloadSystem();