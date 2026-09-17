import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "messenger.connection.diagnostics.v1";
let pending: Promise<void> = Promise.resolve();

// Only connection state/timings; never credentials, message bodies or user IDs.
export function recordConnectionDiagnostic(event: string, context: object): void {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...context });
  pending = pending.then(async () => {
    const previous = await AsyncStorage.getItem(KEY);
    const lines = previous ? previous.split("\n") : [];
    lines.push(line);
    await AsyncStorage.setItem(KEY, lines.slice(-200).join("\n"));
  }).catch(() => undefined);
}

export async function readConnectionDiagnostics(): Promise<string> {
  // Reading the last persisted snapshot must not wait on a blocked write queue.
  return (await AsyncStorage.getItem(KEY)) || "Диагностика соединения пока пуста";
}
