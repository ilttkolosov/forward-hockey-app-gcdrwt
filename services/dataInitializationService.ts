
import { playerDownloadService } from './playerDownloadService';
import { isInitialLoadingNeeded, performInitialDataLoading } from '../data/playerData';

export class DataInitializationService {
  private isInitializing = false;

  async checkAndInitializeData(
    onProgress?: (stage: string, current?: number, total?: number) => void
  ): Promise<boolean> {
    try {
      if (this.isInitializing) {
        console.log('Data initialization already in progress');
        return false;
      }

      const needsLoading = await isInitialLoadingNeeded();
      
      if (!needsLoading) {
        console.log('Data initialization not needed');
        return false;
      }

      console.log('Starting data initialization...');
      this.isInitializing = true;

      try {
        await performInitialDataLoading(onProgress);
        console.log('Data initialization completed successfully');
        return true;
      } catch (error) {
        console.error('Data initialization failed:', error);
        throw error;
      } finally {
        this.isInitializing = false;
      }
    } catch (error) {
      console.error('Error in checkAndInitializeData:', error);
      this.isInitializing = false;
      throw error;
    }
  }

  async isDataLoaded(): Promise<boolean> {
    return await playerDownloadService.isDataLoaded();
  }

  async clearAllData(): Promise<void> {
    try {
      console.log('Clearing all application data...');
      await playerDownloadService.clearAllData();
      console.log('All application data cleared');
    } catch (error) {
      console.error('Error clearing application data:', error);
      throw error;
    }
  }

  async refreshData(
    onProgress?: (stage: string, current?: number, total?: number) => void
  ): Promise<void> {
    try {
      console.log('Refreshing application data...');
      this.isInitializing = true;
      
      try {
        await playerDownloadService.refreshPlayersData(onProgress);
        console.log('Data refresh completed successfully');
      } finally {
        this.isInitializing = false;
      }
    } catch (error) {
      console.error('Error refreshing application data:', error);
      this.isInitializing = false;
      throw error;
    }
  }

  get isInitializingData(): boolean {
    return this.isInitializing;
  }
}

export const dataInitializationService = new DataInitializationService();
