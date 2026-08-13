import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { messengerLog } from "./messengerLogger";

interface NativeFilePreviewModule {
  canPreview(uri: string): Promise<boolean>;
  previewFile(options: {
    uri: string;
    chooserTitle?: string;
    editingMode?: "disabled";
  }): Promise<void>;
}

let resolvedModule: NativeFilePreviewModule | null | undefined;

function getNativeFilePreviewModule(): NativeFilePreviewModule | null {
  if (resolvedModule !== undefined) return resolvedModule;
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    resolvedModule = null;
    return resolvedModule;
  }

  try {
    const candidate =
      requireOptionalNativeModule<NativeFilePreviewModule>("ExpoQuickLook");
    resolvedModule =
      candidate &&
      typeof candidate.canPreview === "function" &&
      typeof candidate.previewFile === "function"
        ? candidate
        : null;
  } catch {
    resolvedModule = null;
  }

  messengerLog("debug", "media.native_preview.resolved", {
    available: Boolean(resolvedModule),
    platform: Platform.OS,
  });
  return resolvedModule;
}

/**
 * Uses Quick Look on iOS or an installed ACTION_VIEW handler on Android.
 * Expo Go does not include the optional native module, so this safely returns
 * false and lets the caller use the regular save/share flow.
 */
export async function tryPreviewMessengerFile(uri: string): Promise<boolean> {
  const nativePreview = getNativeFilePreviewModule();
  if (!nativePreview) return false;

  try {
    if (!(await nativePreview.canPreview(uri))) {
      messengerLog("debug", "media.native_preview.unsupported", {
        platform: Platform.OS,
      });
      return false;
    }
    await nativePreview.previewFile({
      uri,
      chooserTitle: "Открыть файл",
      editingMode: "disabled",
    });
    return true;
  } catch (previewError) {
    messengerLog("warn", "media.native_preview.failed", {
      error_type:
        previewError instanceof Error ? previewError.name : "unknown_error",
      platform: Platform.OS,
    });
    return false;
  }
}
