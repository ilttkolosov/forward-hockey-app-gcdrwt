import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch as expoFetch } from "expo/fetch";
import { File as ExpoFile } from "expo-file-system";
import {
  deleteAsync,
  documentDirectory,
  downloadAsync,
} from "expo-file-system/legacy";
import { loadPlayersFromDatabase } from "../database/repository";
import type { MessengerSession } from "../features/messenger/types";
import {
  ensureFreshMessengerSession,
  MESSENGER_API_BASE_URL,
  MessengerApiError,
} from "./messengerApi";
import { messengerLog, messengerRequestId } from "./messengerLogger";
import {
  playerDownloadService,
  type MessengerPlayerAvatarUpload,
} from "./playerDataService";
import {
  loadMessengerSession,
  saveMessengerSession,
} from "./messengerSession";

const AUTO_AVATAR_MARKER_PREFIX = "forward_messenger_player_avatar_auto_v2:";
const AVATAR_UPLOAD_TIMEOUT_MS = 60_000;
const RETRY_BACKOFF_MS = 30_000;

const inFlight = new Map<string, Promise<void>>();
const retryAfter = new Map<string, number>();

interface AvatarUploadResponse {
  asset_id: string;
  url: string;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

function normalizePlayerId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const normalized = Number(value.trim());
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function markerKey(userId: string): string {
  return `${AUTO_AVATAR_MARKER_PREFIX}${userId}`;
}

function uriScheme(uri: string): string {
  return /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1]?.toLowerCase() ?? "relative";
}

/**
 * Android release builds of Expo SDK 54 can expose a bundled image as a
 * drawable resource key instead of a readable file URI. Such a value renders
 * in <Image>, but cannot be sent as multipart data. Accept only real local
 * files here; the roster photo URL below materializes a file when necessary.
 */
function readableUploadFile(
  candidate: MessengerPlayerAvatarUpload | null,
): MessengerPlayerAvatarUpload | null {
  if (!candidate || !/^(file|content):\/\//i.test(candidate.uri)) return null;
  try {
    const file = new ExpoFile(candidate.uri);
    return file.exists && Number(file.size) > 0 ? candidate : null;
  } catch {
    return null;
  }
}

function extensionFromUrl(url: string): "jpg" | "png" | "webp" {
  const match = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url);
  const extension = match?.[1]?.toLowerCase();
  if (extension === "png" || extension === "webp") return extension;
  return "jpg";
}

