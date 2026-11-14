import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DatabaseConnection } from '../../data/database/connection';
import { NodeSqliteDriver } from '../../data/database/nodeSqliteDriver';
import { QuickSqliteDriver } from '../../data/database/quickSqliteDriver';
import { OffgridSqliteDriver } from '../../data/database/offgridSqliteDriver';
import { InMemorySqliteDriver } from '../../data/database/inMemorySqliteDriver';
import { runMigrations } from '../../data/database/migrations/migrationRunner';
import { CryptoProvider, DeviceIdentity } from '../../security/identity/DeviceIdentity';
import { Ed25519CryptoProvider } from '../../security/identity/Ed25519CryptoProvider';
import { LocationService, NativeLocationService } from '../../location/LocationService';
import { BatteryService, NativeBatteryService } from '../../battery/BatteryService';
import { MeshTransportAdapter } from '../../mesh/adapters/MeshTransportAdapter';
import { NativeBleMeshAdapter } from '../../mesh/adapters/NativeBleMeshAdapter';
import { DeltaSyncService } from '../../mesh/sync/DeltaSyncService';
import { MeshReceiverService } from '../../application/services/MeshReceiverService';
import { SosService } from '../../application/services/SosService';
import { IncidentService } from '../../application/services/IncidentService';
import { VoteService } from '../../application/services/VoteService';
import { TriageService } from '../../application/services/TriageService';
import { ShelterService } from '../../application/services/ShelterService';
import { ChatService } from '../../application/services/ChatService';
import { OfflineMapService, LocalOfflineMapService } from '../../maps/OfflineMapService';
import { LocationResult } from '../../shared/types';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

export interface AppServices {
  db: DatabaseConnection;
  crypto: CryptoProvider;
  identity: DeviceIdentity;
  locationService: LocationService;
  batteryService: BatteryService;
  transport: MeshTransportAdapter;
  deltaSyncService: DeltaSyncService;
  meshReceiver: MeshReceiverService;
  sosService: SosService;
  incidentService: IncidentService;
  voteService: VoteService;
  triageService: TriageService;
  shelterService: ShelterService;
  chatService: ChatService;
  mapService: OfflineMapService;
}

