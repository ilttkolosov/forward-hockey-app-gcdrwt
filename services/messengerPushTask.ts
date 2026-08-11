import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { messengerLog } from "./messengerLogger";
import { processMessengerPushPayload } from "./messengerPush";
import { remotePushNotificationsSupported } from "./runtimeEnvironment";

export const MESSENGER_BACKGROUND_NOTIFICATION_TASK =
  "forward-messenger-background-notification";

if (
  remotePushNotificationsSupported &&
  (Platform.OS === "ios" || Platform.OS === "android") &&
  !TaskManager.isTaskDefined(MESSENGER_BACKGROUND_NOTIFICATION_TASK)
) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    MESSENGER_BACKGROUND_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error) {
        messengerLog("warn", "push.background.failed", {
          message: error.message,
        });
        return;
      }
      await processMessengerPushPayload(data);
    },
  );
}

if (
  remotePushNotificationsSupported &&
  (Platform.OS === "ios" || Platform.OS === "android")
) {
  void Notifications.registerTaskAsync(
    MESSENGER_BACKGROUND_NOTIFICATION_TASK,
  ).catch((error) => {
    messengerLog("debug", "push.background.registration_skipped", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}
