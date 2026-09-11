import { createVideoPlayer, type VideoThumbnail } from "expo-video";

/** A single still frame, not an autoplaying VideoView. Dispose on success/error/unmount. */
export function requestMessengerPinVideoThumbnail(
  uri: string,
  headers: Record<string, string> | undefined,
  onFrame: (frame: VideoThumbnail) => void,
): () => void {
  const player = createVideoPlayer(null);
  let disposed = false;
  let generating = false;
  let subscription: { remove(): void } | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timeout) clearTimeout(timeout);
    subscription?.remove();
    player.release();
  };
  const generate = async () => {
    if (disposed || generating) return;
    generating = true;
    try {
      // SDK 54's iOS bridge crashes casting a scalar JS value to native [Double].
      // Although the TS API allows a number, always pass an explicit array.
      // See expo/expo#43372 and the SDK 55 core fix expo/expo#42694.
      const [frame] = await player.generateThumbnailsAsync([0], {
        maxWidth: 160,
        maxHeight: 160,
      });
      if (!disposed && frame) onFrame(frame);
    } catch {
      // Broken/unsupported/offline media leaves a harmless media-type placeholder.
    } finally {
      dispose();
    }
  };
  try {
    player.muted = true;
    player.staysActiveInBackground = false;
    player.showNowPlayingNotification = false;
    player.audioMixingMode = "mixWithOthers";
    subscription = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") void generate();
      else if (status === "error") dispose();
    });
    timeout = setTimeout(dispose, 15_000);
    void player
      .replaceAsync({ uri, headers })
      .then(() => {
        if (!disposed && player.status === "readyToPlay") void generate();
      })
      .catch(dispose);
  } catch {
    dispose();
  }
  return dispose;
}
