import { Image, type ImageProps } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Icon from "../../components/Icon";
import { messengerMediaUrl } from "../../services/messengerApi";
import { getCachedMessengerMediaUri } from "../../services/messengerMediaCache";
import { requestMessengerPinVideoThumbnail } from "../../services/messengerPinVideoThumbnail";
import { colors } from "../../styles/commonStyles";
import type { MessengerMedia } from "./types";

export interface PinnedMediaThumbnailProps { media: MessengerMedia; accessToken: string; active: boolean }
export default function PinnedMediaThumbnail({ media, accessToken, active }: PinnedMediaThumbnailProps) {
  const key = `${media.id}:${media.url}:${accessToken}`;
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const [result, setResult] = useState<{ key: string; source: ImageProps["source"] } | null>(null);
  useEffect(() => {
    if (!active || !accessToken) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void (async () => {
      const currentMedia = mediaRef.current;
      const cached = await getCachedMessengerMediaUri(currentMedia);
      const uri = cached || messengerMediaUrl(currentMedia.url);
      if (cancelled || !uri) return;
      const headers = cached ? undefined : { Authorization: `Bearer ${accessToken}` };
      if (currentMedia.type === "image") setResult({ key, source: { uri, headers } });
      else dispose = requestMessengerPinVideoThumbnail(uri, headers, (frame) => {
        if (!cancelled) setResult({ key, source: frame });
      });
    })().catch(() => undefined);
    return () => { cancelled = true; dispose?.(); };
  }, [active, accessToken, key]);
  const source = result?.key === key ? result.source : null;
  return (
    <View style={styles.box} pointerEvents="none" accessible={false}>
      <Icon name={media.type === "video" ? "videocam-outline" : "image-outline"} size={22} color={colors.primary} />
      {source && <Image source={source} recyclingKey={media.id} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setResult(null)} />}
      {media.type === "video" && source && <View style={styles.play}><Icon name="play" size={10} color="#fff" /></View>}
    </View>
  );
}
const styles = StyleSheet.create({
  box: { width: 48, height: 48, borderRadius: 6, overflow: "hidden", alignItems: "center", justifyContent: "center", marginRight: 10, backgroundColor: "#EAF2FA" },
  play: { position: "absolute", right: 2, bottom: 2, borderRadius: 8, padding: 2, backgroundColor: "#244365" },
});
