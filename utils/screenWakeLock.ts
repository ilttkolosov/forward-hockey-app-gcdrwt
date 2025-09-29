
import React from 'react';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';

/**
 * Utility class for managing screen wake lock functionality
 */
export class ScreenWakeLock {
  private static activeKeys = new Set<string>();

  /**
   * Activate screen wake lock with a unique key
   * @param key - Unique identifier for the wake lock
   */
  static activate(key: string): void {
    try {
      console.log(`Activating screen wake lock for: ${key}`);
      activateKeepAwake(key);
      this.activeKeys.add(key);
    } catch (error) {
      console.error(`Error activating screen wake lock for ${key}:`, error);
    }
  }

  /**
   * Deactivate screen wake lock for a specific key
   * @param key - Unique identifier for the wake lock
   */
  static deactivate(key: string): void {
    try {
      console.log(`Deactivating screen wake lock for: ${key}`);
      deactivateKeepAwake(key);
      this.activeKeys.delete(key);
    } catch (error) {
      console.error(`Error deactivating screen wake lock for ${key}:`, error);
    }
  }

  /**
   * Deactivate all active screen wake locks
   */
  static deactivateAll(): void {
    console.log('Deactivating all screen wake locks');
    this.activeKeys.forEach(key => {
      try {
        deactivateKeepAwake(key);
      } catch (error) {
        console.error(`Error deactivating screen wake lock for ${key}:`, error);
      }
    });
    this.activeKeys.clear();
  }

  /**
   * Get all active wake lock keys
   */
  static getActiveKeys(): string[] {
    return Array.from(this.activeKeys);
  }

  /**
   * Check if a specific wake lock is active
   * @param key - Unique identifier for the wake lock
   */
  static isActive(key: string): boolean {
    return this.activeKeys.has(key);
  }
}

/**
 * Hook for managing video playback wake lock
 * @param isPlaying - Whether video is currently playing
 * @param key - Unique identifier for the wake lock (default: 'video-playback')
 */
export const useVideoWakeLock = (isPlaying: boolean, key: string = 'video-playback') => {
  React.useEffect(() => {
    if (isPlaying) {
      ScreenWakeLock.activate(key);
    } else {
      ScreenWakeLock.deactivate(key);
    }

    // Cleanup function
    return () => {
      ScreenWakeLock.deactivate(key);
    };
  }, [isPlaying, key]);
};
