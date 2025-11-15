// hooks/useTrackScreenView.ts
import { useEffect } from 'react';
import { trackScreenView } from '../services/analyticsService';

export const useTrackScreenView = (screenName: string, params: Record<string, any> = {}) => {
  useEffect(() => {
    // Отправляем событие, если аналитика готова
    // Если нет — просто ничего не делаем (но хук вызван!)
    trackScreenView(screenName, params);
  }, [screenName]);
};