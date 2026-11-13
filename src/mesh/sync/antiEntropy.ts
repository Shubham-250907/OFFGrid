export type SyncState =
  | 'DISCOVERING'
  | 'PEER_CONNECTED'
  | 'AUTHENTICATING'
  | 'MANIFEST_EXCHANGE'
  | 'DELTA_COMPARISON'
  | 'DELTA_TRANSFER'
  | 'VALIDATION_AND_MERGE'
  | 'ACKNOWLEDGEMENT'
  | 'REPEAT_ANTI_ENTROPY'
  | 'SYNCED_FOR_THIS_PEER_SCOPE'
  | 'INTERRUPTED';

export interface AntiEntropySession {
  peerId: string;
  state: SyncState;
  lastActiveTimestamp: number;
}
