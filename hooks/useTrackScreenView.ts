// hooks/useTrackScreenView.ts
import { useEffect, useRef } from 'react';
import { trackScreenView } from '../services/analyticsService';

export const useTrackScreenView = (screenName: string, params: Record<string, any> = {}) => {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    // Отправляем событие, если аналитика готова
    // Если нет — просто ничего не делаем (но хук вызван!)
    trackScreenView(screenName, paramsRef.current);
  }, [screenName, paramsKey]);
};
