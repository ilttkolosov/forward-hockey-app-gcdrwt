// services/playerDataService.ts
import { readCacheValue, writeCacheValue } from './cacheStorage';
import { readOptionalStorageValue, writeOptionalStorageValue } from './optionalStorage';
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
import { playerDistributionAsset, playerDistributionDigest } from '../assets/player-distribution/bundled';
import {
  getMetadata,
  getReferenceVersion,
  loadCurrentPlayerIds,
  loadPlayersFromDatabase,
  mergePlayerDirectory,
  PLAYER_DISTRIBUTION_RECEIPT,
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
const DISTRIBUTION_DIR = playerDistributionDigest ? `players_distribution_${playerDistributionDigest.slice(0, 16)}` : '';

export interface MessengerPlayerAvatarUpload {
  uri: string;
  name: string;
  type: string;
}

type PlayerFullApiResponse = DatabasePlayer;

interface PlayerDistributionManifest {
  schema_version: 1;
  players_version: number;
  generated_at: string;
  active_player_ids: number[];
  players: (DatabasePlayer & { photo_file: string | null })[];
}

export class PlayerDownloadSystem {
  private baseUrl = 'https://www.hc-forward.com/wp-json/app/v1';
  private bundledPhotoUris = new Map<string, string>();
  private playersSnapshot: Player[] | null = null;
  private currentIds = new Set<string>();
  private distributionInstall: Promise<void> | null = null;
  private refresh: { version: number; task: Promise<Player[]> } | null = null;
  private dataLoaded: boolean | null = null;

  configure(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async isDataLoaded(): Promise<boolean> {
    if (this.dataLoaded !== null) return this.dataLoaded;
    const loaded = await readOptionalStorageValue(PLAYERS_DATA_LOADED_KEY);
    return loaded === 'true';
  }
  async arePhotosDownloaded(): Promise<boolean> {
    const downloaded = await readOptionalStorageValue(PLAYER_PHOTOS_DOWNLOADED_KEY);
    return downloaded === 'true';
  }
  async setDataLoaded(loaded: boolean): Promise<void> {
    this.dataLoaded = loaded;
    await writeOptionalStorageValue(PLAYERS_DATA_LOADED_KEY, loaded.toString());
  }
  async setPhotosDownloadedFlag(downloaded: boolean): Promise<void> {
    await writeOptionalStorageValue(PLAYER_PHOTOS_DOWNLOADED_KEY, downloaded.toString());
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
      if (Number.isNaN(birth.getTime())) return 0;
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

  private async readPhotoDirectory(directory: string): Promise<Map<string, string>> {
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

  private async getStoredPhotoUris(): Promise<Map<string, string>> {
    const uris = new Map(this.bundledPhotoUris);
    if (!documentDirectory || !(await getInfoAsync(documentDirectory)).exists) return uris;
    const names = await readDirectoryAsync(documentDirectory);
    const previousDistributions = names.filter(name => /^players_distribution_[a-f0-9]{16}$/.test(name) && name !== DISTRIBUTION_DIR);
    const versions = names.filter(name => /^players_v\d+$/.test(name))
      .sort((a, b) => Number(a.slice(9)) - Number(b.slice(9)));
    const directories = ['players', ...previousDistributions, DISTRIBUTION_DIR, ...versions].filter(Boolean);
    const photos = await Promise.all(directories.map(name => this.readPhotoDirectory(`${documentDirectory}${name}/`)));
    for (const directory of photos) {
      for (const [id, uri] of directory) uris.set(id, uri);
    }
    return uris;
  }

  private async existingLocalPhotoUpload(
    playerId: string,
    uri: unknown,
    extensionHint?: string
  ): Promise<MessengerPlayerAvatarUpload | null> {
    if (typeof uri !== 'string') return null;
    const normalizedUri = uri.trim();
    if (!normalizedUri || /^https?:\/\//i.test(normalizedUri)) return null;
    try {
      const info = await getInfoAsync(normalizedUri);
      if (!info.exists || info.isDirectory) return null;
      return this.toMessengerAvatarUpload(playerId, normalizedUri, extensionHint);
    } catch {
      return null;
    }
  }

  private async findPlayerPhotoInDirectory(
    directory: string,
    playerId: string
  ): Promise<string | null> {
    try {
      const info = await getInfoAsync(directory);
      if (!info.exists || !info.isDirectory) return null;
      const filenames = await readDirectoryAsync(directory);
      for (const filename of filenames) {
        const match = PLAYER_PHOTO_FILENAME_PATTERN.exec(filename);
        if (match?.[1] === playerId) return `${directory}${filename}`;
      }
    } catch (error) {
      console.warn(`[Игроки] Не удалось проверить каталог фото ${directory}:`, error);
    }
    return null;
  }

  async needsPhotoArchiveRefresh(): Promise<boolean> {
    const players = await this.getCurrentPlayersFromStorage();
    const missing = new Set(players.filter(player => !player.photoPath).map(player => player.id));
    if (missing.size === 0) return false;
    return (await loadPlayersFromDatabase()).some(player => missing.has(String(player.id)) && !!player.photo_url);
  }

  async getLocalPlayerPhotoUpload(
    playerId: number
  ): Promise<MessengerPlayerAvatarUpload | null> {
    if (!Number.isSafeInteger(playerId) || playerId <= 0) return null;
    const id = String(playerId);

    const cachedPlayers = await this.getPlayersFromStorage().catch(error => {
      console.warn('[Messenger] Не удалось прочитать кэш карточек игроков:', error);
      return [];
    });
    const cachedPlayer = cachedPlayers.find(item => String(item.id) === id);
    const cachedPhotoCandidates = [
      cachedPlayer?.photoPath,
      typeof cachedPlayer?.photo === 'string' ? cachedPlayer.photo : null,
    ];
    for (const candidate of cachedPhotoCandidates) {
      const cachedUpload = await this.existingLocalPhotoUpload(id, candidate);
      if (cachedUpload) {
        console.log(`[Messenger] Локальное фото игрока ${id} найдено по сохранённому пути`);
        return cachedUpload;
      }
    }

    const localPlayers = await loadPlayersFromDatabase();
    const player = localPlayers.find(item => String(item.id) === id);

    const installedPhoto = (await this.getStoredPhotoUris()).get(id);
    if (installedPhoto) {
      return this.toMessengerAvatarUpload(id, installedPhoto);
    }

    const bundledModule = PLAYER_PHOTO_ASSETS[id];
    if (bundledModule) {
      const asset = Asset.fromModule(bundledModule);
      await asset.downloadAsync();
      const uri = asset.localUri || asset.uri;
      if (uri) {
        console.log(`[Messenger] Локальное фото игрока ${id} найдено во встроенном архиве`);
        return this.toMessengerAvatarUpload(id, uri, asset.type || undefined);
      }
    }

    const legacyPhoto = await this.findPlayerPhotoInDirectory(PLAYERS_DIRECTORY, id);
    if (legacyPhoto) {
      console.log(`[Messenger] Локальное фото игрока ${id} найдено в прежнем каталоге`);
      return this.toMessengerAvatarUpload(id, legacyPhoto);
    }

    if (player) {
      const extension = this.getExtensionFromUrl(player.photo_url);
      const legacyUri = `${PLAYERS_DIRECTORY}player_${id}.${extension}`;
      const legacyUpload = await this.existingLocalPhotoUpload(id, legacyUri, extension);
      if (legacyUpload) return legacyUpload;
    }

    console.warn(`[Messenger] Локальное фото игрока ${id} не найдено`);
    return null;
  }

  private toMessengerAvatarUpload(
    playerId: string,
    uri: string,
    extensionHint?: string
  ): MessengerPlayerAvatarUpload {
    const uriExtension = uri.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/)?.[1];
    const rawExtension = (extensionHint || uriExtension || 'jpg').toLowerCase();
    const normalizedExtension = rawExtension === 'jpeg' ? 'jpg' : rawExtension;
    const extension = ['jpg', 'png', 'webp'].includes(normalizedExtension)
      ? normalizedExtension
      : 'jpg';
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
    photoPath = '',
  ): Player {
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

  private async readPhotoArchive(zipPath: string): Promise<Record<string, Uint8Array>> {
    const zipBase64 = await readAsStringAsync(zipPath, { encoding: EncodingType.Base64 });
    const zipArray = new Uint8Array(Buffer.from(zipBase64, 'base64'));
    return new Promise((resolve, reject) => {
      unzip(zipArray, (error, unzipped) => {
        if (error) reject(error);
        else resolve(unzipped as Record<string, Uint8Array>);
      });
    });
  }

  private async installPhotoEntries(
    entries: Record<string, Uint8Array>,
    directory: string,
    wanted: ReadonlySet<string>,
  ): Promise<void> {
    if (wanted.size === 0) return;
    await makeDirectoryAsync(directory, { intermediates: true });
    const installed = await this.readPhotoDirectory(directory);
    for (const [archiveName, data] of Object.entries(entries)) {
      const filename = archiveName.split('/').pop() || '';
      const match = PLAYER_PHOTO_FILENAME_PATTERN.exec(filename);
      if (!match || !wanted.has(match[1]) || installed.has(match[1]) || data.length === 0) continue;
      const path = `${directory}${filename}`;
      const temporary = `${path}.tmp`;
      try {
        await writeAsStringAsync(temporary, Buffer.from(data).toString('base64'), { encoding: EncodingType.Base64 });
        await moveAsync({ from: temporary, to: path });
        installed.set(match[1], path);
      } finally {
        await deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
      }
    }
  }

  private async installBundledDirectory(): Promise<void> {
    if (!playerDistributionAsset || !playerDistributionDigest || !documentDirectory) return;
    const sha256 = playerDistributionDigest;
    const archiveDirectory = `${documentDirectory}${DISTRIBUTION_DIR}/`;
    this.distributionInstall ??= (async () => {
      if (await getMetadata(PLAYER_DISTRIBUTION_RECEIPT) === sha256) return;
      const asset = Asset.fromModule(playerDistributionAsset);
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('Встроенный архив игроков недоступен');
      const files = await this.readPhotoArchive(asset.localUri);
      const manifest = JSON.parse(Buffer.from(files['manifest.json']).toString('utf8')) as PlayerDistributionManifest;
      const photos = new Set(manifest.players.filter(player => player.photo_file).map(player => String(player.id)));
      await this.installPhotoEntries(files, archiveDirectory, photos);
      await mergePlayerDirectory(manifest.players, manifest.active_player_ids, manifest.players_version, {
        sha256, generatedAt: manifest.generated_at,
      });
      console.log(`[Игроки] Установлен справочник из дистрибутива: ${manifest.players.length} игроков, ${photos.size} фото`);
    })().catch(error => {
      this.distributionInstall = null;
      console.warn('[Игроки] Встроенный справочник пока не установлен:', error);
    });
    await this.distributionInstall;
  }

  private async installBundledPhotos(): Promise<void> {
    if (this.bundledPhotoUris.size) return;
    try {
      const assets = await Promise.all(Object.entries(PLAYER_PHOTO_ASSETS).map(async ([id, module]) => {
        const asset = Asset.fromModule(module);
        await asset.downloadAsync();
        const uri = asset.localUri || asset.uri;
        if (!uri) throw new Error(`Bundled photo URI is unavailable for player ${id}`);
        return [id, uri] as const;
      }));
      this.bundledPhotoUris = new Map(assets);
      await writeOptionalStorageValue(BUNDLED_PHOTOS_VERSION_KEY, String(playerPhotoSeed.version));
      await this.setPhotosDownloadedFlag(assets.length > 0);
      console.log(`✅ Подключено ${assets.length} встроенных фото игроков версии ${playerPhotoSeed.version}`);
    } catch (error) {
      console.warn('⚠️ Не удалось установить встроенные фото игроков:', error);
    }
  }

  async initializeFromDatabase(
    targetVersion: number,
    canUseNetwork: boolean,
    onProgress?: (stage: string, message?: string) => void
  ): Promise<Player[]> {
    await this.installBundledDirectory();
    const localVersion = await getReferenceVersion('players');
    const localPlayers = await loadPlayersFromDatabase();
    if (canUseNetwork && (targetVersion > localVersion || !localPlayers.length)) {
      console.log(`[Database] players: обновление ${localVersion} → ${targetVersion}`);
      return this.refreshPlayersData(Math.max(targetVersion, localVersion), onProgress);
    }
    if (localPlayers.length === 0) {
      throw new Error('В локальной базе отсутствуют данные игроков');
    }
    onProgress?.('Локальные данные', `Загружено игроков ${localPlayers.length}`);
    return this.loadLocalPlayers(localPlayers);
  }

  private async loadLocalPlayers(localPlayers: DatabasePlayer[]): Promise<Player[]> {
    replaceMessengerPlayerNumbers(localPlayers);
    await this.installBundledPhotos();
    const [photos, currentIds] = await Promise.all([this.getStoredPhotoUris(), loadCurrentPlayerIds()]);
    const players = localPlayers
      .map(item => this.toPlayer(item, photos.get(String(item.id))))
      .sort((a, b) => a.number - b.number);
    this.currentIds = currentIds;
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
    const temporary = `${fileUri}.tmp`;
    try {
      const result = await downloadAsync(finalUrl, temporary);
      if (result.status !== 200) return null;
      await moveAsync({ from: temporary, to: fileUri });
      return fileUri;
    } finally {
      await deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
    }
  }

  private async downloadAndExtractPhotoArchive(
    version: number,
    wanted: ReadonlySet<string>,
    onProgress?: (message: string) => void
  ): Promise<void> {
    const zipUrl = `${PHOTO_ARCHIVE_BASE_URL}${version}.zip`;
    const zipPath = `${documentDirectory || ''}player_photos_v${version}.zip`;

    await deleteAsync(zipPath, { idempotent: true });
    try {
      onProgress?.('Скачивание архива фотографий…');
      const download = await downloadAsync(zipUrl, zipPath);
      if (download.status !== 200) {
        throw new Error(`Архив фотографий вернул HTTP ${download.status}`);
      }

      onProgress?.('Добавление новых фотографий…');
      await this.installPhotoEntries(await this.readPhotoArchive(zipPath), this.getVersionedPlayersDirectory(version), wanted);
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
    await mergePlayerDirectory(fullPlayers, fullPlayers.map(player => player.id), version);
    const directory = await loadPlayersFromDatabase();
    const players = await this.loadLocalPlayers(directory);
    if (!documentDirectory) return players;
    const withPhoto = new Set(players.filter(player => player.photoPath).map(player => player.id));
    const missing = fullPlayers.filter(player => player.photo_url && !withPhoto.has(String(player.id)));
    if (!missing.length) return players;

    try {
      const wanted = new Set(missing.map(player => String(player.id)));
      await this.downloadAndExtractPhotoArchive(version, wanted, message => onProgress?.('Загрузка фото', message));
    } catch (error) {
      console.warn('[Игроки] Архив фото текущей версии недоступен:', error);
    }
    const stored = await this.getStoredPhotoUris();
    for (const player of missing) {
      if (stored.has(String(player.id))) continue;
      try {
        await this.downloadAndCacheImage(player.photo_url, String(player.id));
      } catch (error) {
        console.warn(`[Игроки] Фото ${player.id} пока недоступно:`, error);
      }
    }
    return this.loadLocalPlayers(directory);
  }

  async fetchAllPlayersFull(): Promise<PlayerFullApiResponse[]> {
    const response = await fetchWithTimeout(`${this.baseUrl}/get-players-full`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.status !== 'success' || !Array.isArray(result.data) || result.data.length === 0) {
      throw new Error('Invalid API response structure');
    }
    const players: DatabasePlayer[] = result.data.map((player: DatabasePlayer) => ({ ...player, id: Number(player.id) }));
    if (players.some(player => !Number.isSafeInteger(player.id) || player.id <= 0 || typeof player.name !== 'string' || !player.name.trim())
      || new Set(players.map(player => player.id)).size !== players.length) {
      throw new Error('Invalid player directory from API');
    }
    return players;
  }

  private async savePlayersToStorage(players: Player[]): Promise<void> {
    this.playersSnapshot = players;
    try {
      await writeCacheValue(PLAYERS_STORAGE_KEY, JSON.stringify({ players, currentIds: [...this.currentIds] }));
    } catch (error) {
      // The authoritative roster is already in forward.db; keep the prepared
      // view in memory so a disposable cache failure cannot block launch.
      console.warn('[Игроки] Вспомогательный снимок не сохранён:', error);
    }
  }

  async getPlayersFromStorage(): Promise<Player[]> {
    if (this.playersSnapshot) return this.playersSnapshot;
    try {
      return await this.initializeFromDatabase(await getReferenceVersion('players'), false);
    } catch (error) {
      const raw = await readCacheValue(PLAYERS_STORAGE_KEY);
      const snapshot = raw ? JSON.parse(raw) : null;
      const players: Player[] | undefined = Array.isArray(snapshot) ? snapshot : snapshot?.players;
      if (!Array.isArray(players) || !players.length) throw error;
      this.currentIds = new Set(snapshot?.currentIds ?? players.map(player => String(player.id)));
      this.playersSnapshot = players;
      return players;
    }
  }

  async getCurrentPlayersFromStorage(): Promise<Player[]> {
    return (await this.getPlayersFromStorage()).filter(player => this.currentIds.has(player.id));
  }

  async refreshPlayersData(
    version: number,
    onProgress?: (stage: string, message?: string) => void
  ): Promise<Player[]> {
    if (this.refresh) {
      if (this.refresh.version >= version) return this.refresh.task;
      await this.refresh.task.catch(() => undefined);
      return this.refreshPlayersData(version, onProgress);
    }
    const task = this.loadAllPlayersDataWithBatch(version, onProgress);
    this.refresh = { version, task };
    try {
      return await task;
    } finally {
      this.refresh = null;
    }
  }

}

export const playerDownloadService = new PlayerDownloadSystem();
