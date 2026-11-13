import { Report, WitnessType, RelationshipToCluster } from '../types';

/**
 * Keywords indicating contradiction or opposite state.
 */
const CONTRADICTION_PAIRS: Array<[RegExp, RegExp]> = [
  [/\b(open|clear|passable|safe)\b/i, /\b(closed|blocked|impassable|collapsed|danger)\b/i],
  [/\b(receding|clearing|drained|dry)\b/i, /\b(rising|flooding|underwater|submerged)\b/i],
  [/\b(extinguished|out|contained)\b/i, /\b(burning|spreading|raging|uncontained)\b/i],
  [/\b(restored|working|online|fixed)\b/i, /\b(failed|down|broken|offline|blackout)\b/i],
];

/**
 * Keywords indicating progress or updates.
 */
const UPDATE_INDICATORS = /\b(update|now|receding|rising|crews|arrived|clearing|status|draining|spreading|evacuating)\b/i;

/**
 * Determine if two report descriptions represent a direct contradiction.
 */
export function areDescriptionsContradictory(desc1: string, desc2: string): boolean {
  const d1 = desc1.toLowerCase();
  const d2 = desc2.toLowerCase();

  for (const [patternA, patternB] of CONTRADICTION_PAIRS) {
    const d1HasA = patternA.test(d1);
    const d1HasB = patternB.test(d1);
    const d2HasA = patternA.test(d2);
    const d2HasB = patternB.test(d2);

    if ((d1HasA && d2HasB) || (d1HasB && d2HasA)) {
      return true;
    }
  }

  // Explicit negation phrases
  if (
    (d1.includes('not ') && !d2.includes('not ')) ||
    (!d1.includes('not ') && d2.includes('not '))
  ) {
    const clean1 = d1.replace(/not\s+/g, '');
    const clean2 = d2.replace(/not\s+/g, '');
    if (clean1.includes('blocked') && clean2.includes('blocked')) return true;
    if (clean1.includes('open') && clean2.includes('open')) return true;
    if (clean1.includes('safe') && clean2.includes('safe')) return true;
  }

  return false;
}

/**
 * Blind Witness (Causal Independence Engine)
 *
 * Evaluates whether a report is an independent observation or a causally-linked update/hearsay,
 * and classifies its relationship to the cluster.
 *
 * @param report The candidate report being evaluated.
 * @param clusterReports All existing reports in the same cluster.
 * @param authorSeenSet The set of event IDs the author device had in local store at composition start.
 */
export function evaluateBlindWitness(
  report: {
    id: string;
    witnessType: WitnessType;
    description: string;
    observedAt: number;
    authorDeviceId: string;
  },
  clusterReports: Report[],
  authorSeenSet: string[]
): {
  isIndependent: boolean;
  relationship: RelationshipToCluster;
  causalOverlapEventIds: string[];
} {
  // If report is self-declared hearsay, it can NEVER be an independent witness
  if (report.witnessType === 'HEARSAY') {
    return {
      isIndependent: false,
      relationship: clusterReports.length > 0 ? 'DUPLICATE' : 'ORIGINAL',
      causalOverlapEventIds: [],
    };
  }

  // Find any reports in this cluster that were already in author's seenSet
  const seenSetLookup = new Set(authorSeenSet);
  const seenPriorReports = clusterReports.filter(
    (prior) => prior.id !== report.id && seenSetLookup.has(prior.id)
  );

  // If author device had NOT received any report from this cluster before writing:
  // It is causally independent!
  if (seenPriorReports.length === 0) {
    // Check if there are other reports in the cluster that this author didn't see
    const otherReports = clusterReports.filter((r) => r.id !== report.id);
    if (otherReports.length === 0) {
      return {
        isIndependent: true,
        relationship: 'ORIGINAL',
        causalOverlapEventIds: [],
      };
    }

    // Author wrote an independent report about the same incident without prior knowledge.
    // Check if it happens to contradict prevailing claims in the same time window
    const hasContradiction = otherReports.some((prior) =>
      areDescriptionsContradictory(report.description, prior.description)
    );

    return {
      isIndependent: true,
      relationship: hasContradiction ? 'CONTRADICTION' : 'ORIGINAL',
      causalOverlapEventIds: [],
    };
  }

  // The author device had already received at least one prior report in this cluster.
  // Therefore, independence is FORCED FALSE (no self-declaration can bypass this).
  const overlapIds = seenPriorReports.map((r) => r.id);

  // Sort seen prior reports by observedAt descending (most recent first)
  const sortedSeen = [...seenPriorReports].sort((a, b) => b.observedAt - a.observedAt);
  const mostRecentSeen = sortedSeen[0];

  // Check if it's a contradiction vs an update
  const isContradiction = seenPriorReports.some((prior) =>
    areDescriptionsContradictory(report.description, prior.description)
  );

  if (isContradiction) {
    return {
      isIndependent: false,
      relationship: 'CONTRADICTION',
      causalOverlapEventIds: overlapIds,
    };
  }

  // If observed later in time than prior seen, and has update indicators or different text:
  if (report.observedAt > mostRecentSeen.observedAt) {
    return {
      isIndependent: false,
      relationship: 'UPDATE',
      causalOverlapEventIds: overlapIds,
    };
  }

  // If text has explicit update indicators
  if (UPDATE_INDICATORS.test(report.description)) {
    return {
      isIndependent: false,
      relationship: 'UPDATE',
      causalOverlapEventIds: overlapIds,
    };
  }

  return {
    isIndependent: false,
    relationship: 'DUPLICATE',
    causalOverlapEventIds: overlapIds,
  };
}
