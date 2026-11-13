import {
  ResourceCategory,
  ResourceRequest,
  ResourceOffer,
  Incident,
  SuggestedMatch,
  SuggestedMatchAllocation,
} from '../types';

/**
 * Fixed conversion table for resource units
 */
export const UNIT_CONVERSIONS: Record<
  ResourceCategory,
  { baseUnit: string; conversions: Record<string, number> }
> = {
  WATER: {
    baseUnit: 'L',
    conversions: {
      l: 1,
      liter: 1,
      liters: 1,
      gal: 3.785,
      gallon: 3.785,
      gallons: 3.785,
      qt: 0.946,
      quart: 0.946,
      bottle: 0.5,
      bottles: 0.5,
      case: 12, // 24 x 0.5L bottles = 12L
    },
  },
  FOOD: {
    baseUnit: 'meals',
    conversions: {
      meal: 1,
      meals: 1,
      ration: 1,
      rations: 1,
      box: 24, // Standard 24-meal disaster ration pack
      boxes: 24,
      crate: 100,
    },
  },
  MEDICAL: {
    baseUnit: 'kits',
    conversions: {
      kit: 1,
      kits: 1,
      unit: 1,
      units: 1,
      box: 10,
      boxes: 10,
    },
  },
  SHELTER: {
    baseUnit: 'persons',
    conversions: {
      person: 1,
      persons: 1,
      bed: 1,
      beds: 1,
      cot: 1,
      cots: 1,
      tent: 4,
      tents: 4,
    },
  },
  POWER: {
    baseUnit: 'kW',
    conversions: {
      kw: 1,
      kva: 0.8,
      w: 0.001,
      generator: 5,
      generators: 5,
      battery: 0.5,
    },
  },
  TOOLS: {
    baseUnit: 'units',
    conversions: {
      unit: 1,
      units: 1,
      set: 1,
      sets: 1,
    },
  },
};

/**
 * Normalize any quantity and unit into base unit standard.
 */
export function normalizeResourceQuantity(
  category: ResourceCategory,
  quantity: number,
  unit: string
): { normalizedQuantity: number; baseUnit: string } {
  const config = UNIT_CONVERSIONS[category];
  if (!config) return { normalizedQuantity: quantity, baseUnit: unit };

  const cleanUnit = unit.trim().toLowerCase();
  const factor = config.conversions[cleanUnit] || 1;
  return {
    normalizedQuantity: Math.round(quantity * factor * 100) / 100,
    baseUnit: config.baseUnit,
  };
}

/**
 * Convert base unit quantity back to user-friendly unit
 */
export function formatNormalizedQuantity(
  category: ResourceCategory,
  normalizedQuantity: number
): string {
  const config = UNIT_CONVERSIONS[category];
  const unit = config ? config.baseUnit : 'units';
  return `${normalizedQuantity} ${unit}`;
}

/**
 * Heuristic check if road blockage or utility failure obstructs route between neighborhoods.
 */
export function checkLogisticsObstruction(
  fromNeighborhood: string,
  toNeighborhood: string,
  activeIncidents: Incident[]
): string | null {
  if (fromNeighborhood.toLowerCase() === toNeighborhood.toLowerCase()) {
    // Within same neighborhood, no route obstruction
    return null;
  }

  // Find active road blockages or utility failures
  const blockages = activeIncidents.filter(
    (inc) =>
      (inc.category === 'ROAD_BLOCKAGE' || inc.category === 'UTILITY_FAILURE') &&
      inc.status !== 'RESOLVED'
  );

  for (const b of blockages) {
    const bNeigh = (b.location.neighborhood || '').toLowerCase();
    const fromN = fromNeighborhood.toLowerCase();
    const toN = toNeighborhood.toLowerCase();

    // If blockage is in either neighborhood, or known transit corridor
    if (bNeigh === fromN || bNeigh === toN || bNeigh.includes('transit') || bNeigh.includes('bridge')) {
      const desc = b.location.landmark || b.location.neighborhood || b.category;
      return `Route crosses active ${b.category.replace('_', ' ')} near "${desc}". Alternate transport needed.`;
    }
  }

  return null;
}

