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
// Small originals cost less to upload than to decode, recompress and copy.
// Keep them byte-for-byte as selected; the server validates the real file
// signature independently of the client-provided MIME type and filename.
const PHOTO_COMPRESSION_SKIP_BYTES = 500 * 1024;
const PHOTO_SECOND_PASS_TRIGGER_BYTES = 1024 * 1024;
const PHOTO_ESTIMATED_BYTES_PER_PIXEL = 0.32;
const PHOTO_ESTIMATED_OVERHEAD_BYTES = 24 * 1024;
const SECOND_PASS_EDGE = 1280;
const SECOND_PASS_QUALITY = 0.58;
const MAX_VIDEO_EDGE = 720;
const VIDEO_TARGET_BITRATE = 1_500_000;
const VIDEO_ESTIMATED_AUDIO_BITRATE = 128_000;
const VIDEO_COMPRESSION_SKIP_BYTES = 5 * 1024 * 1024;
const MIN_EXPECTED_COMPRESSION_SAVINGS = 0.2;
const MIN_ACTUAL_COMPRESSION_SAVINGS = 0.1;
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

function expectedSavingsRatio(
  originalBytes: number,
  expectedBytes: number,
): number {
  if (originalBytes <= 0) return 0;
  return Math.max(0, (originalBytes - expectedBytes) / originalBytes);
}

function estimatedPhotoOutputBytes(
  width: number,
  height: number,
): number | null {
  if (width <= 0 || height <= 0) return null;
  const longestEdge = Math.max(width, height);
  const scale = Math.min(1, MAX_PHOTO_EDGE / longestEdge);
  const targetPixels = width * scale * height * scale;
  return Math.round(
    targetPixels * PHOTO_ESTIMATED_BYTES_PER_PIXEL +
      PHOTO_ESTIMATED_OVERHEAD_BYTES,
  );
}

async function discardGeneratedMedia(uri: string | null): Promise<void> {
  if (!uri) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
    () => undefined,
  );
}

