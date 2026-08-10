import * as FileSystem from "expo-file-system/legacy";
import type { MessengerMedia } from "../features/messenger/types";
import { messengerMediaUrl } from "./messengerApi";
import { messengerLog } from "./messengerLogger";

const CACHE_ROOT = `${FileSystem.cacheDirectory || ""}forward-messenger-media/`;
const downloads = new Map<string, Promise<string>>();

function extensionFor(media: MessengerMedia): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "application/pdf": "pdf",
  };
  if (byMime[media.mime_type]) return byMime[media.mime_type];
  const fromName = media.original_name.match(/\.([a-z0-9]{1,10})$/i)?.[1];
  return fromName?.toLowerCase() || "bin";
}

async function ensureCacheRoot(): Promise<void> {
  if (!FileSystem.cacheDirectory) {
    throw new Error("Каталог кэша недоступен на этом устройстве");
  }
  await FileSystem.makeDirectoryAsync(CACHE_ROOT, { intermediates: true });
}

export function messengerMediaCachePath(media: MessengerMedia): string {
  return `${CACHE_ROOT}${media.id}.${extensionFor(media)}`;
}

export async function cacheMessengerMedia(
  media: MessengerMedia,
  accessToken: string,
): Promise<string> {
  const existing = downloads.get(media.id);
  if (existing) return existing;

  const task = (async () => {
    await ensureCacheRoot();
    const destination = messengerMediaCachePath(media);
    const info = await FileSystem.getInfoAsync(destination);
    if (info.exists && !info.isDirectory && info.size > 0) return destination;

    const source = messengerMediaUrl(media.url);
    if (!source) throw new Error("У вложения отсутствует адрес");
    const temporary = `${destination}.download`;
    await FileSystem.deleteAsync(temporary, { idempotent: true });
    messengerLog("debug", "media.cache.download.started", {
      asset_id: media.id,
      media_type: media.type,
      size_bytes: media.size_bytes,
    });
    const result = await FileSystem.downloadAsync(source, temporary, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(temporary, { idempotent: true });
      throw new Error(`Сервер вернул HTTP ${result.status}`);
    }
    await FileSystem.moveAsync({ from: temporary, to: destination });
    messengerLog("info", "media.cache.download.completed", {
      asset_id: media.id,
      media_type: media.type,
      local_uri: destination,
    });
    return destination;
  })().finally(() => downloads.delete(media.id));

  downloads.set(media.id, task);
  return task;
}

/** Seeds the protected cache from the file that has just been uploaded. */
export async function seedMessengerMediaCache(
  media: MessengerMedia,
  sourceUri: string,
): Promise<string> {
  await ensureCacheRoot();
  const destination = messengerMediaCachePath(media);
  if (sourceUri === destination) return destination;
  const temporary = `${destination}.local`;
  await FileSystem.deleteAsync(temporary, { idempotent: true });
  await FileSystem.copyAsync({ from: sourceUri, to: temporary });
  await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.moveAsync({ from: temporary, to: destination });
  messengerLog("debug", "media.cache.seeded", {
    asset_id: media.id,
    media_type: media.type,
  });
  return destination;
}

async function directorySize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return 0;
  if (!info.isDirectory) return info.size;
  const children = await FileSystem.readDirectoryAsync(uri);
  const prefix = uri.endsWith("/") ? uri : `${uri}/`;
  const sizes = await Promise.all(
    children.map((child) => directorySize(`${prefix}${child}`)),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}

export async function messengerMediaCacheSize(): Promise<number> {
  if (!FileSystem.cacheDirectory) return 0;
  return directorySize(CACHE_ROOT);
}

export async function clearMessengerMediaCache(): Promise<number> {
  if (!FileSystem.cacheDirectory) return 0;
  const bytes = await messengerMediaCacheSize();
  downloads.clear();
  await FileSystem.deleteAsync(CACHE_ROOT, { idempotent: true });
  messengerLog("info", "media.cache.cleared", { removed_bytes: bytes });
  return bytes;
}

export function formatMessengerBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
