import { LocationResult } from '../shared/types';
import { NativeModules } from 'react-native';

export interface LocationService {
  getCurrentLocation(): Promise<LocationResult>;
}

export class NativeLocationService implements LocationService {
  async getCurrentLocation(): Promise<LocationResult> {
    const { LocationModule } = NativeModules;
    if (LocationModule && typeof LocationModule.getCurrentLocation === 'function') {
      return LocationModule.getCurrentLocation();
    }
    return {
      latitude: null,
      longitude: null,
      accuracyM: null,
      timestamp: null,
      isMock: false,
      provider: 'none',
      status: 'UNAVAILABLE'
    };
  }
}
