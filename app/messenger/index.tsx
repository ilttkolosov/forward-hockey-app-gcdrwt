import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import { colors } from "../../styles/commonStyles";

export default function MessengerEntryScreen() {
  const { status, isAuthenticated } = useMessengerAuth();

  if (status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (status === "password_change_required") {
    return <Redirect href="/messenger/change-password" />;
  }

  return (
    <Redirect
      href={isAuthenticated ? "/messenger/rooms" : "/messenger/register"}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
