import * as FileSystem from "expo-file-system/legacy";
import { AppState, Platform } from "react-native";
import type { MessengerMedia } from "../features/messenger/types";
import { messengerMediaUrl } from "./messengerApi";
import { messengerLog, messengerRequestId } from "./messengerLogger";

const CACHE_ROOT = `${FileSystem.cacheDirectory || ""}forward-messenger-media/`;
const downloads = new Map<string, Promise<string>>();
const webMediaObjectUrls = new Map<string, { uri: string; size: number }>();
const localMediaUploads = new Set<string>();
const queuedVideoPrefetches = new Set<string>();
const videoPrefetchQueue: {
  media: MessengerMedia;
  accessToken: string;
  sessionType: "foreground" | "background";
}[] = [];
let videoPrefetchRunning = false;

interface MessengerMediaCacheOptions {
  sessionType?: "foreground" | "background";
}

/**
 * Marks a media message whose source files exist on this exact device. The
 * realtime event can arrive before the upload response, so background
 * persistence uses this marker to avoid downloading our own files again.
 */
export function beginLocalMessengerMediaUpload(clientMessageId: string): void {
  localMediaUploads.add(clientMessageId);
}

export function endLocalMessengerMediaUpload(clientMessageId: string): void {
  localMediaUploads.delete(clientMessageId);
}

export function hasLocalMessengerMediaUpload(clientMessageId: string): boolean {
  return localMediaUploads.has(clientMessageId);
}

function responseHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const expected = name.toLowerCase();
  const entry = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === expected,
  );
  return entry?.[1];
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function extensionFor(media: MessengerMedia): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/gif": "gif",
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

/** Returns a local media URI without starting a network download. */
export async function getCachedMessengerMediaUri(
  media: MessengerMedia,
): Promise<string | null> {
  if (Platform.OS === "web") {
    return webMediaObjectUrls.get(media.id)?.uri ?? null;
  }
  if (!FileSystem.cacheDirectory) return null;
  try {
    const destination = messengerMediaCachePath(media);
    const info = await FileSystem.getInfoAsync(destination);
    return info.exists && !info.isDirectory && info.size > 0
      ? destination
      : null;
  } catch {
    return null;
  }
}

