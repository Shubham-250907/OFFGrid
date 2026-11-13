import { Report, IncidentStatus } from '../types';

export interface EvidenceEvaluationResult {
  status: IncidentStatus;
  independentWitnessCount: number;
  totalWitnessCount: number;
  hearsayCount: number;
  hasContradiction: boolean;
  unresolvedContradictionIds: string[];
  confidenceSummary: string;
}

/**
 * Format relative time for human reading (e.g. "12m ago", "1h ago")
 */
function formatTimeAgo(timestamp: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - timestamp);
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Pure function: Evaluates evidence for an incident cluster.
 *
 * State transitions:
 * - CONTESTED: any active report has relationship === 'CONTRADICTION' and is not resolved
 * - RESOLVED: coordinator logged a resolution reason
 * - CORROBORATED: >= 2 independent firsthand reports, no unresolved contradiction
 * - UNVERIFIED: < 2 independent firsthand reports
 */
export function evaluateEvidence(
  reports: Report[],
  resolution?: { reason: string; resolvedBy: string; resolvedAt: number } | null,
  now: number = Date.now()
): EvidenceEvaluationResult {
  const activeReports = reports.filter((r) => !r.retracted);

  if (activeReports.length === 0) {
    return {
      status: 'UNVERIFIED',
      independentWitnessCount: 0,
      totalWitnessCount: 0,
      hearsayCount: 0,
      hasContradiction: false,
      unresolvedContradictionIds: [],
      confidenceSummary: 'No active reports recorded.',
    };
  }

  // Count independent firsthand reports
  // Note: PRD §1.3 P6: Coordinator-settable shared device caps contribution at 1 per device
  const independentReports = activeReports.filter(
    (r) => r.witnessType === 'FIRSTHAND' && r.isIndependent
  );

  // Unique devices among independent reports
  const uniqueIndependentDevices = new Set(independentReports.map((r) => r.authorDeviceId));
  const independentWitnessCount = uniqueIndependentDevices.size;

  const hearsayCount = activeReports.filter((r) => r.witnessType === 'HEARSAY').length;
  const totalWitnessCount = activeReports.length;

  const contradictionReports = activeReports.filter(
    (r) => r.relationshipToCluster === 'CONTRADICTION'
  );
  const hasContradiction = contradictionReports.length > 0;
  const isResolved = !!resolution && !!resolution.reason;

  let status: IncidentStatus;
  let summary = '';

  if (isResolved) {
    status = 'RESOLVED';
    summary = `Resolved by Coordinator (${resolution.resolvedBy.slice(0, 6)}...): "${resolution.reason}" • ${formatTimeAgo(resolution.resolvedAt, now)}`;
  } else if (hasContradiction) {
    status = 'CONTESTED';
    const latestContradiction = contradictionReports[contradictionReports.length - 1];
    summary = `CONTESTED: Conflicting claims in cluster (${contradictionReports.length} conflicting report). Requires coordinator resolution.`;
  } else if (independentWitnessCount >= 2) {
    status = 'CORROBORATED';
    const updateCount = activeReports.filter((r) => r.relationshipToCluster === 'UPDATE').length;
    const updateText = updateCount > 0 ? `, ${updateCount} update${updateCount > 1 ? 's' : ''}` : '';
    const mostRecent = Math.max(...activeReports.map((r) => r.observedAt));
    summary = `CORROBORATED: ${independentWitnessCount} independent devices${updateText}. Latest report ${formatTimeAgo(mostRecent, now)}.`;
  } else {
    status = 'UNVERIFIED';
    const mostRecent = Math.max(...activeReports.map((r) => r.observedAt));
    if (independentWitnessCount === 1) {
      const hearsayText = hearsayCount > 0 ? `, ${hearsayCount} hearsay relay${hearsayCount > 1 ? 's' : ''}` : '';
      summary = `UNVERIFIED: 1 firsthand witness${hearsayText}. Awaiting second independent witness (${formatTimeAgo(mostRecent, now)}).`;
    } else {
      summary = `UNVERIFIED: ${hearsayCount} hearsay report${hearsayCount > 1 ? 's' : ''}, 0 independent firsthand witnesses.`;
    }
  }

  return {
    status,
    independentWitnessCount,
    totalWitnessCount,
    hearsayCount,
    hasContradiction,
    unresolvedContradictionIds: isResolved ? [] : contradictionReports.map((r) => r.id),
    confidenceSummary: summary,
  };
}
