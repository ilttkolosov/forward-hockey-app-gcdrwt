import { requireOptionalNativeModule } from "expo";
import * as ScreenOrientation from "expo-screen-orientation";
import { Platform } from "react-native";
import { messengerLog } from "./messengerLogger";

interface NativeFilePreviewModule {
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
      candidate && typeof candidate.previewFile === "function"
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
 * Opens Quick Look on iOS or an ACTION_VIEW handler on Android. Do not call
 * canPreview first: Android package visibility can report a false negative,
 * even though starting the VIEW intent succeeds.
 */
export async function openMessengerFilePreview(uri: string): Promise<void> {
  const nativePreview = getNativeFilePreviewModule();
  if (!nativePreview) {
    throw new Error(
      "Системный просмотрщик недоступен в этой сборке. Установите новую версию приложения.",
    );
  }

  try {
    await ScreenOrientation.unlockAsync();
    await nativePreview.previewFile({
      uri,
      chooserTitle: "Открыть в просмотрщике",
      editingMode: "disabled",
    });
  } catch (previewError) {
    messengerLog("warn", "media.native_preview.failed", {
      error_type:
        previewError instanceof Error ? previewError.name : "unknown_error",
      platform: Platform.OS,
    });
    throw new Error("Не удалось открыть системный просмотрщик.", {
      cause: previewError,
    });
  } finally {
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => undefined);
  }
}
