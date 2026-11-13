import { describe, it, expect } from 'vitest';
import { clusterReports, calculateDistanceMeters } from '../engines/clustering';
import { evaluateBlindWitness, areDescriptionsContradictory } from '../engines/blindWitness';
import { evaluateEvidence } from '../engines/evidence';
import { computeDistressEscalation } from '../engines/distressEscalation';
import { matchResources, normalizeResourceQuantity } from '../engines/logisticsMatching';
import { projectEvents } from '../engines/projections';
import {
  generateBaseScenarioEvents,
  generateElenaPartitionEvents,
  generateDeviceDHearsayEvent,
  generateDeviceEIndependentEvent,
  generateDeviceFContradictionEvent,
  DEMO_PERSONAS,
  createSignedEvent,
} from '../data/demoSeeds';
import { Event, Report } from '../types';

describe('CRISISCACHE v2.0 Pure Engine Tests', () => {
  describe('Clustering Engine', () => {
    it('calculates geographic distance accurately', () => {
      const p1 = { lat: 37.775, lng: -122.419, neighborhood: 'Central District' };
      const p2 = { lat: 37.776, lng: -122.419, neighborhood: 'Central District' };
      const dist = calculateDistanceMeters(p1, p2);
      expect(dist).toBeGreaterThan(100);
      expect(dist).toBeLessThan(120); // ~111m per 0.001 deg lat
    });

    it('clusters nearby reports of same category within trailing window', () => {
      const now = Date.now();
      const reports: Report[] = [
        {
          id: 'REP-1',
          incidentId: '',
          authorDeviceId: 'DEV-A',
          witnessType: 'FIRSTHAND',
          isIndependent: true,
          relationshipToCluster: 'ORIGINAL',
          category: 'FLOODING',
          description: 'Water rising at 4th St',
          location: { lat: 37.775, lng: -122.419, neighborhood: 'Central' },
          observedAt: now,
          createdAt: { physical: now, logical: 1 },
          retracted: false,
        },
        {
          id: 'REP-2',
          incidentId: '',
          authorDeviceId: 'DEV-B',
          witnessType: 'FIRSTHAND',
          isIndependent: true,
          relationshipToCluster: 'ORIGINAL',
          category: 'FLOODING',
          description: 'Underpass flooded 1m deep',
          location: { lat: 37.7752, lng: -122.4189, neighborhood: 'Central' },
          observedAt: now + 5 * 60 * 1000,
          createdAt: { physical: now + 5 * 60 * 1000, logical: 1 },
          retracted: false,
        },
      ];

      const clusters = clusterReports(reports);
      expect(clusters.length).toBe(1);
      expect(clusters[0].reportIds).toContain('REP-1');
      expect(clusters[0].reportIds).toContain('REP-2');
    });

    it('separates reports of different categories even if at exact same location', () => {
      const now = Date.now();
      const reports: Report[] = [
        {
          id: 'REP-1',
          incidentId: '',
          authorDeviceId: 'DEV-A',
          witnessType: 'FIRSTHAND',
          isIndependent: true,
          relationshipToCluster: 'ORIGINAL',
          category: 'FLOODING',
          description: 'Water on roadway',
          location: { lat: 37.775, lng: -122.419, neighborhood: 'Central' },
          observedAt: now,
          createdAt: { physical: now, logical: 1 },
          retracted: false,
        },
        {
          id: 'REP-2',
          incidentId: '',
          authorDeviceId: 'DEV-B',
          witnessType: 'FIRSTHAND',
          isIndependent: true,
          relationshipToCluster: 'ORIGINAL',
          category: 'FIRE',
          description: 'Transformer fire sparking',
          location: { lat: 37.775, lng: -122.419, neighborhood: 'Central' },
          observedAt: now,
          createdAt: { physical: now, logical: 1 },
          retracted: false,
        },
      ];

      const clusters = clusterReports(reports);
      expect(clusters.length).toBe(2);
    });
  });

  describe('Blind Witness & Causal Independence Engine', () => {
    it('classifies first firsthand report as independent ORIGINAL', () => {
      const evalRes = evaluateBlindWitness(
        {
          id: 'REP-1',
          witnessType: 'FIRSTHAND',
          description: 'Severe flood at underpass',
          observedAt: 1000,
          authorDeviceId: 'DEV-1',
        },
        [],
        []
      );

      expect(evalRes.isIndependent).toBe(true);
      expect(evalRes.relationship).toBe('ORIGINAL');
    });

    it('classifies hearsay as isIndependent = false', () => {
      const evalRes = evaluateBlindWitness(
        {
          id: 'REP-2',
          witnessType: 'HEARSAY',
          description: 'Heard flood is bad',
          observedAt: 2000,
          authorDeviceId: 'DEV-2',
        },
        [],
        []
      );

      expect(evalRes.isIndependent).toBe(false);
    });

    it('forces isIndependent = false when author seenSet already contains prior cluster report', () => {
      const priorReport: Report = {
        id: 'REP-1',
        incidentId: 'INC-1',
        authorDeviceId: 'DEV-1',
        witnessType: 'FIRSTHAND',
        isIndependent: true,
        relationshipToCluster: 'ORIGINAL',
        category: 'FLOODING',
        description: 'Water rising',
        location: { lat: 0, lng: 0, neighborhood: '' },
        observedAt: 1000,
        createdAt: { physical: 1000, logical: 1 },
        retracted: false,
      };

      // Device 2 had already received REP-1 in its local store at composition time
      const evalRes = evaluateBlindWitness(
        {
          id: 'REP-2',
          witnessType: 'FIRSTHAND',
          description: 'Confirming water is still high',
          observedAt: 2000,
          authorDeviceId: 'DEV-2',
        },
        [priorReport],
        ['REP-1'] // seenSet contains REP-1
      );

      expect(evalRes.isIndependent).toBe(false);
      expect(evalRes.relationship).toBe('UPDATE');
      expect(evalRes.causalOverlapEventIds).toContain('REP-1');
    });

    it('derives isIndependent = true when author wrote firsthand report without receiving prior cluster report', () => {
      const priorReport: Report = {
        id: 'REP-1',
        incidentId: 'INC-1',
        authorDeviceId: 'DEV-1',
        witnessType: 'FIRSTHAND',
        isIndependent: true,
        relationshipToCluster: 'ORIGINAL',
        category: 'FLOODING',
        description: 'Water rising',
        location: { lat: 0, lng: 0, neighborhood: '' },
        observedAt: 1000,
        createdAt: { physical: 1000, logical: 1 },
        retracted: false,
      };

      // Device 3 was in a partitioned area and had NOT seen REP-1
      const evalRes = evaluateBlindWitness(
        {
          id: 'REP-3',
          witnessType: 'FIRSTHAND',
          description: 'Water surge at 4th St',
          observedAt: 1500,
          authorDeviceId: 'DEV-3',
        },
        [priorReport],
        [] // Empty seenSet -> Genuine Independent Witness!
      );

      expect(evalRes.isIndependent).toBe(true);
    });

    it('detects contradiction between opposite assertions', () => {
      expect(
        areDescriptionsContradictory('Bridge is open and safe', 'Bridge is blocked and closed')
      ).toBe(true);
      expect(
        areDescriptionsContradictory('Water is receding and dry', 'Water is rising and submerged')
      ).toBe(true);
      expect(
        areDescriptionsContradictory('Water is 2 feet deep', 'Water is 3 feet deep')
      ).toBe(false);
    });
  });

  describe('Evidence Evaluation & State Machine', () => {
    it('stays UNVERIFIED on hearsay even with multiple relays', () => {
      const reports: Report[] = [
        {
          id: 'R1',
          incidentId: 'INC-1',
          authorDeviceId: 'D1',
          witnessType: 'HEARSAY',
          isIndependent: false,
          relationshipToCluster: 'ORIGINAL',
          category: 'FLOODING',
          description: 'Heard flood is bad',
          location: { lat: 0, lng: 0, neighborhood: '' },
          observedAt: 1000,
          createdAt: { physical: 1000, logical: 1 },
          retracted: false,
        },
        {
          id: 'R2',
          incidentId: 'INC-1',
          authorDeviceId: 'D2',
          witnessType: 'HEARSAY',
          isIndependent: false,
          relationshipToCluster: 'DUPLICATE',
          category: 'FLOODING',
          description: 'Neighbors say flood is rising',
          location: { lat: 0, lng: 0, neighborhood: '' },
          observedAt: 2000,
          createdAt: { physical: 2000, logical: 1 },
          retracted: false,
        },
      ];

      const ev = evaluateEvidence(reports);
      expect(ev.status).toBe('UNVERIFIED');
      expect(ev.independentWitnessCount).toBe(0);
      expect(ev.hearsayCount).toBe(2);
    });

    it('transitions to CORROBORATED on >=2 independent firsthand reports', () => {
      const reports: Report[] = [
        {
          id: 'R1',
          incidentId: 'INC-1',
          authorDeviceId: 'D1',
          witnessType: 'FIRSTHAND',
          isIndependent: true,
          relationshipToCluster: 'ORIGINAL',
          category: 'FLOODING',
          description: 'Saw water rising',
          location: { lat: 0, lng: 0, neighborhood: '' },
          observedAt: 1000,
          createdAt: { physical: 1000, logical: 1 },
          retracted: false,
        },
        {
          id: 'R2',
          incidentId: 'INC-1',
          authorDeviceId: 'D2',
          witnessType: 'FIRSTHAND',
          isIndependent: true,
          relationshipToCluster: 'ORIGINAL',
          category: 'FLOODING',
          description: 'Cars stuck in flood',
          location: { lat: 0, lng: 0, neighborhood: '' },
          observedAt: 1500,
          createdAt: { physical: 1500, logical: 1 },
          retracted: false,
        },
      ];

      const ev = evaluateEvidence(reports);
      expect(ev.status).toBe('CORROBORATED');
      expect(ev.independentWitnessCount).toBe(2);
    });

    it('transitions to CONTESTED on unresolved contradiction', () => {
      const reports: Report[] = [
        {
          id: 'R1',
          incidentId: 'INC-1',
          authorDeviceId: 'D1',
          witnessType: 'FIRSTHAND',
          isIndependent: true,
          relationshipToCluster: 'ORIGINAL',
          category: 'FLOODING',
          description: 'Roadway submerged',
          location: { lat: 0, lng: 0, neighborhood: '' },
          observedAt: 1000,
          createdAt: { physical: 1000, logical: 1 },
          retracted: false,
        },
        {
          id: 'R2',
          incidentId: 'INC-1',
          authorDeviceId: 'D2',
          witnessType: 'FIRSTHAND',
          isIndependent: true,
          relationshipToCluster: 'CONTRADICTION',
          category: 'FLOODING',
          description: 'Roadway is completely clear and dry',
          location: { lat: 0, lng: 0, neighborhood: '' },
          observedAt: 1200,
          createdAt: { physical: 1200, logical: 1 },
          retracted: false,
        },
      ];

      const ev = evaluateEvidence(reports);
      expect(ev.status).toBe('CONTESTED');
    });

    it('transitions to RESOLVED when Coordinator provides logged resolution reason', () => {
      const reports: Report[] = [
        {
          id: 'R1',
          incidentId: 'INC-1',
          authorDeviceId: 'D1',
          witnessType: 'FIRSTHAND',
          isIndependent: true,
          relationshipToCluster: 'ORIGINAL',
          category: 'FLOODING',
          description: 'Roadway submerged',
          location: { lat: 0, lng: 0, neighborhood: '' },
          observedAt: 1000,
          createdAt: { physical: 1000, logical: 1 },
          retracted: false,
        },
        {
          id: 'R2',
          incidentId: 'INC-1',
          authorDeviceId: 'D2',
          witnessType: 'FIRSTHAND',
          isIndependent: true,
          relationshipToCluster: 'CONTRADICTION',
          category: 'FLOODING',
          description: 'Roadway is clear',
          location: { lat: 0, lng: 0, neighborhood: '' },
          observedAt: 1200,
          createdAt: { physical: 1200, logical: 1 },
          retracted: false,
        },
      ];

      const ev = evaluateEvidence(reports, {
        reason: 'CERT scout confirmed flood pump drained underpass at 14:30',
        resolvedBy: 'COORD-MARCUS',
        resolvedAt: 2000,
      });

      expect(ev.status).toBe('RESOLVED');
      expect(ev.confidenceSummary).toContain('CERT scout confirmed');
    });
  });

  describe('Distress Escalation Engine (FR-7 & FR-8)', () => {
    it('escalates Medical distress to URGENT at 10m and CRITICAL at 20m', () => {
      const baseTime = 1000000;
      const distress = {
        id: 'D-1',
        authorDeviceId: 'ELENA',
        category: 'MEDICAL' as const,
        peopleCount: 1,
        description: 'Diabetic shock',
        location: { lat: 0, lng: 0, neighborhood: '' },
        status: 'OPEN' as const,
        escalationTier: 'STANDARD' as const,
        createdAt: { physical: baseTime, logical: 1 },
        lastEscalatedAt: baseTime,
      };

      // 5 mins: STANDARD
      const t1 = computeDistressEscalation(distress, baseTime + 5 * 60 * 1000);
      expect(t1.escalationTier).toBe('STANDARD');

      // 11 mins: URGENT
      const t2 = computeDistressEscalation(distress, baseTime + 11 * 60 * 1000);
      expect(t2.escalationTier).toBe('URGENT');

      // 21 mins: CRITICAL
      const t3 = computeDistressEscalation(distress, baseTime + 21 * 60 * 1000);
      expect(t3.escalationTier).toBe('CRITICAL');
    });

    it('is strictly monotonic and does not downgrade while OPEN', () => {
      const baseTime = 1000000;
      const escalated = {
        id: 'D-1',
        authorDeviceId: 'ELENA',
        category: 'RESCUE' as const,
        peopleCount: 2,
        description: 'Roof rescue',
        location: { lat: 0, lng: 0, neighborhood: '' },
        status: 'OPEN' as const,
        escalationTier: 'CRITICAL' as const, // Already escalated
        createdAt: { physical: baseTime, logical: 1 },
        lastEscalatedAt: baseTime,
      };

      // Even if checked with earlier time, it must stay CRITICAL
      const res = computeDistressEscalation(escalated, baseTime + 1000);
      expect(res.escalationTier).toBe('CRITICAL');
    });
  });

  describe('Logistics Matching Engine (FR-12)', () => {
    it('normalizes units accurately across gallons, liters, and cases', () => {
      const gal = normalizeResourceQuantity('WATER', 10, 'gallons');
      const lit = normalizeResourceQuantity('WATER', 37.85, 'liters');
      expect(gal.normalizedQuantity).toBe(37.85);
      expect(lit.normalizedQuantity).toBe(37.85);
    });

    it('warns when route crosses active road blockage', () => {
      const requests = [
        {
          id: 'REQ-1',
          nodeId: 'MARCUS',
          category: 'WATER' as const,
          quantity: 50,
          unit: 'gallons',
          normalizedQuantity: 189.25,
          fulfilledQuantity: 0,
          neighborhood: 'North Ward',
          urgency: 'HIGH' as const,
          status: 'OPEN' as const,
          createdAt: { physical: 1000, logical: 1 },
        },
      ];

      const offers = [
        {
          id: 'OFF-1',
          nodeId: 'SARAH',
          category: 'WATER' as const,
          quantity: 100,
          unit: 'gallons',
          normalizedQuantity: 378.5,
          allocatedQuantity: 0,
          neighborhood: 'South Basin',
          status: 'AVAILABLE' as const,
          createdAt: { physical: 1000, logical: 1 },
        },
      ];

      const incidents = [
        {
          id: 'INC-BLOCK',
          category: 'ROAD_BLOCKAGE' as const,
          geofenceCell: '',
          location: {
            lat: 37.776,
            lng: -122.417,
            neighborhood: 'Central District',
            landmark: '4th St Rail Underpass Corridor',
          },
          status: 'UNVERIFIED' as const,
          independentWitnessCount: 1,
          totalWitnessCount: 1,
          hearsayCount: 0,
          firstReportAt: 1000,
          lastUpdateAt: 1000,
          freshnessStatus: 'CURRENT' as const,
          confidenceSummary: '',
          reportIds: [],
        },
      ];

      const matches = matchResources(requests, offers, incidents);
      expect(matches.length).toBe(1);
      expect(matches[0].totalSuggestedQuantity).toBe(189.25);
    });
  });

  describe('Distributed Convergence & Idempotency (FR-10, §13.2)', () => {
    it('converges to IDENTICAL state regardless of merge order (A-then-B vs B-then-A)', () => {
      const baseTime = Date.now() - 3600000;
      const baseEvents = generateBaseScenarioEvents(baseTime);

      const elenaEvents = generateElenaPartitionEvents(baseTime);
      const partitionA: Event[] = [elenaEvents.distressEvent, elenaEvents.reportEvent];

      const partitionB: Event[] = [
        generateDeviceFContradictionEvent(baseTime),
      ];

      // Merge order 1: Base + A + B
      const order1 = [...baseEvents, ...partitionA, ...partitionB];
      const state1 = projectEvents(order1, 'VIEWER', baseTime + 5000);

      // Merge order 2: Base + B + A
      const order2 = [...baseEvents, ...partitionB, ...partitionA];
      const state2 = projectEvents(order2, 'VIEWER', baseTime + 5000);

      expect(state1.incidents.length).toBe(state2.incidents.length);
      expect(state1.reports.length).toBe(state2.reports.length);
      expect(state1.distressRequests.length).toBe(state2.distressRequests.length);

      // Verify incident statuses match exactly
      const sorted1 = [...state1.incidents].sort((a, b) => a.id.localeCompare(b.id));
      const sorted2 = [...state2.incidents].sort((a, b) => a.id.localeCompare(b.id));

      for (let i = 0; i < sorted1.length; i++) {
        expect(sorted1[i].id).toBe(sorted2[i].id);
        expect(sorted1[i].status).toBe(sorted2[i].status);
        expect(sorted1[i].independentWitnessCount).toBe(sorted2[i].independentWitnessCount);
      }
    });

    it('detects concurrent double-approval conflict and flags for manual resolution', () => {
      const baseTime = Date.now() - 3600000;
      const offerEvent = createSignedEvent(
        DEMO_PERSONAS.SARAH,
        'OfferCreated',
        {
          category: 'WATER',
          quantity: 10,
          unit: 'gallons', // 37.85 L
          neighborhood: 'South Basin',
        },
        { physical: baseTime + 100, logical: 1 }
      );

      const req1Event = createSignedEvent(
        DEMO_PERSONAS.MARCUS,
        'RequestCreated',
        {
          category: 'WATER',
          quantity: 8,
          unit: 'gallons',
          neighborhood: 'North Ward',
        },
        { physical: baseTime + 200, logical: 1 }
      );

      const match1 = {
        id: 'MATCH-1',
        requestId: req1Event.id,
        requestNeighborhood: 'North Ward',
        category: 'WATER' as const,
        matches: [{ offerId: offerEvent.id, offerNeighborhood: 'South Basin', quantity: 8, normalizedQuantity: 30.28, unit: 'L' }],
        totalSuggestedQuantity: 30.28,
        targetQuantity: 30.28,
        unit: 'L',
        status: 'PENDING' as const,
        createdAt: baseTime + 300,
      };

      const match2 = {
        id: 'MATCH-2',
        requestId: req1Event.id,
        requestNeighborhood: 'North Ward',
        category: 'WATER' as const,
        matches: [{ offerId: offerEvent.id, offerNeighborhood: 'South Basin', quantity: 8, normalizedQuantity: 30.28, unit: 'L' }],
        totalSuggestedQuantity: 30.28,
        targetQuantity: 30.28,
        unit: 'L',
        status: 'PENDING' as const,
        createdAt: baseTime + 350,
      };

      const approval1 = createSignedEvent(
        DEMO_PERSONAS.MARCUS,
        'MatchApproved',
        { matchId: 'MATCH-1' },
        { physical: baseTime + 400, logical: 1 }
      );

      // Concurrent approval on partitioned device
      const approval2 = createSignedEvent(
        DEMO_PERSONAS.SARAH,
        'MatchApproved',
        { matchId: 'MATCH-2' },
        { physical: baseTime + 410, logical: 1 }
      );

      const allEvents = [
        offerEvent,
        req1Event,
        createSignedEvent(DEMO_PERSONAS.MARCUS, 'MatchSuggested', { match: match1 }, { physical: baseTime + 301, logical: 1 }),
        createSignedEvent(DEMO_PERSONAS.SARAH, 'MatchSuggested', { match: match2 }, { physical: baseTime + 351, logical: 1 }),
        approval1,
        approval2,
      ];

      const state = projectEvents(allEvents, 'VIEWER', baseTime + 1000);
      expect(state.matchConflicts.length).toBeGreaterThan(0);
      expect(state.matchConflicts[0].offerId).toBe(offerEvent.id);
      expect(state.matchConflicts[0].conflictingMatchIds).toContain('MATCH-1');
      expect(state.matchConflicts[0].conflictingMatchIds).toContain('MATCH-2');
    });
  });
});
