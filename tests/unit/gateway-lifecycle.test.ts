import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEmitter, mockListeners, mockNativeBridge } = vi.hoisted(() => {
  const mockListeners = new Map<string, Function[]>();
  const mockEmitter = {
    addListener: (event: string, cb: Function) => {
      if (!mockListeners.has(event)) mockListeners.set(event, []);
      mockListeners.get(event)!.push(cb);
      return {
        remove: () => {
          const list = mockListeners.get(event);
          if (list) {
            const idx = list.indexOf(cb);
            if (idx >= 0) list.splice(idx, 1);
          }
        }
      };
    },
    emit: (event: string, data: any) => {
      if (event === 'onGatewayStatusChanged' && data?.status) {
        currentSimulatedStatus = data.status;
      }
      const list = mockListeners.get(event) || [];
      for (const cb of [...list]) cb(data);
    }
  };

  let currentSimulatedStatus = 'READY';
  const mockNativeBridge = {
    initialize: vi.fn().mockImplementation(async () => ({
      status: currentSimulatedStatus,
      isBluetoothEnabled: currentSimulatedStatus !== 'BLUETOOTH_DISABLED',
      isInitialized: true
    })),
    getGatewayStatus: vi.fn().mockImplementation(async () => ({
      status: currentSimulatedStatus,
      isBluetoothEnabled: currentSimulatedStatus !== 'BLUETOOTH_DISABLED',
      isInitialized: true
    })),
    startDiscovery: vi.fn().mockResolvedValue(true),
    stopDiscovery: vi.fn().mockResolvedValue(true),
    resetStatus: () => {
      currentSimulatedStatus = 'READY';
    }
  };

  return { mockEmitter, mockListeners, mockNativeBridge };
});

vi.mock('react-native', () => ({
  NativeModules: {
    NativeMeshBridge: mockNativeBridge
  },
  DeviceEventEmitter: mockEmitter,
  Platform: { OS: 'android', Version: 33 },
  PermissionsAndroid: {
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
      ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
      BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
      BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
      BLUETOOTH_ADVERTISE: 'android.permission.BLUETOOTH_ADVERTISE',
      POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS'
    },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
      NEVER_ASK_AGAIN: 'never_ask_again'
    },
    requestMultiple: vi.fn().mockResolvedValue({})
  }
}));

import { NativeBleMeshAdapter } from '../../src/mesh/adapters/NativeBleMeshAdapter';
import { CompositeMeshAdapter } from '../../src/mesh/adapters/CompositeMeshAdapter';
import { GatewayStatus, GatewayStatusEvent } from '../../src/mesh/adapters/MeshTransportAdapter';

