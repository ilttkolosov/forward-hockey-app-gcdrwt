// services/playerDataService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  downloadAsync,
  deleteAsync,
  readDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  moveAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { Player } from '../types';
import { unzip } from 'fflate';
import { Buffer } from 'buffer';
import { fetchWithTimeout } from './httpClient';
import { Asset } from 'expo-asset';
import playerPhotoSeed from '../assets/player-photos/seed-manifest.json';
import { PLAYER_PHOTO_ASSETS } from '../assets/player-photos/generated';
import {
  getReferenceVersion,
  loadPlayersFromDatabase,
  replacePlayers,
  type DatabasePlayer,
} from '../database/repository';
import { replaceMessengerPlayerNumbers } from '../features/messenger/playerIdentity';

const PLAYERS_DATA_LOADED_KEY = 'playersDataLoaded';
const PLAYERS_STORAGE_KEY = 'localPlayersData';
const PLAYER_PHOTOS_DOWNLOADED_KEY = 'playerPhotosDownloaded';
const PLAYERS_DIRECTORY = `${documentDirectory || ''}players/`;
const PHOTO_ARCHIVE_BASE_URL = 'https://www.hc-forward.com/wp-content/uploads/app/player_photos_v';
const BUNDLED_PHOTOS_VERSION_KEY = 'bundledPlayerPhotosVersion';
const PLAYER_PHOTO_FILENAME_PATTERN = /^player_(\d+)\.(jpe?g|png|webp)$/i;

export interface MessengerPlayerAvatarUpload {
  uri: string;
  name: string;
  type: string;
}

interface PlayerFullApiResponse extends DatabasePlayer {
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
  private bundledPhotoUris = new Map<string, string>();

  configure(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

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

  private getVersionedPlayersDirectory(version: number): string {
    return `${documentDirectory || ''}players_v${version}/`;
  }

  private async getVersionedPhotoUris(version: number): Promise<Map<string, string>> {
    const directory = this.getVersionedPlayersDirectory(version);
    const info = await getInfoAsync(directory);
    if (!info.exists || !info.isDirectory) return new Map();

    const files = await readDirectoryAsync(directory);
    const photoUris = new Map<string, string>();
    for (const filename of files) {
      const match = PLAYER_PHOTO_FILENAME_PATTERN.exec(filename);
      if (match) photoUris.set(match[1], `${directory}${filename}`);
    }
    return photoUris;
  }

  async needsPhotoArchiveRefresh(version: number): Promise<boolean> {
    if (version === playerPhotoSeed.version) return false;
    const photoUris = await this.getVersionedPhotoUris(version);
    return photoUris.size === 0;
  }

  async getLocalPlayerPhotoUpload(
    playerId: number
  ): Promise<MessengerPlayerAvatarUpload | null> {
    if (!Number.isSafeInteger(playerId) || playerId <= 0) return null;
    const id = String(playerId);
    const localPlayers = await loadPlayersFromDatabase();
    const player = localPlayers.find(item => String(item.id) === id);
    if (!player) return null;

    const localVersion = await getReferenceVersion('players');
    if (localVersion > 0) {
      const versionedPhoto = (await this.getVersionedPhotoUris(localVersion)).get(id);
      if (versionedPhoto) return this.toMessengerAvatarUpload(id, versionedPhoto);
    }

    const bundledModule = PLAYER_PHOTO_ASSETS[id];
    if (bundledModule) {
      const asset = Asset.fromModule(bundledModule);
      await asset.downloadAsync();
      const uri = asset.localUri || asset.uri;
      if (uri) {
        return this.toMessengerAvatarUpload(id, uri, asset.type || undefined);
      }
    }

    const extension = this.getExtensionFromUrl(player.photo_url);
    const legacyUri = `${PLAYERS_DIRECTORY}player_${id}.${extension}`;
    const legacyInfo = await getInfoAsync(legacyUri);
    return legacyInfo.exists
      ? this.toMessengerAvatarUpload(id, legacyUri, extension)
      : null;
  }

  private toMessengerAvatarUpload(
    playerId: string,
    uri: string,
    extensionHint?: string
  ): MessengerPlayerAvatarUpload {
    const uriExtension = uri.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/)?.[1];
    const rawExtension = (extensionHint || uriExtension || 'jpg').toLowerCase();
    const extension = rawExtension === 'jpeg' ? 'jpg' : rawExtension;
    const type = extension === 'png'
      ? 'image/png'
      : extension === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    return {
      uri,
      name: `player_${playerId}.${extension}`,
      type,
    };
  }

