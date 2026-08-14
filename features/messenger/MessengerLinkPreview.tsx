import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "../../components/Icon";
import { colors } from "../../styles/commonStyles";
import {
  getMessengerLinkPreview,
  splitMessengerTextLinks,
  type MessengerLinkPreview as MessengerLinkPreviewData,
} from "../../services/messengerLinkPreview";
import { messengerLog } from "../../services/messengerLogger";

async function openExternalUrl(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch (error) {
    messengerLog("warn", "link.open_failed", {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function MessengerLinkifiedText({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
}) {
  const segments = useMemo(() => splitMessengerTextLinks(text), [text]);
  return (
    <Text style={style}>
      {segments.map((segment, index) =>
        segment.url ? (
          <Text
            key={`${index}:${segment.text}`}
            style={styles.linkText}
            onPress={() => void openExternalUrl(segment.url!)}
            accessibilityRole="link"
            accessibilityLabel={`Открыть ссылку ${segment.text}`}
            suppressHighlighting={false}
          >
            {segment.text}
          </Text>
        ) : (
          segment.text
        ),
      )}
    </Text>
  );
}

export default function MessengerLinkPreview({
  url,
  enabled,
  mine,
}: {
  url: string;
  enabled: boolean;
  mine: boolean;
}) {
  const [preview, setPreview] = useState<MessengerLinkPreviewData | null>(null);
  const [resolved, setResolved] = useState(false);
  const hostname = useMemo(() => {
    try {
      return new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      return url;
    }
  }, [url]);

  useEffect(() => {
    let active = true;
    setPreview(null);
    setResolved(false);
    if (!enabled) return () => {
      active = false;
    };
    void getMessengerLinkPreview(url).then((next) => {
      if (!active) return;
      setPreview(next);
      setResolved(true);
    });
    return () => {
      active = false;
    };
  }, [enabled, url]);

  return (
    <TouchableOpacity
      style={[styles.card, mine ? styles.cardMine : styles.cardTheirs]}
      activeOpacity={0.78}
      onPress={() => void openExternalUrl(url)}
      accessibilityRole="link"
      accessibilityLabel={`Открыть ${preview?.title || hostname}`}
    >
      <View style={styles.imageShell}>
        {preview?.imageUrl ? (
          <Image
            source={{ uri: preview.imageUrl }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : !resolved && enabled ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Icon name="link" size={23} color={colors.primary} />
        )}
      </View>
      <View style={styles.textColumn}>
        <Text style={styles.siteName} numberOfLines={1}>
          {preview?.siteName || hostname}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {preview?.title || hostname}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  linkText: {
    color: "#1267B1",
    textDecorationLine: "underline",
  },
  card: {
    width: 236,
    minHeight: 76,
    marginTop: 7,
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 11,
    borderWidth: 1,
  },
  cardMine: {
    borderColor: "rgba(38, 103, 156, 0.24)",
    backgroundColor: "rgba(255, 255, 255, 0.48)",
  },
  cardTheirs: {
    borderColor: "rgba(67, 94, 116, 0.18)",
    backgroundColor: "#F1F6F9",
  },
  imageShell: {
    width: 76,
    minHeight: 74,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.68)",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  siteName: {
    marginBottom: 3,
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  title: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
});
