export type ConfidenceBadge = 'HIGH_CONFIDENCE' | 'DISPUTED' | 'UNVERIFIED';

export interface EffectiveVoteEvidence {
  voterPublicKey: string;
  voteType: 'CONFIRM' | 'DISPUTE';
  proximityWeight: number;
  timeDecay: number;
}

export interface ConfidenceEvaluation {
  score: number;
  badge: ConfidenceBadge;
  effectiveConfirmCount: number;
  effectiveDisputeCount: number;
  positiveProximityKeyCount: number;
}

export function calculateConfidenceScore(
  votes: EffectiveVoteEvidence[]
): ConfidenceEvaluation {
  let s = 0;
  let w = 0;
  let confirmCount = 0;
  let disputeCount = 0;
  const positiveProximityKeys = new Set<string>();

  for (const vote of votes) {
    const voteSign = vote.voteType === 'CONFIRM' ? 1 : -1;
    if (vote.voteType === 'CONFIRM') {
      confirmCount++;
    } else {
      disputeCount++;
    }

    if (vote.proximityWeight > 0) {
      positiveProximityKeys.add(vote.voterPublicKey);
    }

    const contribution = voteSign * vote.proximityWeight * vote.timeDecay;
    const weight = vote.proximityWeight * vote.timeDecay;

    s += contribution;
    w += weight;
  }

  const rawScore = s / Math.max(1, w);
  const score = Math.max(-1.0, Math.min(1.0, rawScore));

  let badge: ConfidenceBadge = 'UNVERIFIED';

  if (score >= 0.60 && positiveProximityKeys.size >= 3) {
    badge = 'HIGH_CONFIDENCE';
  } else if (score <= -0.25 && disputeCount > 0 && Array.from(positiveProximityKeys).some(k => votes.some(v => v.voterPublicKey === k && v.voteType === 'DISPUTE'))) {
    badge = 'DISPUTED';
  }

  return {
    score: Math.round(score * 10000) / 10000,
    badge,
    effectiveConfirmCount: confirmCount,
    effectiveDisputeCount: disputeCount,
    positiveProximityKeyCount: positiveProximityKeys.size
  };
}
