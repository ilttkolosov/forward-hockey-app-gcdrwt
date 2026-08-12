import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { messengerLog } from "./messengerLogger";

export interface MessengerUploadFile {
  uri: string;
  name: string;
  type: string;
  kind: "image" | "video" | "file";
  size_bytes: number | null;
  original_size_bytes: number | null;
  width?: number;
  height?: number;
}

export interface MessengerMediaPreparationProgress {
  item: number;
  total: number;
  percent: number;
}

const MAX_PHOTO_EDGE = 1600;
const PHOTO_JPEG_QUALITY = 0.68;
const MAX_PHOTO_UPLOAD_BYTES = 350 * 1024;
const SECOND_PASS_EDGE = 1280;
const SECOND_PASS_QUALITY = 0.58;
const MAX_VIDEO_EDGE = 720;
const VIDEO_TARGET_BITRATE = 1_500_000;
export const MAX_MESSENGER_MEDIA_SELECTION = 10;
export const MAX_MESSENGER_UPLOAD_BYTES = 50 * 1024 * 1024;

function megabytes(bytes: number): string {
  return `${Math.ceil(bytes / (1024 * 1024))} МБ`;
}

function assertKnownSize(
  file: Pick<MessengerUploadFile, "name" | "size_bytes">,
): number {
  if (file.size_bytes === null) {
    throw new Error(
      `Не удалось определить размер файла «${file.name}». Выберите другой файл`,
    );
  }
  return file.size_bytes;
}

export function assertMessengerUploadLimits(
  files: readonly MessengerUploadFile[],
): void {
  let totalBytes = 0;
  for (const file of files) {
    const size = assertKnownSize(file);
    if (size > MAX_MESSENGER_UPLOAD_BYTES) {
      throw new Error(
        `Файл «${file.name}» занимает ${megabytes(size)}. Максимальный размер — 50 МБ`,
      );
    }
    totalBytes += size;
  }
  if (totalBytes > MAX_MESSENGER_UPLOAD_BYTES) {
    throw new Error(
      `Общий размер выбранных вложений — ${megabytes(totalBytes)}. За одно сообщение можно отправить не более 50 МБ`,
    );
  }
}