  private toPlayer(
    data: DatabasePlayer,
    versionedPhotoUri?: string,
    allowLegacyFallback = true
  ): Player {
    const ext = this.getExtensionFromUrl(data.photo_url);
    const bundledPhoto = this.bundledPhotoUris.get(String(data.id));
    const photoPath = versionedPhotoUri
      || (allowLegacyFallback
        ? bundledPhoto || (data.photo_url ? `${PLAYERS_DIRECTORY}player_${String(data.id)}.${ext}` : '')
        : '');
    return {
      id: String(data.id),
      fullName: data.name,
      name: data.name,
      number: data.number || 0,
      position: data.position,
      birthDate: data.birth_date,
      age: this.calculateAge(data.birth_date),
      handedness: data.metrics?.onetwofive || '',
      height: data.metrics?.height ? parseInt(data.metrics.height) || 0 : 0,
      weight: data.metrics?.weight ? parseInt(data.metrics.weight) || 0 : 0,
      captainStatus: data.metrics?.ka === 'К' || data.metrics?.ka === 'А' ? data.metrics.ka : '',
      photoPath,
      photo: photoPath,
      isCaptain: data.metrics?.ka === 'К',
      isAssistantCaptain: data.metrics?.ka === 'А',
    };
  }

  private async extractPhotoArchive(zipPath: string, version: number): Promise<Map<string, string>> {
    const targetDirectory = this.getVersionedPlayersDirectory(version);
    const stagingDirectory = `${documentDirectory || ''}players_v${version}_staging/`;
    const backupDirectory = `${documentDirectory || ''}players_v${version}_backup/`;

    await deleteAsync(stagingDirectory, { idempotent: true });
    await makeDirectoryAsync(stagingDirectory, { intermediates: true });

    const zipBase64 = await readAsStringAsync(zipPath, { encoding: EncodingType.Base64 });
    const zipArray = new Uint8Array(Buffer.from(zipBase64, 'base64'));

    const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(zipArray, (error, unzipped) => {
        if (error) reject(error);
        else resolve(unzipped as Record<string, Uint8Array>);
      });
    });

    const photoUris = new Map<string, string>();
    for (const [archiveName, data] of Object.entries(entries)) {
      if (archiveName.endsWith('/')) continue;
      const filename = archiveName.split('/').pop() || '';
      const match = PLAYER_PHOTO_FILENAME_PATTERN.exec(filename);
      if (!match) continue;
      if (photoUris.has(match[1])) {
        throw new Error(`Архив содержит несколько фотографий игрока ${match[1]}`);
      }
      await writeAsStringAsync(
        `${stagingDirectory}${filename}`,
        Buffer.from(data).toString('base64'),
        { encoding: EncodingType.Base64 }
      );
      photoUris.set(match[1], `${targetDirectory}${filename}`);
    }

    if (photoUris.size === 0) {
      throw new Error('Архив фотографий игроков пуст или имеет неверный формат');
    }

    await deleteAsync(backupDirectory, { idempotent: true });
    const current = await getInfoAsync(targetDirectory);
    if (current.exists) {
      await moveAsync({ from: targetDirectory, to: backupDirectory });
    }
    try {
      await moveAsync({ from: stagingDirectory, to: targetDirectory });
    } catch (error) {
      const backup = await getInfoAsync(backupDirectory);
      if (backup.exists) {
        await moveAsync({ from: backupDirectory, to: targetDirectory });
      }
      throw error;
    }
    await deleteAsync(backupDirectory, { idempotent: true }).catch(error => {
      console.warn(`[Игроки] Не удалось удалить резервный каталог фото версии ${version}:`, error);
    });

    return photoUris;
  }

  private async installBundledPhotos(version: number): Promise<boolean> {
    if (playerPhotoSeed.version !== version) return false;
    try {
      const assets = await Promise.all(Object.entries(PLAYER_PHOTO_ASSETS).map(async ([id, module]) => {
        const asset = Asset.fromModule(module);
        await asset.downloadAsync();
        const uri = asset.localUri || asset.uri;
        if (!uri) throw new Error(`Bundled photo URI is unavailable for player ${id}`);
        return [id, uri] as const;
      }));
      this.bundledPhotoUris = new Map(assets);
      await AsyncStorage.setItem(BUNDLED_PHOTOS_VERSION_KEY, String(version));
      await this.setPhotosDownloadedFlag(assets.length > 0);
      console.log(`✅ Подключено ${assets.length} встроенных фото игроков версии ${version}`);
      return assets.length > 0;
    } catch (error) {
      console.warn('⚠️ Не удалось установить встроенные фото игроков:', error);
      return false;
    }
  }

  async initializeFromDatabase(
    targetVersion: number,
    canUseNetwork: boolean,
    onProgress?: (stage: string, message?: string) => void
  ): Promise<Player[]> {
    const localVersion = await getReferenceVersion('players');
    const localPlayers = await loadPlayersFromDatabase();
    replaceMessengerPlayerNumbers(localPlayers);
    if (canUseNetwork && targetVersion !== localVersion) {
      console.log(`[Database] players: обновление ${localVersion} → ${targetVersion}`);
      return this.refreshPlayersData(targetVersion, onProgress);
    }
    if (localPlayers.length === 0) {
      if (!canUseNetwork) throw new Error('В локальной базе отсутствуют данные игроков');
      return this.refreshPlayersData(targetVersion, onProgress);
    }
    onProgress?.('Локальные данные', `Загружено игроков ${localPlayers.length}`);
    await this.installBundledPhotos(localVersion || targetVersion);
    const versionedPhotoUris = await this.getVersionedPhotoUris(localVersion || targetVersion);
    const allowLegacyFallback = versionedPhotoUris.size === 0;
    const players = localPlayers
      .map(item => this.toPlayer(
        item,
        versionedPhotoUris.get(String(item.id)),
        allowLegacyFallback
      ))
      .sort((a, b) => a.number - b.number);
    await this.savePlayersToStorage(players);
    await this.setDataLoaded(true);
    return players;
  }

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
    const checkExists = async (url: string): Promise<boolean> => {
      try {
        const res = await fetchWithTimeout(url, { method: 'HEAD' }, 5_000);
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

  private async downloadAndExtractPhotoArchive(
    version: number,
    onProgress?: (message: string) => void
  ): Promise<Map<string, string>> {
    const zipUrl = `${PHOTO_ARCHIVE_BASE_URL}${version}.zip`;
    const zipPath = `${documentDirectory || ''}player_photos_v${version}.zip`;

    await deleteAsync(zipPath, { idempotent: true });
    try {
      onProgress?.('Скачивание архива фотографий…');
      const download = await downloadAsync(zipUrl, zipPath);
      if (download.status !== 200) {
        throw new Error(`Архив фотографий вернул HTTP ${download.status}`);
      }

      onProgress?.('Распаковка архива фотографий…');
      const photoUris = await this.extractPhotoArchive(zipPath, version);
      onProgress?.(`Получено фотографий: ${photoUris.size}`);
      return photoUris;
    } finally {
      await deleteAsync(zipPath, { idempotent: true });
    }
  }

  async loadAllPlayersDataWithBatch(
    version: number,
    onProgress?: (stage: string, message?: string) => void
  ): Promise<Player[]> {
    onProgress?.('Загрузка данных игроков…');

    const fullPlayers = await this.fetchAllPlayersFull();
    const photoUris = await this.downloadAndExtractPhotoArchive(
      version,
      message => onProgress?.('Загрузка фото', message)
    );
    const players = fullPlayers.map(data => this.toPlayer(
      data,
      photoUris.get(String(data.id)),
      false
    ));
    const playersWithPhotos = players.filter(player => Boolean(player.photoPath)).length;
    onProgress?.('Загрузка фото', `Подготовлено ${playersWithPhotos} из ${players.length}`);

    players.sort((a, b) => a.number - b.number);
    await replacePlayers(fullPlayers, version);
    replaceMessengerPlayerNumbers(fullPlayers);
    await this.savePlayersToStorage(players);
    await this.setDataLoaded(true);
    await this.setPhotosDownloadedFlag(true);
    return players;
  }

  async fetchAllPlayersFull(): Promise<PlayerFullApiResponse[]> {
    const response = await fetchWithTimeout(`${this.baseUrl}/get-players-full`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.status !== 'success' || !Array.isArray(result.data)) {
      throw new Error('Invalid API response structure');
    }
    return result.data;
  }

  async savePlayersToStorage(players: Player[]): Promise<void> {
    await AsyncStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
  }

  async getPlayersFromStorage(): Promise<Player[]> {
    const data = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  async refreshPlayersData(
    version: number,
    onProgress?: (stage: string, message?: string) => void
  ): Promise<Player[]> {
    // Не сбрасываем успешный локальный набор до завершения обновления.
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
    onProgress?.(0, 0);
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
  onProgress?.(0, missingPlayers.length);

  if (missingPlayers.length === 0) {
    onProgress?.(0, 0); // сигнализируем "ничего восстанавливать не нужно"
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

export const playerDownloadService = new PlayerDownloadSystem();
