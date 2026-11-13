import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  Event,
  MaterializedState,
  UserRole,
  RoleCredential,
  IncidentCategory,
  WitnessType,
  DistressCategory,
  DistressStatus,
  ResourceCategory,
  MergeReplayDiff,
  GeoLocation,
} from '../types';
import {
  generateKeypair,
  computeEventId,
  sign,
  issueCoordinatorCredential,
  DEMO_ANCHOR,
} from '../crypto/ed25519';
import {
  db,
  appendEvent,
  appendEventsBatch,
  getAllEvents,
  getLocalDeviceIdentity,
  setLocalDeviceIdentity,
  clearAllEvents,
  requestPersistentStorage,
} from '../storage/db';
import { projectEvents } from '../engines/projections';
import { matchResources } from '../engines/logisticsMatching';
import {
  generateBaseScenarioEvents,
  DEMO_PERSONAS,
  MARCUS_CREDENTIAL,
} from '../data/demoSeeds';

interface CrisisCacheContextType {
  // Device identity
  deviceId: string;
  privateKey: string;
  deviceLabel: string;
  neighborhood: string;
  userRole: UserRole;
  credential: RoleCredential | null;
  setDeviceLabel: (label: string) => void;
  setNeighborhood: (neighborhood: string) => void;
  setUserRole: (role: UserRole) => void;
  claimDemoCoordinatorCredential: () => void;
  revokeCoordinatorCredential: () => void;

  // Materialized state
  state: MaterializedState;
  isReady: boolean;
  rateLimitExceeded: boolean;

  // Actions
  submitReport: (report: {
    category: IncidentCategory;
    witnessType: WitnessType;
    urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    location: GeoLocation;
    observedAt: number;
    seenSetSnapshot: string[];
  }) => Promise<string>;

  retractReport: (reportId: string) => Promise<void>;

  submitDistress: (distress: {
    category: DistressCategory;
    peopleCount: number;
    description: string;
    location: GeoLocation;
  }) => Promise<string>;

  updateDistressStatus: (
    distressId: string,
    status: DistressStatus
  ) => Promise<void>;

  createResourceRequest: (req: {
    category: ResourceCategory;
    quantity: number;
    unit: string;
    neighborhood: string;
    urgency: 'STANDARD' | 'HIGH' | 'CRITICAL';
  }) => Promise<string>;

  createResourceOffer: (offer: {
    category: ResourceCategory;
    quantity: number;
    unit: string;
    neighborhood: string;
  }) => Promise<string>;

  triggerResourceMatching: () => void;
  approveMatch: (matchId: string) => Promise<void>;
  rejectMatch: (matchId: string) => Promise<void>;

  resolveContradiction: (incidentId: string, reason: string) => Promise<void>;
  splitCluster: (incidentId: string, reportIds: string[]) => Promise<void>;
  mergeClusters: (targetIncidentId: string, reportIds: string[]) => Promise<void>;

  // Causal seenSet snapshot for Blind Witness
  captureSeenSetSnapshot: () => string[];

  // Ingest external events (from Sync or Demo)
  ingestExternalEvents: (
    incomingEvents: Event[],
    senderDeviceId: string,
    isCoordinator: boolean
  ) => Promise<void>;

  // Merge Replay
  mergeReplayDiff: MergeReplayDiff | null;
  dismissMergeReplay: () => void;

  // Reset & Replay
  resetToInitialDemo: () => Promise<void>;
  replayFromLog: () => Promise<void>;
}

const CrisisCacheContext = createContext<CrisisCacheContextType | null>(null);