function waitForPermissionDialogDismissal(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

async function cameraPermission(): Promise<void> {
  let permission = await ImagePicker.getCameraPermissionsAsync();
  let requested = false;
  if (!permission.granted && permission.canAskAgain) {
    requested = true;
    permission = await ImagePicker.requestCameraPermissionsAsync();
  }
  messengerLog("debug", "attachment.permission.checked", {
    kind: "camera",
    status: permission.status,
    granted: permission.granted,
    can_ask_again: permission.canAskAgain,
    requested,
  });
  if (!permission.granted) {
    throw new Error(
      permission.canAskAgain
        ? "Для съёмки фотографии разрешите приложению доступ к камере"
        : Platform.OS === "ios"
          ? "Доступ к камере запрещён. Откройте Настройки iPhone → ХК Форвард 14 → Камера и включите доступ"
          : "Доступ к камере запрещён. Разрешите его в настройках приложения",
    );
  }
  if (requested) await waitForPermissionDialogDismissal();
}

async function mediaLibraryPermission(): Promise<void> {
  let permission = await ImagePicker.getMediaLibraryPermissionsAsync();
  let requested = false;
  if (!permission.granted && permission.canAskAgain) {
    requested = true;
    permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  }
  messengerLog("debug", "attachment.permission.checked", {
    kind: "library",
    status: permission.status,
    granted: permission.granted,
    can_ask_again: permission.canAskAgain,
    access_privileges: permission.accessPrivileges,
    requested,
  });
  if (!permission.granted) {
    throw new Error(
      permission.canAskAgain
        ? "Для выбора медиа разрешите приложению доступ к медиатеке"
        : Platform.OS === "ios"
          ? "Доступ к медиатеке запрещён. Откройте Настройки iPhone → ХК Форвард 14 → Фото и включите доступ"
          : "Доступ к медиатеке запрещён. Разрешите его в настройках приложения",
    );
  }
  if (requested) await waitForPermissionDialogDismissal();
}

async function localFileSize(
  uri: string,
  reportedSize?: number | null,
): Promise<number | null> {
  if (typeof reportedSize === "number" && reportedSize >= 0) {
    return reportedSize;
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory ? info.size : null;
  } catch {
    // Some iOS picker URLs (for example ph://) are readable by the image
    // manipulator but cannot be inspected directly by expo-file-system.
    return null;
  }
}

function resizeToLongestEdge(
  width: number,
  height: number,
  longestEdge: number,
): ImageManipulator.Action[] {
  if (width <= longestEdge && height <= longestEdge) return [];
  return [
    {
      resize:
        width >= height ? { width: longestEdge } : { height: longestEdge },
    },
  ];
}

/**
 * Converts every selected photo to a reasonably sized JPEG before upload.
 * The first pass is suitable for normal phone viewing. Detailed/noisy photos
 * that remain above 350 KiB receive a stronger second pass so the small test
 * server and mobile connections are not burdened by camera-sized originals.
 */
async function compressedPhoto(
  asset: ImagePicker.ImagePickerAsset,
): Promise<MessengerUploadFile> {
  const startedAt = Date.now();
  const originalSize = await localFileSize(asset.uri, asset.fileSize);
  const sourceIsJpeg =
    asset.mimeType === "image/jpeg" ||
    /\.jpe?g$/i.test(asset.fileName || asset.uri.split(/[?#]/)[0]);
  if (
    sourceIsJpeg &&
    originalSize !== null &&
    originalSize <= MAX_PHOTO_UPLOAD_BYTES &&
    asset.width <= MAX_PHOTO_EDGE &&
    asset.height <= MAX_PHOTO_EDGE
  ) {
    messengerLog("info", "photo.compression.skipped", {
      reason: "already_upload_ready",
      duration_ms: Date.now() - startedAt,
      original_size_bytes: originalSize,
      upload_size_bytes: originalSize,
      image_width: asset.width,
      image_height: asset.height,
    });
    return {
      uri: asset.uri,
      name: asset.fileName || `photo-${Date.now()}.jpg`,
      type: "image/jpeg",
      kind: "image",
      size_bytes: originalSize,
      original_size_bytes: originalSize,
      width: asset.width,
      height: asset.height,
    };
  }

  let passCount = 1;
  let result = await ImageManipulator.manipulateAsync(
    asset.uri,
    resizeToLongestEdge(asset.width, asset.height, MAX_PHOTO_EDGE),
    {
      compress: PHOTO_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  let compressedSize = await localFileSize(result.uri);
  if (compressedSize !== null && compressedSize > MAX_PHOTO_UPLOAD_BYTES) {
    passCount = 2;
    result = await ImageManipulator.manipulateAsync(
      result.uri,
      resizeToLongestEdge(result.width, result.height, SECOND_PASS_EDGE),
      {
        compress: SECOND_PASS_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    compressedSize = await localFileSize(result.uri);
  }
  messengerLog("info", "photo.compression.completed", {
    duration_ms: Date.now() - startedAt,
    pass_count: passCount,
    original_size_bytes: originalSize,
    upload_size_bytes: compressedSize,
    image_width: result.width,
    image_height: result.height,
  });
  return {
    uri: result.uri,
    name: `photo-${Date.now()}.jpg`,
    type: "image/jpeg",
    kind: "image",
    size_bytes: compressedSize,
    original_size_bytes: originalSize,
    width: result.width,
    height: result.height,
  };
}

async function compressedVideo(
  asset: ImagePicker.ImagePickerAsset,
  onProgress?: (percent: number) => void,
): Promise<MessengerUploadFile> {
  if (Platform.OS === "web") {
    throw new Error(
      "Сжатие видео доступно только в мобильном приложении",
    );
  }

  const startedAt = Date.now();
  const originalSize = await localFileSize(asset.uri, asset.fileSize);
  messengerLog("info", "video.compression.started", {
    original_size_bytes: originalSize,
    video_width: asset.width,
    video_height: asset.height,
    duration_ms: asset.duration,
  });

  let Video: typeof import("react-native-compressor")["Video"];
  try {
    ({ Video } = await import("react-native-compressor"));
  } catch (error) {
    messengerLog("warn", "video.compressor.unavailable", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      "Модуль сжатия видео недоступен. Установите новую сборку приложения",
    );
  }

  let lastLoggedProgress = -1;
  onProgress?.(0);
  const uri = await Video.compress(
    asset.uri,
    {
      compressionMethod: "manual",
      maxSize: MAX_VIDEO_EDGE,
      bitrate: VIDEO_TARGET_BITRATE,
      minimumFileSizeForCompress: 0,
      progressDivider: 10,
    },
    (progress) => {
      const percent = Math.round(progress * 100);
      if (percent >= lastLoggedProgress + 10 || percent === 100) {
        lastLoggedProgress = percent;
        messengerLog("debug", "video.compression.progress", { percent });
      }
      onProgress?.(percent);
    },
  );
  const compressedSize = await localFileSize(uri);
  const file: MessengerUploadFile = {
    uri,
    name: `video-${Date.now()}.mp4`,
    type: "video/mp4",
    kind: "video",
    size_bytes: compressedSize,
    original_size_bytes: originalSize,
  };
  assertMessengerUploadLimits([file]);
  messengerLog("info", "video.compression.completed", {
    duration_ms: Date.now() - startedAt,
    original_size_bytes: originalSize,
    upload_size_bytes: compressedSize,
    target_max_edge: MAX_VIDEO_EDGE,
    target_bitrate: VIDEO_TARGET_BITRATE,
  });
  return file;
}

export async function takeMessengerPhoto(): Promise<MessengerUploadFile | null> {
  if (Platform.OS !== "web") await cameraPermission();
  messengerLog("debug", "attachment.picker.opening", { kind: "camera" });
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  messengerLog("debug", "attachment.picker.closed", {
    kind: "camera",
    canceled: result.canceled,
    asset_count: result.assets?.length ?? 0,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? compressedPhoto(asset) : null;
}

export async function pickMessengerMedia(
  onPreparationProgress?: (
    progress: MessengerMediaPreparationProgress,
  ) => void,
): Promise<MessengerUploadFile[]> {
  if (Platform.OS !== "web") await mediaLibraryPermission();
  messengerLog("debug", "attachment.picker.opening", { kind: "library" });
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: MAX_MESSENGER_MEDIA_SELECTION,
    orderedSelection: true,
    quality: 1,
    videoMaxDuration: 180,
  });
  messengerLog("debug", "attachment.picker.closed", {
    kind: "library",
    canceled: result.canceled,
    asset_count: result.assets?.length ?? 0,
  });
  if (result.canceled) return [];
  const files: MessengerUploadFile[] = [];
  const selected = result.assets.slice(0, MAX_MESSENGER_MEDIA_SELECTION);
  for (const [index, asset] of selected.entries()) {
    if (asset.type === "video") {
      files.push(
        await compressedVideo(asset, (percent) =>
          onPreparationProgress?.({
            item: index + 1,
            total: selected.length,
            percent,
          }),
        ),
      );
    } else {
      files.push(await compressedPhoto(asset));
    }
  }
  assertMessengerUploadLimits(files);
  return files;
}

export async function pickMessengerAvatar(): Promise<MessengerUploadFile | null> {
  if (Platform.OS !== "web") await mediaLibraryPermission();
  messengerLog("debug", "attachment.picker.opening", { kind: "avatar" });
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  messengerLog("debug", "attachment.picker.closed", {
    kind: "avatar",
    canceled: result.canceled,
    asset_count: result.assets?.length ?? 0,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? compressedPhoto(asset) : null;
}

export async function pickMessengerFile(): Promise<MessengerUploadFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const size = await localFileSize(asset.uri, asset.size);
  const file: MessengerUploadFile = {
    uri: asset.uri,
    name: asset.name || `file-${Date.now()}`,
    type: asset.mimeType || "application/octet-stream",
    kind: "file",
    size_bytes: size,
    original_size_bytes: size,
  };
  assertMessengerUploadLimits([file]);
  return file;
}

export async function currentMessengerLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  label: string;
}> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      "Для отправки геопозиции разрешите приложению доступ к местоположению",
    );
  }
  const result = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    latitude: result.coords.latitude,
    longitude: result.coords.longitude,
    accuracy_meters: result.coords.accuracy,
    label: "Моя геопозиция",
  };
}
