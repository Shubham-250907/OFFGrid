import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { MESH_CONFIG } from '../../src/shared/constants/config';

describe('Phase 6 Hardening: Battery Conservation & Background Execution', () => {
  it('enforces calibrated BLE duty-cycle intervals across battery levels', () => {
    // Normal operation (battery > 20%)
    expect(MESH_CONFIG.NORMAL_SCAN_MS).toBe(3000);
    expect(MESH_CONFIG.NORMAL_PAUSE_MS).toBe(7000);
    const normalDutyCycle =
      MESH_CONFIG.NORMAL_SCAN_MS / (MESH_CONFIG.NORMAL_SCAN_MS + MESH_CONFIG.NORMAL_PAUSE_MS);
    expect(normalDutyCycle).toBeCloseTo(0.3, 2); // 30% duty cycle

    // Battery saver operation (battery <= 20% or low-power state)
    expect(MESH_CONFIG.BATTERY_SAVER_SCAN_MS).toBe(2000);
    expect(MESH_CONFIG.BATTERY_SAVER_PAUSE_MS).toBe(18000);
    const saverDutyCycle =
      MESH_CONFIG.BATTERY_SAVER_SCAN_MS /
      (MESH_CONFIG.BATTERY_SAVER_SCAN_MS + MESH_CONFIG.BATTERY_SAVER_PAUSE_MS);
    expect(saverDutyCycle).toBeCloseTo(0.1, 2); // 10% duty cycle

    // Active scan burst mode for urgent emergency dispatch
    expect(MESH_CONFIG.ACTIVE_SCAN_MS).toBe(5000);
  });

  it('declares Android foreground service with connectedDevice type and required permissions', () => {
    const manifestPath = path.resolve(__dirname, '../../android/app/src/main/AndroidManifest.xml');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');

    // Foreground service permissions
    expect(manifestContent).toContain('android.permission.FOREGROUND_SERVICE');
    expect(manifestContent).toContain('android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE');
    expect(manifestContent).toContain('android.permission.POST_NOTIFICATIONS');

    // Service component declaration with connectedDevice type
    expect(manifestContent).toContain('android:name=".mesh.MeshForegroundService"');
    expect(manifestContent).toContain('android:foregroundServiceType="connectedDevice"');
  });

  it('validates Android NativeMeshBridge foreground service control points', () => {
    const bridgePath = path.resolve(
      __dirname,
      '../../android/app/src/main/java/com/offgrid/mesh/NativeMeshBridge.kt'
    );
    const bridgeContent = fs.readFileSync(bridgePath, 'utf-8');

    expect(bridgeContent).toContain('fun startForegroundService');
    expect(bridgeContent).toContain('fun stopForegroundService');
    expect(bridgeContent).toContain('MeshForegroundService.startService');
    expect(bridgeContent).toContain('MeshForegroundService.stopService');
  });
});
