import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { messengerLog } from "./messengerLogger";
import { processMessengerPushPayload } from "./messengerPush";
import { remotePushNotificationsSupported } from "./runtimeEnvironment";

export const MESSENGER_BACKGROUND_NOTIFICATION_TASK =
  "forward-messenger-background-notification";

function setupErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setupMessengerBackgroundNotificationTask(): void {
  if (
    !remotePushNotificationsSupported ||
    (Platform.OS !== "ios" && Platform.OS !== "android")
  ) {
    return;
  }

  // This module is imported before expo-router so the task can receive a
  // notification when Android starts the JS runtime in the background. The
  // task is optional for launching the foreground application, though: a
  // vendor-specific TaskManager/Notifications bootstrap failure must never
  // terminate the whole app before the first screen is mounted.
  try {
    if (!TaskManager.isTaskDefined(MESSENGER_BACKGROUND_NOTIFICATION_TASK)) {
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

    void Notifications.registerTaskAsync(
      MESSENGER_BACKGROUND_NOTIFICATION_TASK,
    ).catch((error) => {
      messengerLog("debug", "push.background.registration_skipped", {
        message: setupErrorMessage(error),
      });
    });
  } catch (error) {
    messengerLog("warn", "push.background.setup_skipped", {
      message: setupErrorMessage(error),
    });
  }
}

setupMessengerBackgroundNotificationTask();