describe('Phase 1 & 1.1: Gateway Initialization, Permissions, and Lifecycle Recovery', () => {
  beforeEach(() => {
    mockListeners.clear();
    mockNativeBridge.resetStatus();
    vi.clearAllMocks();
  });

  it('initializes to READY when native bridge is not available (test fallback)', async () => {
    const adapter = new NativeBleMeshAdapter('TEST_NODE');
    await adapter.initialize();
    const status = await adapter.getStatus();
    expect(status).toBe('READY');
  });

  it('handles repeated (idempotent) initialization without errors', async () => {
    const adapter = new NativeBleMeshAdapter('TEST_NODE');
    await adapter.initialize();
    await adapter.initialize();
    await adapter.initialize();
    const status = await adapter.getStatus();
    expect(status).toBe('READY');
  });

  it('receives status events and updates status cache', () => {
    const adapter = new NativeBleMeshAdapter('TEST_NODE');
    const receivedEvents: GatewayStatusEvent[] = [];

    const unsubscribe = adapter.onStatusChanged((event) => {
      receivedEvents.push(event);
    });

    // Simulate native bridge emitting status transition to BLUETOOTH_DISABLED
    mockEmitter.emit('onGatewayStatusChanged', {
      status: 'BLUETOOTH_DISABLED' as GatewayStatus,
      previousStatus: 'READY' as GatewayStatus,
      reason: 'User turned off bluetooth in Android settings',
      isBluetoothEnabled: false,
      timestamp: Date.now()
    });

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0]!.status).toBe('BLUETOOTH_DISABLED');
    expect(receivedEvents[0]!.isBluetoothEnabled).toBe(false);

    // Simulate Bluetooth turned back on -> transition to READY
    mockEmitter.emit('onGatewayStatusChanged', {
      status: 'READY' as GatewayStatus,
      previousStatus: 'BLUETOOTH_DISABLED' as GatewayStatus,
      reason: 'User turned on bluetooth',
      isBluetoothEnabled: true,
      timestamp: Date.now()
    });

    expect(receivedEvents.length).toBe(2);
    expect(receivedEvents[1]!.status).toBe('READY');
    expect(receivedEvents[1]!.isBluetoothEnabled).toBe(true);

    unsubscribe();
  });

  it('forwards status events through CompositeMeshAdapter', async () => {
    const composite = new CompositeMeshAdapter('TEST_NODE');
    const receivedEvents: GatewayStatusEvent[] = [];

    const unsubscribe = composite.onStatusChanged!((event) => {
      receivedEvents.push(event);
    });

    mockEmitter.emit('onGatewayStatusChanged', {
      status: 'PERMISSION_REQUIRED' as GatewayStatus,
      previousStatus: 'INITIALIZING' as GatewayStatus,
      reason: 'BLUETOOTH_SCAN not granted',
      timestamp: Date.now()
    });

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0]!.status).toBe('PERMISSION_REQUIRED');

    unsubscribe();
  });

  it('handles repeated READY events idempotently', async () => {
    const adapter = new NativeBleMeshAdapter('TEST_NODE');
    let readyCount = 0;

    const unsubscribe = adapter.onStatusChanged((event) => {
      if (event.status === 'READY') {
        readyCount++;
      }
    });

    for (let i = 0; i < 5; i++) {
      mockEmitter.emit('onGatewayStatusChanged', {
        status: 'READY' as GatewayStatus,
        previousStatus: 'READY' as GatewayStatus,
        reason: 'Host resumed or repeated ready notification',
        isBluetoothEnabled: true,
        timestamp: Date.now()
      });
    }

    expect(readyCount).toBe(5);
    const status = await adapter.getStatus();
    expect(status).toBe('READY');
    unsubscribe();
  });

  it('prevents duplicate discovery start calls at the adapter level', async () => {
    const adapter = new NativeBleMeshAdapter('TEST_NODE');

    // First start
    await adapter.startDiscovery();
    expect(mockNativeBridge.startDiscovery).toHaveBeenCalledTimes(1);

    // Second redundant start call while already active
    await adapter.startDiscovery();
    expect(mockNativeBridge.startDiscovery).toHaveBeenCalledTimes(1);

    // Stop and re-start
    await adapter.stopDiscovery();
    expect(mockNativeBridge.stopDiscovery).toHaveBeenCalledTimes(1);

    await adapter.startDiscovery();
    expect(mockNativeBridge.startDiscovery).toHaveBeenCalledTimes(2);
  });

  it('recovers cleanly across Bluetooth OFF -> ON transitions without duplicate discovery', async () => {
    const adapter = new NativeBleMeshAdapter('TEST_NODE');

    await adapter.startDiscovery();
    expect(mockNativeBridge.startDiscovery).toHaveBeenCalledTimes(1);

    // Bluetooth is toggled OFF
    mockEmitter.emit('onGatewayStatusChanged', {
      status: 'BLUETOOTH_DISABLED' as GatewayStatus,
      previousStatus: 'READY' as GatewayStatus,
      reason: 'Bluetooth turned off',
      isBluetoothEnabled: false,
      timestamp: Date.now()
    });

    const statusAfterOff = await adapter.getStatus();
    expect(statusAfterOff).toBe('BLUETOOTH_DISABLED');

    // Bluetooth is toggled ON
    mockEmitter.emit('onGatewayStatusChanged', {
      status: 'READY' as GatewayStatus,
      previousStatus: 'BLUETOOTH_DISABLED' as GatewayStatus,
      reason: 'Bluetooth turned on',
      isBluetoothEnabled: true,
      timestamp: Date.now()
    });

    const statusAfterOn = await adapter.getStatus();
    expect(statusAfterOn).toBe('READY');

    // After recovery, starting discovery again succeeds without deadlock
    await adapter.startDiscovery();
    expect(mockNativeBridge.startDiscovery).toHaveBeenCalledTimes(2);
  });

  it('handles permission revocation and re-grant while app is backgrounded', async () => {
    const adapter = new NativeBleMeshAdapter('TEST_NODE');

    await adapter.startDiscovery();

    // Permission revoked while backgrounded (e.g. user toggled in system settings)
    mockEmitter.emit('onGatewayStatusChanged', {
      status: 'PERMISSION_DENIED' as GatewayStatus,
      previousStatus: 'READY' as GatewayStatus,
      reason: 'BLUETOOTH_CONNECT revoked by user',
      isBluetoothEnabled: true,
      timestamp: Date.now()
    });

    expect(await adapter.getStatus()).toBe('PERMISSION_DENIED');

    // User navigates back to system settings and re-grants permission
    mockEmitter.emit('onGatewayStatusChanged', {
      status: 'READY' as GatewayStatus,
      previousStatus: 'PERMISSION_DENIED' as GatewayStatus,
      reason: 'Permissions re-granted on host resume',
      isBluetoothEnabled: true,
      timestamp: Date.now()
    });

    expect(await adapter.getStatus()).toBe('READY');

    // Can start discovery cleanly
    await adapter.startDiscovery();
    expect(mockNativeBridge.startDiscovery).toHaveBeenCalledTimes(2);
  });

  it('cleans up status listener on unsubscribe', () => {
    const adapter = new NativeBleMeshAdapter('TEST_NODE');
    let callCount = 0;

    const unsubscribe = adapter.onStatusChanged(() => {
      callCount++;
    });

    mockEmitter.emit('onGatewayStatusChanged', {
      status: 'READY' as GatewayStatus,
      timestamp: Date.now()
    });
    expect(callCount).toBe(1);

    unsubscribe();

    mockEmitter.emit('onGatewayStatusChanged', {
      status: 'BLUETOOTH_DISABLED' as GatewayStatus,
      timestamp: Date.now()
    });
    expect(callCount).toBe(1); // not incremented after unsubscribe
  });
});