/**
 * Pure function: Match resource requests with available offers.
 *
 * Algorithm:
 * 1. Filter open requests and available offers by category.
 * 2. Prioritize same-neighborhood offers (lowest transit risk).
 * 3. Greedily allocate supply up to target quantity.
 * 4. Cross-reference active road blockage incidents for logistics warnings.
 */
export function matchResources(
  requests: ResourceRequest[],
  offers: ResourceOffer[],
  activeIncidents: Incident[]
): SuggestedMatch[] {
  const openRequests = requests.filter((r) => r.status === 'OPEN' || r.status === 'PARTIAL');
  const availableOffers = offers.filter(
    (o) => o.status === 'AVAILABLE' && o.allocatedQuantity < o.normalizedQuantity
  );

  const suggestedMatches: SuggestedMatch[] = [];

  // Track remaining availability across offers during matching run
  const remainingOfferQuantity = new Map<string, number>();
  for (const o of availableOffers) {
    remainingOfferQuantity.set(o.id, o.normalizedQuantity - o.allocatedQuantity);
  }

  // Sort requests by urgency (CRITICAL > HIGH > STANDARD)
  const urgencyWeight = { CRITICAL: 3, HIGH: 2, STANDARD: 1 };
  const sortedRequests = [...openRequests].sort(
    (a, b) => urgencyWeight[b.urgency] - urgencyWeight[a.urgency]
  );

  for (const req of sortedRequests) {
    const unfulfilled = req.normalizedQuantity - req.fulfilledQuantity;
    if (unfulfilled <= 0) continue;

    // Matching offers for this category with available stock
    const candidateOffers = availableOffers
      .filter((o) => o.category === req.category && (remainingOfferQuantity.get(o.id) || 0) > 0)
      .sort((a, b) => {
        // Same neighborhood first
        const aSame = a.neighborhood.toLowerCase() === req.neighborhood.toLowerCase() ? 1 : 0;
        const bSame = b.neighborhood.toLowerCase() === req.neighborhood.toLowerCase() ? 1 : 0;
        return bSame - aSame;
      });

    if (candidateOffers.length === 0) continue;

    let needed = unfulfilled;
    const allocations: SuggestedMatchAllocation[] = [];
    let logisticsWarning: string | null = null;

    for (const offer of candidateOffers) {
      if (needed <= 0) break;
      const currentAvailable = remainingOfferQuantity.get(offer.id) || 0;
      if (currentAvailable <= 0) continue;

      const take = Math.min(needed, currentAvailable);
      allocations.push({
        offerId: offer.id,
        offerNeighborhood: offer.neighborhood,
        quantity: take,
        normalizedQuantity: take,
        unit: UNIT_CONVERSIONS[req.category]?.baseUnit || req.unit,
      });

      remainingOfferQuantity.set(offer.id, currentAvailable - take);
      needed -= take;

      // Check logistics
      const warn = checkLogisticsObstruction(offer.neighborhood, req.neighborhood, activeIncidents);
      if (warn && !logisticsWarning) {
        logisticsWarning = warn;
      }
    }

    if (allocations.length > 0) {
      const totalSuggested = allocations.reduce((sum, a) => sum + a.normalizedQuantity, 0);
      suggestedMatches.push({
        id: `MATCH-${req.id}-${Date.now().toString(36)}`,
        requestId: req.id,
        requestNeighborhood: req.neighborhood,
        category: req.category,
        matches: allocations,
        totalSuggestedQuantity: totalSuggested,
        targetQuantity: unfulfilled,
        unit: UNIT_CONVERSIONS[req.category]?.baseUnit || req.unit,
        logisticsWarning,
        status: 'PENDING',
        approvedByDeviceId: null,
        createdAt: Date.now(),
      });
    }
  }

  return suggestedMatches;
}
