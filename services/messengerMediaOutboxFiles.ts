import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Platform } from "react-native";
import type { MessengerUploadFile } from "./messengerAttachmentPicker";

function directory(clientId: string): string {
  if (!FileSystem.documentDirectory) throw new Error("Хранилище вложений недоступно");
  return `${FileSystem.documentDirectory}messenger-outbox/${encodeURIComponent(clientId)}/`;
}
/** Keep picker/cache URIs out of a durable job. A partial copy is never reused. */
export async function retainMessengerMediaFiles(clientId: string, files: MessengerUploadFile[]): Promise<MessengerUploadFile[]> {
  if (Platform.OS === "web") return files;
  const root = directory(clientId);
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const retained: MessengerUploadFile[] = [];
  for (const [index, file] of files.entries()) {
    const suffix = file.name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? "";
    const uri = `${root}${index}${suffix}`;
    if (!(await FileSystem.getInfoAsync(uri)).exists) {
      const temporary = uri + ".part";
      await FileSystem.copyAsync({ from: file.uri, to: temporary });
      await FileSystem.moveAsync({ from: temporary, to: uri });
    }
    retained.push({ ...file, uri });
  }
  return retained;
}
export async function createMessengerMediaPosters(files: MessengerUploadFile[]): Promise<MessengerUploadFile[]> {
  if (Platform.OS === "web") return files;
  const prepared: MessengerUploadFile[] = [];
  for (const file of files) {
    if (file.kind !== "video" || file.thumbnail_uri) { prepared.push(file); continue; }
    try {
      const frame = await VideoThumbnails.getThumbnailAsync(file.uri, { time: 0, quality: 0.5 });
      const uri = file.uri + ".jpg";
      await FileSystem.copyAsync({ from: frame.uri, to: uri });
      await FileSystem.deleteAsync(frame.uri, { idempotent: true });
      prepared.push({ ...file, thumbnail_uri: uri, width: file.width || frame.width, height: file.height || frame.height });
    } catch {
      // An unsupported codec keeps a fixed-size poster placeholder; sending still works.
      prepared.push(file);
    }
  }
  return prepared;
}
export async function releaseMessengerMediaFiles(clientId: string): Promise<void> {
  if (Platform.OS !== "web") await FileSystem.deleteAsync(directory(clientId), { idempotent: true });
}
