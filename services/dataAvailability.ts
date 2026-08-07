export interface DataAvailabilitySnapshot {
  usingCachedData: boolean;
  lastSuccessfulSync: number | null;
  lastError: string | null;
}

type Listener = (snapshot: DataAvailabilitySnapshot) => void;

let snapshot: DataAvailabilitySnapshot = {
  usingCachedData: false,
  lastSuccessfulSync: null,
  lastError: null,
};
const listeners = new Set<Listener>();

const emit = () => listeners.forEach(listener => listener(snapshot));

export const dataAvailability = {
  getSnapshot: () => snapshot,
  subscribe(listener: Listener) {
    listeners.add(listener);
    listener(snapshot);
    return () => listeners.delete(listener);
  },
  markCachedDataUsed(message = 'Используются сохранённые данные') {
    snapshot = { ...snapshot, usingCachedData: true, lastError: message };
    emit();
  },
  markNetworkSuccess() {
    snapshot = {
      usingCachedData: false,
      lastSuccessfulSync: Date.now(),
      lastError: null,
    };
    emit();
  },
};