export const CrisisCacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deviceId, setDeviceId] = useState<string>('');
  const [privateKey, setPrivateKey] = useState<string>('');
  const [deviceLabel, setDeviceLabelState] = useState<string>('My Device');
  const [neighborhood, setNeighborhoodState] = useState<string>('Central District');
  const [userRole, setUserRoleState] = useState<UserRole>('CITIZEN');
  const [credential, setCredential] = useState<RoleCredential | null>(null);

  const [events, setEvents] = useState<Event[]>([]);
  const [state, setState] = useState<MaterializedState>(() => projectEvents([], undefined));
  const [isReady, setIsReady] = useState<boolean>(false);
  const [mergeReplayDiff, setMergeReplayDiff] = useState<MergeReplayDiff | null>(null);
  const [rateLimitExceeded, setRateLimitExceeded] = useState<boolean>(false);

  // Logical clock counter
  const logicalCounterRef = useRef<number>(1);
  const localCreationTimesRef = useRef<number[]>([]);

  // Initialize DB and Identity
  useEffect(() => {
    async function init() {
      await requestPersistentStorage();

      // Check existing identity
      let identity = await getLocalDeviceIdentity();
      if (!identity) {
        const keypair = generateKeypair();
        identity = {
          publicKey: keypair.publicKey,
          privateKey: keypair.privateKey,
          label: 'Citizen Phone (Elena)',
          neighborhood: 'Central District',
          credential: null,
        };
        await setLocalDeviceIdentity(identity);
      }

      setDeviceId(identity.publicKey);
      setPrivateKey(identity.privateKey);
      setDeviceLabelState(identity.label);
      setNeighborhoodState(identity.neighborhood);
      if (identity.credential) {
        setCredential(identity.credential);
        setUserRoleState('COORDINATOR');
      }

      // Load stored events
      let storedEvents = await getAllEvents();
      if (storedEvents.length === 0) {
        // Initialize with realistic base scenario
        storedEvents = generateBaseScenarioEvents();
        await appendEventsBatch(storedEvents);
      }

      setEvents(storedEvents);
      const proj = projectEvents(storedEvents, identity.publicKey);
      setState(proj);
      setIsReady(true);
    }

    init();
  }, []);

  // Periodic distress escalation check (runs locally every 15 seconds)
  useEffect(() => {
    if (!isReady || events.length === 0) return;

    const interval = setInterval(() => {
      const proj = projectEvents(events, deviceId);
      setState(proj);
    }, 15000);

    return () => clearInterval(interval);
  }, [isReady, events, deviceId]);

  // Check rate limit (10 events/min)
  const checkRateLimit = useCallback(() => {
    const now = Date.now();
    localCreationTimesRef.current = localCreationTimesRef.current.filter(
      (t) => now - t < 60000
    );
    if (localCreationTimesRef.current.length >= 10) {
      setRateLimitExceeded(true);
      return false;
    }
    localCreationTimesRef.current.push(now);
    setRateLimitExceeded(false);
    return true;
  }, []);

  const createAndAppendEvent = useCallback(
    async (
      type: any,
      payload: Record<string, any>,
      seenSet: string[] = []
    ): Promise<string> => {
      if (!checkRateLimit()) {
        console.warn('Local rate limit reached (10 events/min).');
      }

      logicalCounterRef.current += 1;
      const hlc = {
        physical: Date.now(),
        logical: logicalCounterRef.current,
      };

      const content = {
        type,
        authorDeviceId: deviceId,
        hlc,
        seenSet,
        payload: {
          ...payload,
          authorLabel: deviceLabel,
        },
      };

      const eventId = computeEventId(content);
      const signature = sign(JSON.stringify(content), privateKey);

      const event: Event = {
        id: eventId,
        type,
        authorDeviceId: deviceId,
        hlc,
        seenSet,
        payload: content.payload,
        signature,
      };

      await appendEvent(event);
      const newEvents = [...events, event];
      setEvents(newEvents);
      const newProj = projectEvents(newEvents, deviceId);
      setState(newProj);

      return eventId;
    },
    [deviceId, privateKey, deviceLabel, events, checkRateLimit]
  );

  const captureSeenSetSnapshot = useCallback((): string[] => {
    return events.map((e) => e.id);
  }, [events]);

  const submitReport = useCallback(
    async (report: {
      category: IncidentCategory;
      witnessType: WitnessType;
      urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      description: string;
      location: GeoLocation;
      observedAt: number;
      seenSetSnapshot: string[];
    }): Promise<string> => {
      return await createAndAppendEvent(
        'ReportCreated',
        {
          category: report.category,
          witnessType: report.witnessType,
          urgency: report.urgency || 'MEDIUM',
          description: report.description,
          location: report.location,
          observedAt: report.observedAt,
        },
        report.seenSetSnapshot
      );
    },
    [createAndAppendEvent]
  );

  const retractReport = useCallback(
    async (reportId: string): Promise<void> => {
      await createAndAppendEvent('ReportRetracted', { reportId });
    },
    [createAndAppendEvent]
  );

  const submitDistress = useCallback(
    async (distress: {
      category: DistressCategory;
      peopleCount: number;
      description: string;
      location: GeoLocation;
    }): Promise<string> => {
      return await createAndAppendEvent('DistressCreated', {
        category: distress.category,
        peopleCount: distress.peopleCount,
        description: distress.description,
        location: distress.location,
        initialTier: 'STANDARD',
      });
    },
    [createAndAppendEvent]
  );

  const updateDistressStatus = useCallback(
    async (distressId: string, status: DistressStatus): Promise<void> => {
      await createAndAppendEvent('DistressStatusChanged', {
        distressId,
        status,
        acknowledgedByDeviceId: deviceId,
      });
    },
    [createAndAppendEvent, deviceId]
  );

  const createResourceRequest = useCallback(
    async (req: {
      category: ResourceCategory;
      quantity: number;
      unit: string;
      neighborhood: string;
      urgency: 'STANDARD' | 'HIGH' | 'CRITICAL';
    }): Promise<string> => {
      return await createAndAppendEvent('RequestCreated', req);
    },
    [createAndAppendEvent]
  );

  const createResourceOffer = useCallback(
    async (offer: {
      category: ResourceCategory;
      quantity: number;
      unit: string;
      neighborhood: string;
    }): Promise<string> => {
      return await createAndAppendEvent('OfferCreated', offer);
    },
    [createAndAppendEvent]
  );

  const triggerResourceMatching = useCallback(() => {
    const suggested = matchResources(
      state.resourceRequests,
      state.resourceOffers,
      state.incidents
    );
    for (const match of suggested) {
      if (!state.suggestedMatches.some((m) => m.requestId === match.requestId)) {
        createAndAppendEvent('MatchSuggested', { match });
      }
    }
  }, [state.resourceRequests, state.resourceOffers, state.incidents, state.suggestedMatches, createAndAppendEvent]);

  const approveMatch = useCallback(
    async (matchId: string): Promise<void> => {
      await createAndAppendEvent('MatchApproved', {
        matchId,
        approvedByDeviceId: deviceId,
      });
    },
    [createAndAppendEvent, deviceId]
  );

  const rejectMatch = useCallback(
    async (matchId: string): Promise<void> => {
      await createAndAppendEvent('MatchRejected', { matchId });
    },
    [createAndAppendEvent]
  );

  const resolveContradiction = useCallback(
    async (incidentId: string, reason: string): Promise<void> => {
      await createAndAppendEvent('ContradictionResolved', {
        incidentId,
        reason,
      });
    },
    [createAndAppendEvent]
  );

  const splitCluster = useCallback(
    async (incidentId: string, reportIds: string[]): Promise<void> => {
      await createAndAppendEvent('ClusterSplit', {
        affectedReportIds: reportIds,
        targetIncidentId: `INC-SPLIT-${Date.now().toString(36)}`,
      });
    },
    [createAndAppendEvent]
  );

  const mergeClusters = useCallback(
    async (targetIncidentId: string, reportIds: string[]): Promise<void> => {
      await createAndAppendEvent('ClusterMerged', {
        affectedReportIds: reportIds,
        targetIncidentId,
      });
    },
    [createAndAppendEvent]
  );

  // Ingest incoming events from sync peer or demo
  const ingestExternalEvents = useCallback(
    async (
      incomingEvents: Event[],
      senderDeviceId: string,
      isCoordinator: boolean
    ): Promise<void> => {
      const existingIds = new Set(events.map((e) => e.id));
      const newEvents = incomingEvents.filter((e) => !existingIds.has(e.id));

      if (newEvents.length === 0) return;

      // Snapshot PRE-MERGE state for Merge Replay diffing
      const preIncidentsMap = new Map<string, any>(state.incidents.map((inc) => [inc.id, inc]));

      // Record delivery receipts for all target reports/distress requests
      const receiptEvents: Event[] = [];
      for (const e of newEvents) {
        if (e.type === 'ReportCreated' || e.type === 'DistressCreated') {
          logicalCounterRef.current += 1;
          const receiptEvent: Event = {
            id: computeEventId({
              type: 'SyncReceiptRecorded',
              authorDeviceId: deviceId,
              hlc: { physical: Date.now(), logical: logicalCounterRef.current },
              seenSet: [],
              payload: {
                targetId: e.id,
                reachedDeviceId: deviceId,
                isCoordinator: userRole === 'COORDINATOR',
              },
            }),
            type: 'SyncReceiptRecorded',
            authorDeviceId: deviceId,
            hlc: { physical: Date.now(), logical: logicalCounterRef.current },
            seenSet: [],
            payload: {
              targetId: e.id,
              reachedDeviceId: deviceId,
              isCoordinator: userRole === 'COORDINATOR',
            },
            signature: '',
          };
          receiptEvent.signature = sign(JSON.stringify(receiptEvent), privateKey);
          receiptEvents.push(receiptEvent);
        }
      }

      const mergedEvents = [...events, ...newEvents, ...receiptEvents];
      await appendEventsBatch([...newEvents, ...receiptEvents]);
      setEvents(mergedEvents);

      // Snapshot POST-MERGE state
      const postState = projectEvents(mergedEvents, deviceId);
      setState(postState);

      // Detect partition diff for Merge Replay signature interaction
      const affectedIncidents: any[] = [];
      for (const postInc of postState.incidents) {
        const preInc: any = preIncidentsMap.get(postInc.id);
        if (!preInc) {
          // Newly arrived incident from other partition
          affectedIncidents.push({
            incidentId: postInc.id,
            category: postInc.category,
            locationName: postInc.location.landmark || postInc.location.neighborhood,
            beforeStatus: 'UNVERIFIED',
            afterStatus: postInc.status,
            beforeWitnessCount: 0,
            afterWitnessCount: postInc.independentWitnessCount,
            changeReason: `Arrived from isolated partition via ${senderDeviceId.slice(0, 6)}`,
            newReportSummaries: postInc.reportIds.map((id) => {
              const r = postState.reports.find((rep) => rep.id === id);
              return r ? `"${r.description}" (${r.witnessType})` : id;
            }),
          });
        } else if (
          preInc.status !== postInc.status ||
          preInc.independentWitnessCount !== postInc.independentWitnessCount
        ) {
          let reason = '';
          if (postInc.status === 'CONTESTED') {
            reason = 'Status changed to CONTESTED due to conflicting report in merged batch.';
          } else if (postInc.status === 'CORROBORATED') {
            reason = 'Status elevated to CORROBORATED by independent witness from merged partition.';
          } else {
            reason = `Witness count updated: ${preInc.independentWitnessCount} -> ${postInc.independentWitnessCount}`;
          }

          affectedIncidents.push({
            incidentId: postInc.id,
            category: postInc.category,
            locationName: postInc.location.landmark || postInc.location.neighborhood,
            beforeStatus: preInc.status,
            afterStatus: postInc.status,
            beforeWitnessCount: preInc.independentWitnessCount,
            afterWitnessCount: postInc.independentWitnessCount,
            changeReason: reason,
            newReportSummaries: postInc.reportIds
              .filter((id) => !preInc.reportIds.includes(id))
              .map((id) => {
                const r = postState.reports.find((rep) => rep.id === id);
                return r ? `"${r.description}" (${r.witnessType})` : id;
              }),
          });
        }
      }

      if (affectedIncidents.length > 0) {
        setMergeReplayDiff({
          timestamp: Date.now(),
          incomingBatchDeviceCount: 1,
          incomingEventCount: newEvents.length,
          affectedIncidents,
        });
      }
    },
    [events, state.incidents, deviceId, userRole, privateKey]
  );

  const dismissMergeReplay = useCallback(() => {
    setMergeReplayDiff(null);
  }, []);

  const claimDemoCoordinatorCredential = useCallback(() => {
    const cred = issueCoordinatorCredential(
      deviceId,
      DEMO_ANCHOR.privateKey,
      DEMO_ANCHOR.publicKey
    );
    setCredential(cred);
    setUserRoleState('COORDINATOR');
    createAndAppendEvent('CredentialIssued', { credential: cred });
  }, [deviceId, createAndAppendEvent]);

  const revokeCoordinatorCredential = useCallback(() => {
    setCredential(null);
    setUserRoleState('CITIZEN');
  }, []);

  const setDeviceLabel = useCallback(
    (label: string) => {
      setDeviceLabelState(label);
      createAndAppendEvent('DeviceNodeUpdated', { label });
    },
    [createAndAppendEvent]
  );

  const setNeighborhood = useCallback(
    (neigh: string) => {
      setNeighborhoodState(neigh);
      createAndAppendEvent('DeviceNodeUpdated', { neighborhood: neigh });
    },
    [createAndAppendEvent]
  );

  const setUserRole = useCallback(
    (role: UserRole) => {
      if (role === 'COORDINATOR' && !credential) {
        claimDemoCoordinatorCredential();
      } else {
        setUserRoleState(role);
      }
    },
    [credential, claimDemoCoordinatorCredential]
  );

  const resetToInitialDemo = useCallback(async () => {
    await clearAllEvents();
    const base = generateBaseScenarioEvents();
    await appendEventsBatch(base);
    setEvents(base);
    const proj = projectEvents(base, deviceId);
    setState(proj);
    setMergeReplayDiff(null);
  }, [deviceId]);

  const replayFromLog = useCallback(async () => {
    const all = await getAllEvents();
    const replayed = projectEvents(all, deviceId);
    setState(replayed);
  }, [deviceId]);

  return (
    <CrisisCacheContext.Provider
      value={{
        deviceId,
        privateKey,
        deviceLabel,
        neighborhood,
        userRole,
        credential,
        setDeviceLabel,
        setNeighborhood,
        setUserRole,
        claimDemoCoordinatorCredential,
        revokeCoordinatorCredential,
        state,
        isReady,
        rateLimitExceeded,
        submitReport,
        retractReport,
        submitDistress,
        updateDistressStatus,
        createResourceRequest,
        createResourceOffer,
        triggerResourceMatching,
        approveMatch,
        rejectMatch,
        resolveContradiction,
        splitCluster,
        mergeClusters,
        captureSeenSetSnapshot,
        ingestExternalEvents,
        mergeReplayDiff,
        dismissMergeReplay,
        resetToInitialDemo,
        replayFromLog,
      }}
    >
      {children}
    </CrisisCacheContext.Provider>
  );
};

export function useCrisisCache() {
  const context = useContext(CrisisCacheContext);
  if (!context) {
    throw new Error('useCrisisCache must be used within a CrisisCacheProvider');
  }
  return context;
}
