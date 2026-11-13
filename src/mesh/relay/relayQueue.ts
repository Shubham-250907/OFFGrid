export interface RelayQueueItem {
  eventId: string;
  peerFingerprint: string;
  priority: number;
  attemptCount: number;
  nextAttemptAt: number | null;
  acknowledgedAt: number | null;
}
