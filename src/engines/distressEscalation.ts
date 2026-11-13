import { DistressCategory, DistressRequest, EscalationTier } from '../types';

export interface DistressEscalationConfig {
  window1Ms: number; // Duration until URGENT
  window2Ms: number; // Duration until CRITICAL
}

export const DISTRESS_ESCALATION_WINDOWS: Record<DistressCategory, DistressEscalationConfig> = {
  MEDICAL: {
    window1Ms: 10 * 60 * 1000, // 10 minutes
    window2Ms: 20 * 60 * 1000, // 20 minutes
  },
  RESCUE: {
    window1Ms: 15 * 60 * 1000, // 15 minutes
    window2Ms: 30 * 60 * 1000, // 30 minutes
  },
  OTHER: {
    window1Ms: 30 * 60 * 1000, // 30 minutes
    window2Ms: 60 * 60 * 1000, // 60 minutes
  },
};

const TIER_WEIGHT: Record<EscalationTier, number> = {
  STANDARD: 1,
  URGENT: 2,
  CRITICAL: 3,
};

/**
 * Pure function: Computes the current escalation tier for a distress request.
 *
 * An OPEN Distress Request not ACKNOWLEDGED within its category window
 * automatically raises its displayed urgency tier.
 *
 * Escalation is strictly monotonic: it never decreases while OPEN.
 */
export function computeDistressEscalation(
  request: DistressRequest,
  now: number = Date.now()
): {
  escalationTier: EscalationTier;
  hasEscalated: boolean;
  minutesOpen: number;
} {
  // If request is already acknowledged or resolved, keep its existing tier
  if (request.status !== 'OPEN') {
    return {
      escalationTier: request.escalationTier,
      hasEscalated: false,
      minutesOpen: Math.floor((request.acknowledgedAt || now - request.createdAt.physical) / (60 * 1000)),
    };
  }

  const config = DISTRESS_ESCALATION_WINDOWS[request.category] || DISTRESS_ESCALATION_WINDOWS.OTHER;
  const elapsedMs = Math.max(0, now - request.createdAt.physical);
  const minutesOpen = Math.floor(elapsedMs / (60 * 1000));

  let computedTier: EscalationTier = 'STANDARD';
  if (elapsedMs >= config.window2Ms) {
    computedTier = 'CRITICAL';
  } else if (elapsedMs >= config.window1Ms) {
    computedTier = 'URGENT';
  }

  // Monotonic: cannot regress below previously reached tier
  const currentWeight = TIER_WEIGHT[request.escalationTier] || 1;
  const newWeight = TIER_WEIGHT[computedTier];

  const finalTier = newWeight >= currentWeight ? computedTier : request.escalationTier;
  const hasEscalated = TIER_WEIGHT[finalTier] > currentWeight;

  return {
    escalationTier: finalTier,
    hasEscalated,
    minutesOpen,
  };
}
