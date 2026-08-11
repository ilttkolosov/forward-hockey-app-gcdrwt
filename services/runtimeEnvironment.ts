import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const remotePushNotificationsSupported =
  !isExpoGo && (Platform.OS === "ios" || Platform.OS === "android");

type RuntimeFeatures = {
  androidGoogleMapsConfigured?: boolean;
};

const runtimeFeatures = (
  Constants.expoConfig?.extra as
    | { runtimeFeatures?: RuntimeFeatures }
    | undefined
)?.runtimeFeatures;

export const nativeMessengerMapSupported =
  Platform.OS !== "android" ||
  isExpoGo ||
  runtimeFeatures?.androidGoogleMapsConfigured === true;

export const REMOTE_PUSH_UNAVAILABLE_MESSAGE = isExpoGo
  ? "PUSH-уведомления недоступны в Expo Go. Используйте development или preview-сборку."
  : "PUSH-уведомления доступны только в нативной сборке на мобильном устройстве.";
