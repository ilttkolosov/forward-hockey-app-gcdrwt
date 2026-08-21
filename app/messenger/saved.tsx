import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import SavedMessagesAvatar from "../../features/messenger/SavedMessagesAvatar";
import {
  DEFAULT_SAVED_APPEARANCE,
  getMessengerSavedAppearance,
  SAVED_MESSAGE_COLORS,
  SAVED_MESSAGE_ICONS,
  setMessengerSavedAppearance,
  type MessengerSavedAppearance,
} from "../../services/messengerSavedAppearance";
import { colors } from "../../styles/commonStyles";

export default function MessengerSavedProfileScreen() {
  const router = useRouter();
  const { session, isAuthenticated } = useMessengerAuth();
  const [appearance, setAppearance] =
    useState<MessengerSavedAppearance>(DEFAULT_SAVED_APPEARANCE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/messenger/register");
      return;
    }
    if (!session?.user.id) return;
    let active = true;
    void getMessengerSavedAppearance(session.user.id)
      .then((value) => {
        if (active) setAppearance(value);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, router, session?.user.id]);

  if (!session) return null;

  const persist = (next: MessengerSavedAppearance) => {
    setAppearance(next);
    void setMessengerSavedAppearance(session.user.id, next);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => router.back()}
          accessibilityLabel="Назад в Избранное"
        >
          <Icon name="chevron-back" size={28} color={colors.primary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Избранное</Text>
          <Text style={styles.subtitle}>Личный профиль чата</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={styles.card}>
          <SavedMessagesAvatar size={96} appearance={appearance} />
          <Text style={styles.sectionTitle}>Символ</Text>
          <View style={styles.choices}>
            {SAVED_MESSAGE_ICONS.map((icon) => (
              <TouchableOpacity
                key={icon}
                style={[
                  styles.iconChoice,
                  { backgroundColor: appearance.backgroundColor },
                  appearance.icon === icon && styles.active,
                ]}
                onPress={() => persist({ ...appearance, icon })}
                accessibilityLabel={`Выбрать символ ${icon}`}
              >
                <Icon name={icon} size={27} color="#FFFFFF" />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Цвет фона</Text>
          <View style={styles.choices}>
            {SAVED_MESSAGE_COLORS.map((backgroundColor) => (
              <TouchableOpacity
                key={backgroundColor}
                style={[
                  styles.colorChoice,
                  { backgroundColor },
                  appearance.backgroundColor === backgroundColor &&
                    styles.active,
                ]}
                onPress={() => persist({ ...appearance, backgroundColor })}
                accessibilityLabel={`Выбрать цвет ${backgroundColor}`}
              />
            ))}
          </View>
          <Text style={styles.hint}>
            Оформление хранится на этом устройстве и доступно только вам.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    margin: 18,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    alignSelf: "stretch",
    marginTop: 24,
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  choices: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginTop: 12,
  },
  iconChoice: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "transparent",
    borderRadius: 17,
  },
  colorChoice: {
    width: 52,
    height: 52,
    borderWidth: 3,
    borderColor: "transparent",
    borderRadius: 17,
  },
  active: { borderColor: colors.primary },
  hint: {
    alignSelf: "stretch",
    marginTop: 24,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
});
