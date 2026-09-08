import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Icon from "../../components/Icon";
import { cacheMessengerMedia } from "../../services/messengerMediaCache";
import { colors } from "../../styles/commonStyles";
import type { PinnedMediaThumbnailProps } from "./PinnedMediaThumbnail";

export default function PinnedMediaThumbnail({
  media,
  accessToken,
  active,
}: PinnedMediaThumbnailProps) {
  const key = `${media.id}:${media.url}:${accessToken}`;
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const [result, setResult] = useState<{ key: string; uri: string } | null>(
    null,
  );
  useEffect(() => {
    if (!active || !accessToken) return;
    let cancelled = false;
    void cacheMessengerMedia(mediaRef.current, accessToken)
      .then((uri) => {
        if (!cancelled) setResult({ key, uri });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, accessToken, key]);
  const uri = result?.key === key ? result.uri : null;
  return (
    <View style={styles.box} pointerEvents="none" accessible={false}>
      <Icon
        name={media.type === "video" ? "videocam-outline" : "image-outline"}
        size={22}
        color={colors.primary}
      />
      {uri &&
        (media.type === "image" ? (
          <Image
            source={uri}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <video
            src={uri}
            muted
            playsInline
            preload="auto"
            controls={false}
            aria-hidden="true"
            tabIndex={-1}
            onLoadedMetadata={(event) => {
              event.currentTarget.currentTime = 0.001;
            }}
            onError={() => setResult(null)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
            }}
          />
        ))}
    </View>
  );
}
const styles = StyleSheet.create({
  box: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: "#EAF2FA",
  },
});
