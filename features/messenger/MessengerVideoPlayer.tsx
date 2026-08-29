import { useEventListener } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
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
  requestHeaders?: Record<string, string>;
  active: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  nativeControls?: boolean;
  initialPositionSeconds?: number;
  previewOnly?: boolean;
  onPositionChange?: (positionSeconds: number) => void;
  style?: StyleProp<ViewStyle>;
  onFallback: () => void;
}

export default function MessengerVideoPlayer({
  uri,
  requestHeaders,
  active,
  autoPlay = false,
  muted = false,
  loop = false,
  nativeControls = true,
  initialPositionSeconds = 0,
  previewOnly = false,
  onPositionChange,
  style,
  onFallback,
}: MessengerVideoPlayerProps) {
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const onPositionChangeRef = useRef(onPositionChange);
  const player = useVideoPlayer(
    requestHeaders ? { uri, headers: requestHeaders } : uri,
    (instance) => {
      instance.loop = loop;
      instance.muted = muted;
      instance.staysActiveInBackground = false;
      instance.keepScreenOnWhilePlaying = !muted;
      instance.timeUpdateEventInterval = onPositionChange ? 0.5 : 0;
      if (initialPositionSeconds > 0) {
        instance.currentTime = initialPositionSeconds;
      }
      if ((autoPlay || previewOnly) && active) instance.play();
    },
  );

  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);

  useEffect(() => {
    setFirstFrameReady(false);
    setPlaybackError(null);
  }, [uri]);

  useEffect(() => {
    player.loop = loop;
    player.muted = muted;
    player.keepScreenOnWhilePlaying = !muted;
  }, [loop, muted, player]);

  useEffect(() => {
    if (!active) {
      player.pause();
      return;
    }
    if (autoPlay || (previewOnly && !firstFrameReady)) player.play();
  }, [active, autoPlay, firstFrameReady, player, previewOnly]);

  useEventListener(player, "statusChange", ({ status, error }) => {
    if (status === "error") {
      setPlaybackError(error?.message || "Формат видео не поддерживается");
      return;
    }
    if (status === "readyToPlay") {
      setPlaybackError(null);
      if ((autoPlay || previewOnly) && active) player.play();
    }
  });

  useEventListener(player, "playToEnd", () => {
    if (!loop) onPositionChangeRef.current?.(0);
  });

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    onPositionChangeRef.current?.(currentTime);
  });

  return (
    <View style={[styles.container, style]}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={nativeControls && !playbackError}
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        allowsVideoFrameAnalysis={false}
        surfaceType="textureView"
        onFirstFrameRender={() => {
          setFirstFrameReady(true);
          if (previewOnly) player.pause();
        }}
      />
      {!firstFrameReady && !playbackError && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={colors.white} />
        </View>
      )}
      {playbackError && !previewOnly && (
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
