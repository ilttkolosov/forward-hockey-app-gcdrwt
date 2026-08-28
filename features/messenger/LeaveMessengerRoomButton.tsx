import { useSQLiteContext } from "expo-sqlite";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "../../components/Icon";
import {
  leaveMessengerRoom,
  messengerErrorMessage,
} from "../../services/messengerApi";
import { colors } from "../../styles/commonStyles";
import { removeCachedMessengerRoom } from "./repository";
import type { MessengerRoom } from "./types";

interface LeaveMessengerRoomButtonProps {
  roomId: string;
  roomType: MessengerRoom["room_type"];
  canLeave: boolean;
  onLeft: () => void;
}

export default function LeaveMessengerRoomButton({
  roomId,
  roomType,
  canLeave,
  onLeft,
}: LeaveMessengerRoomButtonProps) {
  const db = useSQLiteContext();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canLeave || (roomType !== "direct" && roomType !== "private_group")) {
    return null;
  }

  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    setError(null);
    try {
      await leaveMessengerRoom(roomId);
      await removeCachedMessengerRoom(db, roomId);
      onLeft();
    } catch (leaveError) {
      setError(messengerErrorMessage(leaveError, "Не удалось покинуть чат"));
    } finally {
      setLeaving(false);
    }
  };

  const confirm = () => {
    Alert.alert(
      "Покинуть чат?",
      roomType === "direct"
        ? "Чат исчезнет из вашего списка. Его можно будет снова открыть через контакты."
        : "Группа исчезнет из вашего списка. Вернуться можно будет после повторного приглашения.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Покинуть",
          style: "destructive",
          onPress: () => void leave(),
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={confirm}
        disabled={leaving}
        accessibilityRole="button"
        accessibilityLabel="Покинуть чат"
      >
        {leaving ? (
          <ActivityIndicator size="small" color={colors.error} />
        ) : (
          <Icon name="log-out-outline" size={21} color={colors.error} />
        )}
        <Text style={styles.text}>Покинуть чат</Text>
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  button: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(231, 76, 60, 0.35)",
    borderRadius: 15,
    backgroundColor: colors.surface,
  },
  text: { color: colors.error, fontWeight: "800" },
  error: {
    marginTop: 8,
    color: colors.error,
    textAlign: "center",
    fontSize: 12,
  },
});