function originalPhotoType(
  asset: ImagePicker.ImagePickerAsset,
): { mimeType: string; extension: string } | null {
  const mimeType = asset.mimeType?.toLowerCase();
  const extension = (asset.fileName || asset.uri.split(/[?#]/)[0])
    .match(/\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase();
  const byMime: Record<string, string> = {
    "image/avif": "avif",
    "image/heic": "heic",
    "image/heif": "heic",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (mimeType && byMime[mimeType]) {
    return { mimeType, extension: byMime[mimeType] };
  }
  const byExtension: Record<string, string> = {
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return extension && byExtension[extension]
    ? { mimeType: byExtension[extension], extension }
    : null;
}

function originalPhotoFile(
  asset: ImagePicker.ImagePickerAsset,
  originalType: NonNullable<ReturnType<typeof originalPhotoType>>,
  originalSize: number,
): MessengerUploadFile {
  return {
    uri: asset.uri,
    name: asset.fileName || `photo-${Date.now()}.${originalType.extension}`,
    type: originalType.mimeType,
    kind: "image",
    size_bytes: originalSize,
    original_size_bytes: originalSize,
    width: asset.width,
    height: asset.height,
  };
}

function originalVideoType(
  asset: ImagePicker.ImagePickerAsset,
): { mimeType: string; extension: string } | null {
  const mimeType = asset.mimeType?.toLowerCase();
  const extension = (asset.fileName || asset.uri.split(/[?#]/)[0])
    .match(/\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase();
  const byMime: Record<string, string> = {
    "video/3gpp": "3gp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-m4v": "m4v",
  };
  if (mimeType && byMime[mimeType]) {
    return { mimeType, extension: byMime[mimeType] };
  }
  const byExtension: Record<string, string> = {
    "3gp": "video/3gpp",
    m4v: "video/x-m4v",
    mov: "video/quicktime",
    mp4: "video/mp4",
    webm: "video/webm",
  };
  return extension && byExtension[extension]
    ? { mimeType: byExtension[extension], extension }
    : null;
}

function originalVideoFile(
  asset: ImagePicker.ImagePickerAsset,
  originalType: NonNullable<ReturnType<typeof originalVideoType>>,
  originalSize: number,
): MessengerUploadFile {
  return {
    uri: asset.uri,
    name: asset.fileName || `video-${Date.now()}.${originalType.extension}`,
    type: originalType.mimeType,
    kind: "video",
    size_bytes: originalSize,
    original_size_bytes: originalSize,
    width: asset.width,
    height: asset.height,
  };
}

/**
 * Leaves supported originals up to 500 KiB untouched and also skips work when
 * the selected resolution/size predicts less than 20% savings. A stronger
 * second pass is reserved for first-pass results above 1 MiB; generated files
 * that ultimately save less than 10% are discarded in favour of the original.
 */
async function compressedPhoto(
  asset: ImagePicker.ImagePickerAsset,
): Promise<MessengerUploadFile> {
  const startedAt = Date.now();
  const originalSize = await localFileSize(asset.uri, asset.fileSize);
  const originalType = originalPhotoType(asset);
  const expectedOutputSize = estimatedPhotoOutputBytes(
    asset.width,
    asset.height,
  );
  const expectedSavings =
    originalSize !== null && expectedOutputSize !== null
      ? expectedSavingsRatio(originalSize, expectedOutputSize)
      : null;
  if (
    originalType &&
    originalSize !== null &&
    originalSize <= MAX_MESSENGER_UPLOAD_BYTES &&
    (originalSize <= PHOTO_COMPRESSION_SKIP_BYTES ||
      (expectedSavings !== null &&
        expectedSavings < MIN_EXPECTED_COMPRESSION_SAVINGS))
  ) {
    const reason =
      originalSize <= PHOTO_COMPRESSION_SKIP_BYTES
        ? "small_file"
        : "limited_expected_savings";
    messengerLog("info", "photo.compression.skipped", {
      reason,
      duration_ms: Date.now() - startedAt,
      original_size_bytes: originalSize,
      upload_size_bytes: originalSize,
      expected_output_size_bytes: expectedOutputSize,
      expected_savings_percent:
        expectedSavings === null ? null : Math.round(expectedSavings * 100),
      image_width: asset.width,
      image_height: asset.height,
    });
    return originalPhotoFile(asset, originalType, originalSize);
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
  if (
    compressedSize !== null &&
    compressedSize > PHOTO_SECOND_PASS_TRIGGER_BYTES
  ) {
    passCount = 2;
    const firstPass = result;
    const secondPass = await ImageManipulator.manipulateAsync(
      firstPass.uri,
      resizeToLongestEdge(result.width, result.height, SECOND_PASS_EDGE),
      {
        compress: SECOND_PASS_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    const secondPassSize = await localFileSize(secondPass.uri);
    if (
      secondPassSize !== null &&
      (compressedSize === null || secondPassSize < compressedSize)
    ) {
      result = secondPass;
      compressedSize = secondPassSize;
      await discardGeneratedMedia(firstPass.uri);
    } else {
      await discardGeneratedMedia(secondPass.uri);
    }
  }
  const actualSavings =
    originalSize !== null && compressedSize !== null
      ? expectedSavingsRatio(originalSize, compressedSize)
      : null;
  if (
    originalType &&
    originalSize !== null &&
    originalSize <= MAX_MESSENGER_UPLOAD_BYTES &&
    actualSavings !== null &&
    actualSavings < MIN_ACTUAL_COMPRESSION_SAVINGS
  ) {
    await discardGeneratedMedia(result.uri);
    messengerLog("info", "photo.compression.discarded", {
      reason: "limited_actual_savings",
      duration_ms: Date.now() - startedAt,
      original_size_bytes: originalSize,
      compressed_size_bytes: compressedSize,
      actual_savings_percent: Math.round(actualSavings * 100),
    });
    return originalPhotoFile(asset, originalType, originalSize);
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
    throw new Error("Сжатие видео доступно только в мобильном приложении");
  }

  const startedAt = Date.now();
  const originalSize = await localFileSize(asset.uri, asset.fileSize);
  const originalType = originalVideoType(asset);
  const durationSeconds =
    typeof asset.duration === "number" && asset.duration > 0
      ? asset.duration / 1000
      : null;
  const averageBitrate =
    originalSize !== null && durationSeconds !== null
      ? Math.round((originalSize * 8) / durationSeconds)
      : null;
  const expectedOutputBitrate =
    VIDEO_TARGET_BITRATE + VIDEO_ESTIMATED_AUDIO_BITRATE;
  const expectedOutputSize =
    durationSeconds === null
      ? null
      : Math.round((durationSeconds * expectedOutputBitrate) / 8);
  const expectedSavings =
    originalSize !== null && expectedOutputSize !== null
      ? expectedSavingsRatio(originalSize, expectedOutputSize)
      : null;

  if (
    originalType &&
    originalSize !== null &&
    originalSize <= MAX_MESSENGER_UPLOAD_BYTES &&
    (originalSize <= VIDEO_COMPRESSION_SKIP_BYTES ||
      (expectedSavings !== null &&
        expectedSavings < MIN_EXPECTED_COMPRESSION_SAVINGS))
  ) {
    const reason =
      originalSize <= VIDEO_COMPRESSION_SKIP_BYTES
        ? "small_file"
        : "already_efficient";
    onProgress?.(100);
    messengerLog("info", "video.compression.skipped", {
      reason,
      duration_ms: Date.now() - startedAt,
      original_size_bytes: originalSize,
      upload_size_bytes: originalSize,
      video_duration_ms: asset.duration,
      video_width: asset.width,
      video_height: asset.height,
      average_bitrate: averageBitrate,
      expected_savings_percent:
        expectedSavings === null ? null : Math.round(expectedSavings * 100),
    });
    return originalVideoFile(asset, originalType, originalSize);
  }
  messengerLog("info", "video.compression.started", {
    original_size_bytes: originalSize,
    video_width: asset.width,
    video_height: asset.height,
    video_duration_ms: asset.duration,
    average_bitrate: averageBitrate,
    expected_output_size_bytes: expectedOutputSize,
    expected_savings_percent:
      expectedSavings === null ? null : Math.round(expectedSavings * 100),
  });

  let Video: (typeof import("react-native-compressor"))["Video"];
  try {
    ({ Video } = await import("react-native-compressor"));
  } catch (error) {
    messengerLog("warn", "video.compressor.unavailable", {
      message: error instanceof Error ? error.message : String(error),
    });
    if (
      originalType &&
      originalSize !== null &&
      originalSize <= MAX_MESSENGER_UPLOAD_BYTES
    ) {
      onProgress?.(100);
      return originalVideoFile(asset, originalType, originalSize);
    }
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
  const actualSavings =
    originalSize !== null && compressedSize !== null
      ? expectedSavingsRatio(originalSize, compressedSize)
      : null;
  if (
    originalType &&
    originalSize !== null &&
    originalSize <= MAX_MESSENGER_UPLOAD_BYTES &&
    actualSavings !== null &&
    actualSavings < MIN_ACTUAL_COMPRESSION_SAVINGS
  ) {
    await discardGeneratedMedia(uri);
    onProgress?.(100);
    messengerLog("info", "video.compression.discarded", {
      reason: "limited_actual_savings",
      duration_ms: Date.now() - startedAt,
      original_size_bytes: originalSize,
      compressed_size_bytes: compressedSize,
      actual_savings_percent: Math.round(actualSavings * 100),
    });
    return originalVideoFile(asset, originalType, originalSize);
  }
  const file: MessengerUploadFile = {
    uri,
    name: `video-${Date.now()}.mp4`,
    type: "video/mp4",
    kind: "video",
    size_bytes: compressedSize,
    original_size_bytes: originalSize,
  };
  assertMessengerUploadLimits([file]);
  onProgress?.(100);
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
  onPreparationProgress?: (progress: MessengerMediaPreparationProgress) => void,
): Promise<MessengerUploadFile[]> {
  if (Platform.OS !== "web") await mediaLibraryPermission();
  messengerLog("debug", "attachment.picker.opening", { kind: "library" });
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: MAX_MESSENGER_MEDIA_SELECTION,
    orderedSelection: true,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
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
