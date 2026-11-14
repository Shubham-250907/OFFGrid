import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEmitter, mockListeners } = vi.hoisted(() => {
  const mockListeners = new Map<string, Function[]>();
  const mockEmitter = {
    addListener: (event: string, cb: Function) => {
      if (!mockListeners.has(event)) mockListeners.set(event, []);
      mockListeners.get(event)!.push(cb);
      return { remove: () => {} };
    },
    emit: (event: string, data: any) => {
      const list = mockListeners.get(event) || [];
      for (const cb of list) cb(data);
    }
  };
  return { mockEmitter, mockListeners };
});

vi.mock('react-native', () => ({
  NativeModules: {
    NativeMeshBridge: {
      initialize: vi.fn().mockResolvedValue({ status: 'READY', isBluetoothEnabled: true, isInitialized: true }),
      getGatewayStatus: vi.fn().mockResolvedValue({ status: 'READY', isBluetoothEnabled: true, isInitialized: true })
    }
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

describe('Phase 1: Gateway Initialization and Lifecycle Recovery', () => {
  beforeEach(() => {
    mockListeners.clear();
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
});
