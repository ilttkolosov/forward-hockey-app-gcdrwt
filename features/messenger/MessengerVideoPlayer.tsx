import { useEventListener } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Icon from "../../components/Icon";
import { colors } from "../../styles/commonStyles";

interface MessengerVideoPlayerProps {
  uri: string;
  active: boolean;
  autoPlay?: boolean;
  style?: StyleProp<ViewStyle>;
  onFallback: () => void;
}

export default function MessengerVideoPlayer({
  uri,
  active,
  autoPlay = false,
  style,
  onFallback,
}: MessengerVideoPlayerProps) {
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.staysActiveInBackground = false;
    if (autoPlay && active) instance.play();
  });

  useEffect(() => {
    if (!active) {
      player.pause();
      return;
    }
    if (autoPlay && player.status === "readyToPlay") player.play();
  }, [active, autoPlay, player]);

  useEventListener(player, "statusChange", ({ status, error }) => {
    if (status === "error") {
      setPlaybackError(error?.message || "Формат видео не поддерживается");
      return;
    }
    if (status === "readyToPlay") setPlaybackError(null);
  });

  return (
    <View style={[styles.container, style]}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={!playbackError}
        contentFit="contain"
        fullscreenOptions={{ enable: true, orientation: "default" }}
        allowsPictureInPicture={false}
        allowsVideoFrameAnalysis={false}
        surfaceType="surfaceView"
        onFirstFrameRender={() => setFirstFrameReady(true)}
      />
      {!firstFrameReady && !playbackError && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={colors.white} />
        </View>
      )}
      {playbackError && (
        <TouchableOpacity
          style={styles.error}
          activeOpacity={0.84}
          onPress={onFallback}
          accessibilityRole="button"
          accessibilityLabel="Открыть видео системным проигрывателем"
        >
          <Icon name="open-outline" size={27} color={colors.white} />
          <Text style={styles.errorTitle}>
            Открыть системным проигрывателем
          </Text>
          <Text style={styles.errorDetail} numberOfLines={2}>
            {playbackError}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#08121E",
  },
  video: { width: "100%", height: "100%" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 18, 30, 0.34)",
  },
  error: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 18,
    backgroundColor: "rgba(8, 18, 30, 0.9)",
  },
  errorTitle: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  errorDetail: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 9,
    lineHeight: 12,
    textAlign: "center",
  },
});
