// hooks/useWhistleSound.ts
import { useCallback } from 'react';
import { Audio } from 'expo-av';

let soundObject: Audio.Sound | null = null;

export const useWhistleSound = () => {
  const playWhistle = useCallback(async () => {
    try {
      // Освобождаем предыдущий звук (на случай, если он ещё играет)
      if (soundObject) {
        await soundObject.unloadAsync();
      }

      // Загружаем звук
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/whistle.mp3') // ← путь к вашему файлу
      );
      soundObject = sound;

      // Воспроизводим
      await sound.playAsync();
    } catch (e) {
      console.warn('Не удалось воспроизвести звук свистка:', e);
    }
  }, []);

  return { playWhistle };
};