async function currentPlayerPhotoUrl(playerId: number): Promise<string | null> {
  const localPlayers = await loadPlayersFromDatabase();
  const local = localPlayers.find((player) => Number(player.id) === playerId);
  if (local?.photo_url?.trim()) return local.photo_url.trim();

  try {
    const freshPlayers = await playerDownloadService.fetchAllPlayersFull();
    return (
      freshPlayers.find((player) => Number(player.id) === playerId)?.photo_url?.trim() ||
      null
    );
  } catch (error) {
    messengerLog("warn", "avatar.player_auto.photo_url_refresh_failed", {
      player_id: playerId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

async function downloadPlayerPhoto(
  playerId: number,
  photoUrl: string,
): Promise<MessengerPlayerAvatarUpload | null> {
  if (!documentDirectory) return null;
  const extension = extensionFromUrl(photoUrl);
  const uri = `${documentDirectory}messenger_player_${playerId}.${extension}`;
  await deleteAsync(uri, { idempotent: true });
  const result = await downloadAsync(photoUrl, uri);
  if (result.status < 200 || result.status >= 300) {
    messengerLog("warn", "avatar.player_auto.download_rejected", {
      player_id: playerId,
      status: result.status,
    });
    return null;
  }
  return readableUploadFile({
    uri: result.uri,
    name: `player_${playerId}.${extension}`,
    type:
      extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : "image/jpeg",
  });
}

async function resolvePlayerPhoto(
  playerId: number,
): Promise<MessengerPlayerAvatarUpload | null> {
  let localCandidate: MessengerPlayerAvatarUpload | null = null;
  try {
    localCandidate = await playerDownloadService.getLocalPlayerPhotoUpload(playerId);
  } catch (error) {
    messengerLog("warn", "avatar.player_auto.local_lookup_failed", {
      player_id: playerId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  const readableLocalCandidate = readableUploadFile(localCandidate);
  if (readableLocalCandidate) return readableLocalCandidate;
  if (localCandidate) {
    messengerLog("warn", "avatar.player_auto.local_uri_unreadable", {
      player_id: playerId,
      uri_scheme: uriScheme(localCandidate.uri),
    });
  }

  const photoUrl = await currentPlayerPhotoUrl(playerId);
  if (!photoUrl) return null;
  return downloadPlayerPhoto(playerId, photoUrl);
}

function parseAvatarUploadResponse(status: number, body: string): AvatarUploadResponse {
  let payload: ApiEnvelope<AvatarUploadResponse> = {};
  try {
    payload = JSON.parse(body || "{}") as ApiEnvelope<AvatarUploadResponse>;
  } catch {
    // The status-specific error below is more useful than a JSON parse error.
  }
  if (status < 200 || status >= 300) {
    throw new MessengerApiError(
      payload.error?.message || `Сервер отклонил аватар (HTTP ${status})`,
      status,
      payload.error?.code || "avatar_upload_failed",
      payload.error?.details,
    );
  }
  if (!payload.data?.asset_id || !payload.data.url) {
    throw new Error("Сервер вернул некорректный ответ после загрузки аватара");
  }
  return payload.data;
}

async function uploadPlayerAvatar(
  file: MessengerPlayerAvatarUpload,
  allowRefresh = true,
): Promise<AvatarUploadResponse> {
  const session = await loadMessengerSession();
  if (!session?.access_token) {
    throw new MessengerApiError(
      "Необходим вход",
      401,
      "authentication_required",
    );
  }

  const uploadFile = new ExpoFile(file.uri);
  if (!uploadFile.exists || Number(uploadFile.size) < 1) {
    throw new Error("Локальный файл фотографии недоступен для загрузки");
  }

  const requestId = messengerRequestId();
  const form = new FormData();
  form.append("file", uploadFile as unknown as Blob, file.name);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AVATAR_UPLOAD_TIMEOUT_MS);

  messengerLog("info", "avatar.player_auto.upload_started", {
    request_id: requestId,
    file_size_bytes: Number(uploadFile.size),
    file_type: file.type,
  });

  try {
    const response = await expoFetch(`${MESSENGER_API_BASE_URL}/users/me/avatar`, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "x-request-id": requestId,
      },
      body: form,
      signal: controller.signal,
    });
    const body = await response.text();
    messengerLog(response.ok ? "info" : "warn", "avatar.player_auto.upload_response", {
      request_id: response.headers.get("x-request-id") || requestId,
      status: response.status,
    });
    if (response.status === 401 && allowRefresh && session.refresh_token) {
      await ensureFreshMessengerSession({ force: true });
      return uploadPlayerAvatar(file, false);
    }
    return parseAvatarUploadResponse(response.status, body);
  } catch (error) {
    if (timedOut) {
      throw new Error("Загрузка фотографии игрока превысила 60 секунд", {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveUploadedAvatar(
  expectedUserId: string,
  playerId: number,
  uploaded: AvatarUploadResponse,
): Promise<void> {
  const current = await loadMessengerSession();
  if (!current || current.user.id !== expectedUserId) return;
  const next: MessengerSession = {
    ...current,
    user: {
      ...current.user,
      player_id: playerId,
      avatar_url: uploaded.url,
    },
  };
  await AsyncStorage.setItem(markerKey(expectedUserId), String(playerId));
  await saveMessengerSession(next);
}

async function reconcile(expectedUserId: string): Promise<void> {
  const session = await loadMessengerSession();
  if (!session || session.user.id !== expectedUserId) return;
  const playerId = normalizePlayerId(session.user.player_id);
  if (playerId === null) return;

  const marker = await AsyncStorage.getItem(markerKey(expectedUserId));
  if (marker === String(playerId)) return;
  if (session.user.avatar_url) {
    await AsyncStorage.setItem(markerKey(expectedUserId), String(playerId));
    return;
  }

  messengerLog("info", "avatar.player_auto.reconcile_started", {
    user_id: expectedUserId,
    player_id: playerId,
  });
  const photo = await resolvePlayerPhoto(playerId);
  if (!photo) {
    throw new Error(`Фотография игрока ${playerId} не найдена локально или в справочнике`);
  }

  const latest = await loadMessengerSession();
  if (!latest || latest.user.id !== expectedUserId) return;
  if (latest.user.avatar_url) {
    await AsyncStorage.setItem(markerKey(expectedUserId), String(playerId));
    return;
  }

  const uploaded = await uploadPlayerAvatar(photo);
  await saveUploadedAvatar(expectedUserId, playerId, uploaded);
  messengerLog("info", "avatar.player_auto.reconcile_completed", {
    user_id: expectedUserId,
    player_id: playerId,
    asset_id: uploaded.asset_id,
  });
}

export function reconcileMessengerPlayerAvatar(expectedUserId: string): Promise<void> {
  const running = inFlight.get(expectedUserId);
  if (running) return running;
  const notBefore = retryAfter.get(expectedUserId) ?? 0;
  if (Date.now() < notBefore) return Promise.resolve();

  const request = reconcile(expectedUserId)
    .catch((error) => {
      retryAfter.set(expectedUserId, Date.now() + RETRY_BACKOFF_MS);
      messengerLog("warn", "avatar.player_auto.reconcile_failed", {
        user_id: expectedUserId,
        message: error instanceof Error ? error.message : "unknown",
      });
    })
    .finally(() => {
      if (inFlight.get(expectedUserId) === request) inFlight.delete(expectedUserId);
    });
  inFlight.set(expectedUserId, request);
  return request;
}
