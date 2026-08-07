import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { dataAvailability, DataAvailabilitySnapshot } from '../services/dataAvailability';

interface NetworkStatusValue extends DataAvailabilitySnapshot {
  isOffline: boolean;
}

const NetworkStatusContext = createContext<NetworkStatusValue>({
  isOffline: false,
  ...dataAvailability.getSnapshot(),
});

export function NetworkStatusProvider({ children }: React.PropsWithChildren) {
  const [isOffline, setIsOffline] = useState(false);
  const [availability, setAvailability] = useState(dataAvailability.getSnapshot());

  useEffect(() => {
    const unsubscribeNetwork = NetInfo.addEventListener(state => {
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    const unsubscribeAvailability = dataAvailability.subscribe(setAvailability);
    return () => {
      unsubscribeNetwork();
      unsubscribeAvailability();
    };
  }, []);

  const value = useMemo(() => ({ isOffline, ...availability }), [availability, isOffline]);
  return <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>;
}

export const useNetworkStatus = () => useContext(NetworkStatusContext);
