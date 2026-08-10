import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

export interface MessengerUploadFile {
  uri: string;
  name: string;
  type: string;
  kind: "image" | "video" | "file";
}

const MAX_PHOTO_EDGE = 1920;
const PHOTO_JPEG_QUALITY = 0.78;

/**
 * Converts every selected photo to a reasonably sized JPEG before upload.
 * 1920 px preserves enough detail for a phone viewer while avoiding multi-MB
 * HEIC/camera originals on the network and on the small test server.
 */
async function compressedPhoto(
  asset: ImagePicker.ImagePickerAsset,
): Promise<MessengerUploadFile> {
  const actions: ImageManipulator.Action[] = [];
  if (asset.width > MAX_PHOTO_EDGE || asset.height > MAX_PHOTO_EDGE) {
    actions.push({
      resize:
        asset.width >= asset.height
          ? { width: MAX_PHOTO_EDGE }
          : { height: MAX_PHOTO_EDGE },
    });
  }
  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: PHOTO_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return {
    uri: result.uri,
    name: `photo-${Date.now()}.jpg`,
    type: "image/jpeg",
    kind: "image",
  };
}

export async function takeMessengerPhoto(): Promise<MessengerUploadFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      "Для съёмки фотографии разрешите приложению доступ к камере",
    );
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? compressedPhoto(asset) : null;
}

export async function pickMessengerMedia(): Promise<MessengerUploadFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Для выбора медиа разрешите приложению доступ к медиатеке");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: false,
    quality: 1,
    videoMaxDuration: 180,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  if (asset.type === "video") {
    return {
      uri: asset.uri,
      name: asset.fileName || `video-${Date.now()}.mp4`,
      type: asset.mimeType || "video/mp4",
      kind: "video",
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
  return asset
    ? {
        uri: asset.uri,
        name: asset.name || `file-${Date.now()}`,
        type: asset.mimeType || "application/octet-stream",
        kind: "file",
      }
    : null;
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
