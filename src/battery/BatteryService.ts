import { NativeModules } from 'react-native';

export interface BatteryService {
  getBatteryLevel(): Promise<number>;
}

export class NativeBatteryService implements BatteryService {
  async getBatteryLevel(): Promise<number> {
    const { BatteryModule } = NativeModules;
    if (BatteryModule && typeof BatteryModule.getBatteryLevel === 'function') {
      try {
        const level = await BatteryModule.getBatteryLevel();
        if (typeof level === 'number' && level >= 0 && level <= 100) {
          return level;
        }
      } catch {
        return 100;
      }
    }
    return 100;
  }
}