export async function cacheMessengerMedia(
  media: MessengerMedia,
  accessToken: string,
  options: MessengerMediaCacheOptions = {},
): Promise<string> {
  const existing = downloads.get(media.id);
  if (existing) return existing;

  const task = (async () => {
    if (Platform.OS === "web") {
      const source = messengerMediaUrl(media.url);
      if (!source) throw new Error("У вложения отсутствует адрес");
      const response = await fetch(source, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Request-ID": messengerRequestId(),
        },
      });
      if (!response.ok) {
        throw new Error(`Сервер вернул HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const previous = webMediaObjectUrls.get(media.id);
      if (previous) URL.revokeObjectURL(previous.uri);
      const uri = URL.createObjectURL(blob);
      webMediaObjectUrls.set(media.id, { uri, size: blob.size });
      messengerLog("info", "media.cache.web_ready", {
        asset_id: media.id,
        media_type: media.type,
        downloaded_bytes: blob.size,
      });
      return uri;
    }
    await ensureCacheRoot();
    const destination = messengerMediaCachePath(media);
    const info = await FileSystem.getInfoAsync(destination);
    if (info.exists && !info.isDirectory && info.size > 0) return destination;

    const source = messengerMediaUrl(media.url);
    if (!source) throw new Error("У вложения отсутствует адрес");
    const temporary = `${destination}.download`;
    await FileSystem.deleteAsync(temporary, { idempotent: true });
    const clientRequestId = messengerRequestId();
    const downloadStartedAt = Date.now();
    let firstProgressAt: number | null = null;
    let lastWrittenBytes = 0;
    let expectedBytes = media.size_bytes;
    const sessionType = options.sessionType ?? "foreground";
    messengerLog("debug", "media.cache.download.started", {
      asset_id: media.id,
      media_type: media.type,
      size_bytes: media.size_bytes,
      client_request_id: clientRequestId,
      session_type: sessionType,
    });
    const resumable = FileSystem.createDownloadResumable(
      source,
      temporary,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Request-ID": clientRequestId,
        },
        // iOS defaults legacy downloads to a background URLSession. That is
        // appropriate for large offline transfers, but the OS may defer a
        // 100-200 KB image for several seconds. Visible chat media is
        // latency-sensitive and must use the foreground URLSession instead.
        sessionType:
          sessionType === "background"
            ? FileSystem.FileSystemSessionType.BACKGROUND
            : FileSystem.FileSystemSessionType.FOREGROUND,
      },
      (progress) => {
        lastWrittenBytes = progress.totalBytesWritten;
        if (progress.totalBytesExpectedToWrite > 0) {
          expectedBytes = progress.totalBytesExpectedToWrite;
        }
        if (firstProgressAt !== null || progress.totalBytesWritten <= 0) return;
        firstProgressAt = Date.now();
        messengerLog("debug", "media.cache.download.first_progress", {
          asset_id: media.id,
          client_request_id: clientRequestId,
          first_progress_ms: elapsedSince(downloadStartedAt),
          written_bytes: progress.totalBytesWritten,
          expected_bytes: expectedBytes,
        });
      },
    );
    const result = await resumable.downloadAsync();
    if (!result) throw new Error("Загрузка вложения была отменена");
    const networkCompletedAt = Date.now();
    if (result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(temporary, { idempotent: true });
      throw new Error(`Сервер вернул HTTP ${result.status}`);
    }
    const temporaryInfo = await FileSystem.getInfoAsync(temporary);
    const downloadedBytes =
      temporaryInfo.exists && !temporaryInfo.isDirectory
        ? temporaryInfo.size
        : lastWrittenBytes;
    await FileSystem.moveAsync({ from: temporary, to: destination });
    const completedAt = Date.now();
    const durationMs = completedAt - downloadStartedAt;
    const requestId = responseHeader(result.headers, "x-request-id");
    messengerLog("info", "media.cache.download.completed", {
      asset_id: media.id,
      media_type: media.type,
      client_request_id: clientRequestId,
      request_id: requestId,
      status: result.status,
      duration_ms: durationMs,
      first_progress_ms:
        firstProgressAt === null ? null : firstProgressAt - downloadStartedAt,
      network_duration_ms: networkCompletedAt - downloadStartedAt,
      finalize_duration_ms: completedAt - networkCompletedAt,
      downloaded_bytes: downloadedBytes,
      expected_bytes: expectedBytes,
      throughput_kbps:
        durationMs > 0 ? Math.round((downloadedBytes * 8) / durationMs) : null,
      server_timing: responseHeader(result.headers, "server-timing"),
      delivery: responseHeader(result.headers, "x-media-delivery"),
    });
    return destination;
  })().finally(() => downloads.delete(media.id));

  downloads.set(media.id, task);
  return task;
}

async function drainVideoPrefetchQueue(): Promise<void> {
  if (videoPrefetchRunning) return;
  videoPrefetchRunning = true;
  try {
    while (videoPrefetchQueue.length > 0) {
      const entry = videoPrefetchQueue.shift();
      if (!entry) continue;
      try {
        await cacheMessengerMedia(entry.media, entry.accessToken, {
          sessionType: entry.sessionType,
        });
      } catch (error) {
        messengerLog("debug", "media.cache.prefetch.deferred", {
          asset_id: entry.media.id,
          media_type: entry.media.type,
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        queuedVideoPrefetches.delete(entry.media.id);
      }
    }
  } finally {
    videoPrefetchRunning = false;
    if (videoPrefetchQueue.length > 0) void drainVideoPrefetchQueue();
  }
}

/**
 * Starts caching incoming/visible media without blocking message persistence.
 * Images keep their low-latency path, while videos use a single-file queue so
 * several incoming clips cannot saturate the transport at the same time.
 */
export function prefetchMessengerMedia(
  mediaItems: readonly MessengerMedia[],
  accessToken: string,
): void {
  if (!accessToken) return;
  const sessionType =
    AppState.currentState === "active" ? "foreground" : "background";
  mediaItems
    .filter((item) => item.type === "image")
    .forEach((item) => {
      void cacheMessengerMedia(item, accessToken, { sessionType }).catch(
        (error) =>
          messengerLog("debug", "media.cache.prefetch.deferred", {
            asset_id: item.id,
            media_type: item.type,
            message: error instanceof Error ? error.message : String(error),
          }),
      );
    });

  mediaItems
    .filter((item) => item.type === "video")
    .forEach((item) => {
      if (queuedVideoPrefetches.has(item.id) || downloads.has(item.id)) return;
      queuedVideoPrefetches.add(item.id);
      videoPrefetchQueue.push({ media: item, accessToken, sessionType });
      messengerLog("debug", "media.cache.video_prefetch.queued", {
        asset_id: item.id,
        size_bytes: item.size_bytes,
        queue_position: videoPrefetchQueue.length,
        session_type: sessionType,
      });
    });
  if (videoPrefetchQueue.length > 0) void drainVideoPrefetchQueue();
}

/** Compatibility wrapper for callers outside the current messenger bundle. */
export function prefetchMessengerImages(
  mediaItems: readonly MessengerMedia[],
  accessToken: string,
): void {
  prefetchMessengerMedia(
    mediaItems.filter((item) => item.type === "image"),
    accessToken,
  );
}

/** Seeds the protected cache from the file that has just been uploaded. */
export async function seedMessengerMediaCache(
  media: MessengerMedia,
  sourceUri: string,
): Promise<string> {
  if (Platform.OS === "web") return sourceUri;
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
  if (Platform.OS === "web") {
    return [...webMediaObjectUrls.values()].reduce(
      (total, item) => total + item.size,
      0,
    );
  }
  if (!FileSystem.cacheDirectory) return 0;
  return directorySize(CACHE_ROOT);
}

export async function clearMessengerMediaCache(): Promise<number> {
  if (Platform.OS === "web") {
    const bytes = await messengerMediaCacheSize();
    webMediaObjectUrls.forEach((item) => URL.revokeObjectURL(item.uri));
    webMediaObjectUrls.clear();
    downloads.clear();
    videoPrefetchQueue.splice(0, videoPrefetchQueue.length);
    queuedVideoPrefetches.clear();
    messengerLog("info", "media.cache.cleared", { removed_bytes: bytes });
    return bytes;
  }
  if (!FileSystem.cacheDirectory) return 0;
  const bytes = await messengerMediaCacheSize();
  downloads.clear();
  videoPrefetchQueue.splice(0, videoPrefetchQueue.length);
  queuedVideoPrefetches.clear();
  await FileSystem.deleteAsync(CACHE_ROOT, { idempotent: true });
  messengerLog("info", "media.cache.cleared", { removed_bytes: bytes });
  return bytes;
}

export function formatMessengerBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
