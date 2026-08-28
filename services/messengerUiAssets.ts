import { Asset } from "expo-asset";
import { Image } from "expo-image";

const chatBackgroundModule = require("../assets/messenger/ice-chat-background.jpg");
const chatBackgroundAsset = Asset.fromModule(chatBackgroundModule);

let chatBackgroundWarmup: Promise<void> | null = null;

export function warmMessengerUiAssets(): Promise<void> {
  if (chatBackgroundWarmup) return chatBackgroundWarmup;

  chatBackgroundWarmup = chatBackgroundAsset
    .downloadAsync()
    .then(async () => {
      const uri = chatBackgroundAsset.localUri || chatBackgroundAsset.uri;
      if (uri) await Image.prefetch(uri, "memory-disk");
    })
    .catch((error) => {
      // The background is bundled with the application, so a warm-up failure
      // is non-fatal. The room can still render it through the asset URI.
      console.warn("[Messenger] Не удалось заранее подготовить фон чата:", error);
    });

  return chatBackgroundWarmup;
}

export function getMessengerChatBackgroundUri(): string {
  return chatBackgroundAsset.localUri || chatBackgroundAsset.uri;
}
