import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const remotePushNotificationsSupported =
  !isExpoGo && (Platform.OS === "ios" || Platform.OS === "android");

export const REMOTE_PUSH_UNAVAILABLE_MESSAGE = isExpoGo
  ? "PUSH-уведомления недоступны в Expo Go. Используйте development или preview-сборку."
  : "PUSH-уведомления доступны только в нативной сборке на мобильном устройстве.";
