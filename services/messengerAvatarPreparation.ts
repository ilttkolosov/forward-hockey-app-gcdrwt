import { File as ExpoFile } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import { messengerLog } from "./messengerLogger";

export interface MessengerPreparedAvatar {
  uri: string;
  name: string;
  type: "image/jpeg";
}

interface MessengerAvatarSource {
  uri: string;
  width?: number | null;
  height?: number | null;
}

const MAX_AVATAR_EDGE = 1_024;
const AVATAR_JPEG_QUALITY = 0.82;

function avatarResizeActions(
  width: number | null | undefined,
  height: number | null | undefined,
): ImageManipulator.Action[] {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    Math.max(width, height) <= MAX_AVATAR_EDGE
  ) {
    return [];
  }
  return [
    {
      resize:
        width >= height
          ? { width: MAX_AVATAR_EDGE }
          : { height: MAX_AVATAR_EDGE },
    },
  ];
}

function uriScheme(uri: string): string {
  return (
    /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1]?.toLowerCase() ??
    "relative"
  );
}

/**
 * Materializes the picker/asset URI into a normal JPEG file before
 * multipart upload. This avoids Android content/resource URIs being
 * handed to React Native's legacy FormData bridge as a pseudo-file.
 */
export async function prepareMessengerAvatarUpload(
  source: MessengerAvatarSource,
): Promise<MessengerPreparedAvatar> {
  const startedAt = Date.now();
  const sourceUri = source.uri.trim();
  if (!sourceUri) {
    throw new Error("Путь к выбранному изображению пуст");
  }

  try {
    const result = await ImageManipulator.manipulateAsync(
      sourceUri,
      avatarResizeActions(source.width, source.height),
      {
        compress: AVATAR_JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    const file = new ExpoFile(result.uri);
    if (!file.exists || Number(file.size) < 1) {
      throw new Error("Подготовленный файл изображения пуст");
    }
    messengerLog("info", "profile.avatar.prepared", {
      source_uri_scheme: uriScheme(sourceUri),
      file_size_bytes: Number(file.size),
      width: result.width,
      height: result.height,
      duration_ms: Date.now() - startedAt,
    });
    return {
      uri: result.uri,
      name: `avatar-${Date.now()}.jpg`,
      type: "image/jpeg",
    };
  } catch (error) {
    messengerLog("warn", "profile.avatar.prepare_failed", {
      source_uri_scheme: uriScheme(sourceUri),
      duration_ms: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw new Error(
      "Не удалось подготовить выбранное изображение. Выберите другую фотографию",
      { cause: error },
    );
  }
}
