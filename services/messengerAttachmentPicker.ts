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

const MAX_PHOTO_EDGE = 1600;
const PHOTO_JPEG_QUALITY = 0.68;
const MAX_PHOTO_UPLOAD_BYTES = 350 * 1024;
const SECOND_PASS_EDGE = 1280;
const SECOND_PASS_QUALITY = 0.58;

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
  const originalSize = await localFileSize(asset.uri, asset.fileSize);
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

export async function pickMessengerMedia(): Promise<MessengerUploadFile | null> {
  if (Platform.OS !== "web") await mediaLibraryPermission();
  messengerLog("debug", "attachment.picker.opening", { kind: "library" });
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: false,
    quality: 1,
    videoMaxDuration: 180,
  });
  messengerLog("debug", "attachment.picker.closed", {
    kind: "library",
    canceled: result.canceled,
    asset_count: result.assets?.length ?? 0,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  if (asset.type === "video") {
    const size = await localFileSize(asset.uri, asset.fileSize);
    return {
      uri: asset.uri,
      name: asset.fileName || `video-${Date.now()}.mp4`,
      type: asset.mimeType || "video/mp4",
      kind: "video",
      size_bytes: size,
      original_size_bytes: size,
    };
  }
  return compressedPhoto(asset);
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
  return {
    uri: asset.uri,
    name: asset.name || `file-${Date.now()}`,
    type: asset.mimeType || "application/octet-stream",
    kind: "file",
    size_bytes: size,
    original_size_bytes: size,
  };
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
