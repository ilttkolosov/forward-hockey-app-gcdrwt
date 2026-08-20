import { Audio } from "expo-av";

type MessengerSoundKind = "sent" | "received";

const SOURCES = {
  sent: require("../assets/messenger/sounds/message-sent.wav"),
  received: require("../assets/messenger/sounds/message-received.wav"),
} as const;

const sounds: Partial<Record<MessengerSoundKind, Audio.Sound>> = {};
const loading: Partial<Record<MessengerSoundKind, Promise<Audio.Sound>>> = {};
const mutedRooms = new Map<string, number | null>();

async function soundFor(kind: MessengerSoundKind): Promise<Audio.Sound> {
  const existing = sounds[kind];
  if (existing) return existing;
  const pending = loading[kind];
  if (pending) return pending;
  const promise = Audio.Sound.createAsync(SOURCES[kind], {
    shouldPlay: false,
    volume: 1,
  }).then(({ sound }) => {
    sounds[kind] = sound;
    delete loading[kind];
    return sound;
  });
  loading[kind] = promise;
  return promise;
}

export function setMessengerMutedRooms(
  rooms: readonly {
    id: string;
    notifications_muted: boolean;
    muted_until: string | null;
  }[],
): void {
  mutedRooms.clear();
  rooms.forEach((room) => {
    if (!room.notifications_muted) return;
    if (!room.muted_until) {
      mutedRooms.set(room.id, null);
      return;
    }
    const expiresAt = new Date(room.muted_until).getTime();
    if (Number.isFinite(expiresAt)) mutedRooms.set(room.id, expiresAt);
  });
}

export function messengerRoomIsMuted(roomId: string): boolean {
  const expiresAt = mutedRooms.get(roomId);
  if (expiresAt === undefined) return false;
  if (expiresAt === null || expiresAt > Date.now()) return true;
  mutedRooms.delete(roomId);
  return false;
}

export async function playMessengerSound(
  kind: MessengerSoundKind,
  roomId: string,
): Promise<void> {
  if (kind === "received" && messengerRoomIsMuted(roomId)) return;
  try {
    const sound = await soundFor(kind);
    await sound.replayAsync();
  } catch (error) {
    console.warn(`[Messenger] Не удалось воспроизвести звук ${kind}:`, error);
  }
}

export async function unloadMessengerSounds(): Promise<void> {
  const loaded = Object.values(sounds).filter(
    (sound): sound is Audio.Sound => Boolean(sound),
  );
  Object.keys(sounds).forEach((key) => delete sounds[key as MessengerSoundKind]);
  await Promise.allSettled(loaded.map((sound) => sound.unloadAsync()));
}
