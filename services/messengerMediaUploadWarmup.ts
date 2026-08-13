import { File as ExpoFile } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { messengerLog } from "./messengerLogger";

interface MessengerBufferedUploadFile {
  uri: string;
  name: string;
  size_bytes?: number | null;
}

// expo/fetch serializes FormData before opening the HTTP request. For a File
// part that serialization starts with File.bytes(), so the first iOS read can
// otherwise look like a several-second network stall even though nginx has not
// received a single byte yet. Keep the speculative reads deliberately small;
// larger/generated media is already materialized by the compressor.
const SPECULATIVE_FILE_READ_MAX_BYTES = 1024 * 1024;
const READY_FILE_CACHE_LIMIT = 32;
const WARMUP_FILE_NAME = "forward-messenger-upload-warmup.txt";

let fileReaderReady = false;
let fileReaderWarmup: Promise<void> | null = null;
const readyFileReads = new Map<string, Promise<void>>();

function fileReadKey(file: MessengerBufferedUploadFile): string {
  return `${file.uri}:${file.size_bytes ?? "unknown"}`;
}

function eligibleForSpeculativeRead(
  file: MessengerBufferedUploadFile,
): boolean {
  return (
    Platform.OS === "ios" &&
    file.uri.startsWith("file://") &&
    typeof file.size_bytes === "number" &&
    file.size_bytes >= 0 &&
    file.size_bytes <= SPECULATIVE_FILE_READ_MAX_BYTES
  );
}

/**
 * Initializes the ExpoFile byte-reading path once per JS process. Ordinary
 * JSON requests do not exercise this path, while expo/fetch multipart uploads
 * must finish it before the request can reach nginx.
 */
export function warmMessengerMediaFileReader(): Promise<void> {
  if (Platform.OS !== "ios" || fileReaderReady) {
    return Promise.resolve();
  }
  if (fileReaderWarmup) return fileReaderWarmup;

  fileReaderWarmup = (async () => {
    const startedAt = Date.now();
    messengerLog("debug", "media.upload_file_reader.warmup_started");
    if (!FileSystem.cacheDirectory) {
      throw new Error("Каталог кэша недоступен");
    }
    const warmupUri = `${FileSystem.cacheDirectory}${WARMUP_FILE_NAME}`;
    await FileSystem.writeAsStringAsync(warmupUri, "1", {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const readStartedAt = Date.now();
    const bytes = await new ExpoFile(warmupUri).bytes();
    fileReaderReady = true;
    messengerLog("info", "media.upload_file_reader.warmup_completed", {
      duration_ms: Date.now() - startedAt,
      file_read_duration_ms: Date.now() - readStartedAt,
      size_bytes: bytes.byteLength,
    });
  })()
    .catch((error) => {
      messengerLog("debug", "media.upload_file_reader.warmup_deferred", {
        message: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      fileReaderWarmup = null;
    });

  return fileReaderWarmup;
}

/**
 * Starts reading small picker files as soon as their preview is available.
 * The resolved promise intentionally retains no byte array: iOS keeps the
 * materialized file in its filesystem cache, while JS memory can be reclaimed.
 * A later caller receives the same promise and therefore never starts a second
 * competing read while the first one is still running.
 */
export function warmMessengerBufferedUploadFiles(
  files: readonly MessengerBufferedUploadFile[],
): Promise<void> {
  if (Platform.OS !== "ios") return Promise.resolve();

  const reads = files.filter(eligibleForSpeculativeRead).map((file) => {
    const key = fileReadKey(file);
    const existing = readyFileReads.get(key);
    if (existing) return existing;

    const read = (async () => {
      await warmMessengerMediaFileReader();
      const startedAt = Date.now();
      messengerLog("debug", "media.upload_file_read.started", {
        file_name: file.name,
        expected_size_bytes: file.size_bytes,
      });
      const bytes = await new ExpoFile(file.uri).bytes();
      messengerLog("info", "media.upload_file_read.completed", {
        file_name: file.name,
        expected_size_bytes: file.size_bytes,
        actual_size_bytes: bytes.byteLength,
        duration_ms: Date.now() - startedAt,
      });
    })().catch((error) => {
      // This is only a speculative optimization. The real upload still gets
      // its own read attempt and returns the actionable error to the user.
      messengerLog("debug", "media.upload_file_read.deferred", {
        file_name: file.name,
        message: error instanceof Error ? error.message : String(error),
      });
    });

    readyFileReads.set(key, read);
    if (readyFileReads.size > READY_FILE_CACHE_LIMIT) {
      const oldestKey = readyFileReads.keys().next().value as
        | string
        | undefined;
      if (oldestKey && oldestKey !== key) readyFileReads.delete(oldestKey);
    }
    return read;
  });

  return Promise.all(reads).then(() => undefined);
}