export interface AppContextValue {
  isInitialized: boolean;
  services: AppServices | null;
  identity: DeviceIdentity | null;
  currentLocation: LocationResult | null;
  batteryLevel: number;
  refreshLocation: () => Promise<LocationResult>;
  refreshBattery: () => Promise<number>;
  peerCount: number;
  meshState: string;
  refreshCounter: number;
  triggerRefresh: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export interface AppContextProviderProps {
  children: React.ReactNode;
  initialServices?: AppServices;
}

export const AppContextProvider: React.FC<AppContextProviderProps> = ({
  children,
  initialServices
}) => {
  const [services, setServices] = useState<AppServices | null>(initialServices ?? null);
  const [identity, setIdentity] = useState<DeviceIdentity | null>(initialServices?.identity ?? null);
  const [isInitialized, setIsInitialized] = useState<boolean>(!!initialServices);
  const [currentLocation, setCurrentLocation] = useState<LocationResult | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(100);
  const [peerCount, setPeerCount] = useState<number>(0);
  const [meshState, setMeshState] = useState<string>('SEARCHING');
  const [refreshCounter, setRefreshCounter] = useState<number>(0);

  const triggerRefresh = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  const refreshLocation = useCallback(async (): Promise<LocationResult> => {
    if (services?.locationService) {
      const loc = await services.locationService.getCurrentLocation();
      setCurrentLocation(loc);
      return loc;
    }
    const fallback: LocationResult = {
      latitude: null,
      longitude: null,
      accuracyM: null,
      timestamp: null,
      isMock: false,
      provider: 'none',
      status: 'UNAVAILABLE'
    };
    setCurrentLocation(fallback);
    return fallback;
  }, [services]);

  const refreshBattery = useCallback(async (): Promise<number> => {
    if (services?.batteryService) {
      const b = await services.batteryService.getBatteryLevel();
      const level = b >= 0 ? b : 100;
      setBatteryLevel(level);
      return level;
    }
    return 100;
  }, [services]);

  useEffect(() => {
    if (initialServices) {
      setServices(initialServices);
      setIdentity(initialServices.identity);
      setIsInitialized(true);
      return;
    }

    let active = true;

    async function init() {
      try {
        // Request runtime permissions on Android for GPS and Bluetooth mesh
        if (Platform.OS === 'android') {
          try {
            const permissionsToRequest: any[] = [
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
              PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
            ];
            if (Number(Platform.Version) >= 31) {
              permissionsToRequest.push(
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
              );
            }
            if (Number(Platform.Version) >= 33) {
              permissionsToRequest.push(
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
              );
            }
            await PermissionsAndroid.requestMultiple(permissionsToRequest);
          } catch (permErr) {
            console.warn('Could not request Android permissions', permErr);
          }
        }

        // Initialize SQLite driver (OffgridSqlite on native Android, NodeSqlite in test/Node, InMemorySqlite fallback)
        let db: DatabaseConnection;
        try {
          if (NativeModules.OffgridSqlite) {
            db = new OffgridSqliteDriver();
          } else if (NativeModules.QuickSqlite) {
            db = new QuickSqliteDriver('offgrid.db');
          } else {
            try {
              db = new NodeSqliteDriver(':memory:');
            } catch {
              db = new InMemorySqliteDriver();
            }
          }
        } catch {
          db = new InMemorySqliteDriver();
        }

        try {
          await runMigrations(db);
        } catch (migErr) {
          console.warn('Migration run notice:', migErr);
        }

        const crypto = new Ed25519CryptoProvider();
        let id: DeviceIdentity;
        try {
          id = await crypto.createOrLoadIdentity();
        } catch {
          id = {
            publicKey: 'OFFGRID_LOCAL_NODE',
            keyAlgorithm: 'ED25519',
            keyId: 'offgrid_local'
          };
        }

        const locationService = new NativeLocationService();
        const batteryService = new NativeBatteryService();
        const transport = new NativeBleMeshAdapter(id.keyId);
        const deltaSyncService = new DeltaSyncService(db, crypto);
        const meshReceiver = new MeshReceiverService(transport, deltaSyncService);

        try {
          meshReceiver.start();
        } catch (meshErr) {
          console.warn('Mesh receiver startup notice:', meshErr);
        }

        // Non-blocking initialization of Bluetooth mesh advertising & scanning
        try {
          transport
            .initialize()
            .then(() => {
              transport.startDiscovery().catch(() => {});
            })
            .catch((bleErr) => {
              console.warn('BLE mesh transport notice:', bleErr);
            });
        } catch {}

        const sosService = new SosService(db, crypto, transport, batteryService);
        const incidentService = new IncidentService(db, crypto, transport);
        const voteService = new VoteService(db, crypto, transport);
        const triageService = new TriageService(db, crypto, transport);
        const shelterService = new ShelterService(db, crypto, transport);
        const chatService = new ChatService(db, crypto, transport);
        const mapService = new LocalOfflineMapService();
        try {
          await mapService.initialize();
        } catch {}

        // Listen to peer discoveries
        transport.onPeerDiscovered(() => {
          if (active) {
            setPeerCount((prev) => prev + 1);
            setMeshState('CONNECTED');
          }
        });

        transport.onPeerDisconnected(() => {
          if (active) {
            setPeerCount((prev) => Math.max(0, prev - 1));
          }
        });

        // Trigger screen re-renders when emergency packets arrive
        meshReceiver.onEventReceived(() => {
          if (active) {
            triggerRefresh();
          }
        });

        const appServices: AppServices = {
          db,
          crypto,
          identity: id,
          locationService,
          batteryService,
          transport,
          deltaSyncService,
          meshReceiver,
          sosService,
          incidentService,
          voteService,
          triageService,
          shelterService,
          chatService,
          mapService
        };

        if (active) {
          setServices(appServices);
          setIdentity(id);
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('Failed to initialize OFFGRID app context', err);
      }
    }

    init();

    return () => {
      active = false;
    };
  }, [initialServices, triggerRefresh]);

  // Initial fetch of location and battery
  useEffect(() => {
    if (isInitialized && services) {
      refreshLocation().catch(() => {});
      refreshBattery().catch(() => {});
    }
  }, [isInitialized, services, refreshLocation, refreshBattery]);

  return (
    <AppContext.Provider
      value={{
        isInitialized,
        services,
        identity,
        currentLocation,
        batteryLevel,
        refreshLocation,
        refreshBattery,
        peerCount,
        meshState,
        refreshCounter,
        triggerRefresh
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppContextProvider');
  }
  return context;
};
