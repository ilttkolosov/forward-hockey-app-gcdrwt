import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { MessengerMedia } from "../features/messenger/types";
import { cacheMessengerMedia } from "./messengerMediaCache";

export type MessengerMediaSaveTarget = "media_library" | "files";

function safeFileName(media: MessengerMedia): string {
  const fallback = `forward-${media.id}`;
  const cleaned = (media.original_name || fallback)
    .replace(/[\\/:*?"<>|]/g, "_")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("")
    .trim();
  return cleaned || fallback;
}

async function shareToFiles(
  localUri: string,
  media: MessengerMedia,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Системное сохранение файлов недоступно");
  }
  await Sharing.shareAsync(localUri, {
    dialogTitle: `Сохранить «${safeFileName(media)}» в Файлы`,
    mimeType: media.mime_type,
  });
}

async function saveFileOnAndroid(
  localUri: string,
  media: MessengerMedia,
): Promise<void> {
  const permission =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Папка для сохранения не выбрана");
  }
  const destination = await FileSystem.StorageAccessFramework.createFileAsync(
    permission.directoryUri,
    safeFileName(media),
    media.mime_type || "application/octet-stream",
  );
  const content = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.writeAsStringAsync(destination, content, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function saveMessengerMediaToDevice(
  media: MessengerMedia,
  accessToken: string,
): Promise<MessengerMediaSaveTarget> {
  const localUri = await cacheMessengerMedia(media, accessToken);
  if (Platform.OS === "web") {
    const anchor = document.createElement("a");
    anchor.href = localUri;
    anchor.download = safeFileName(media);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return "files";
  }
  if (media.type === "image" || media.type === "video") {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      throw new Error("Нет разрешения на сохранение в медиатеку");
    }
    await MediaLibrary.saveToLibraryAsync(localUri);
    return "media_library";
  }

  if (Platform.OS === "android") {
    await saveFileOnAndroid(localUri, media);
  } else {
    await shareToFiles(localUri, media);
  }
  return "files";
}
