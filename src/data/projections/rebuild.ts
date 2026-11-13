import { DatabaseConnection } from '../database/connection';
import { IncidentRepository } from '../repositories/IncidentRepository';
import { VoteRepository } from '../repositories/VoteRepository';
import { SosRepository } from '../repositories/SosRepository';
import { TriageRepository } from '../repositories/TriageRepository';
import { ShelterRepository } from '../repositories/ShelterRepository';
import { ChatRepository } from '../repositories/ChatRepository';
import { calculateConfidenceScore } from '../../domain/algorithms/confidence';
import { calculateProximityWeight } from '../../domain/algorithms/proximity';
import { calculateTimeDecay } from '../../domain/algorithms/timeDecay';
import { LIMITS } from '../../shared/constants/config';

export class ProjectionRebuilder {
  private incidentRepo: IncidentRepository;
  private voteRepo: VoteRepository;
  private sosRepo: SosRepository;
  private triageRepo: TriageRepository;
  private shelterRepo: ShelterRepository;
  private chatRepo: ChatRepository;

  constructor(private db: DatabaseConnection) {
    this.incidentRepo = new IncidentRepository(db);
    this.voteRepo = new VoteRepository(db);
    this.sosRepo = new SosRepository(db);
    this.triageRepo = new TriageRepository(db);
    this.shelterRepo = new ShelterRepository(db);
    this.chatRepo = new ChatRepository(db);
  }

  async rebuildAllProjections(watermark = Date.now()): Promise<number> {
    return this.db.transaction(async (tx) => {
      // 1. Clear all projection tables
      await tx.execute('DELETE FROM chat_messages;');
      await tx.execute('DELETE FROM shelter_updates;');
      await tx.execute('DELETE FROM shelters;');
      await tx.execute('DELETE FROM triage_requests;');
      await tx.execute('DELETE FROM sos_requests;');
      await tx.execute('DELETE FROM votes;');
      await tx.execute('DELETE FROM incidents;');

      // 2. Fetch all valid events ordered chronologically
      const events = await tx.query<any>(
        `SELECT * FROM events WHERE validation_status = 'VALID' ORDER BY author_timestamp ASC, event_id ASC;`
      );

      for (const ev of events) {
        const payload = JSON.parse(ev.payload_json);

        switch (ev.event_type) {
          case 'INCIDENT':
            await this.incidentRepo.projectIncident(payload, ev.event_id, tx);
            break;

          case 'VOTE': {
            await this.voteRepo.recordVote(
              payload,
              ev.event_id,
              ev.author_public_key,
              ev.author_timestamp,
              tx
            );

            // Recompute confidence score for the incident
            const incident = await this.incidentRepo.getIncidentById(payload.incidentId, tx);
            if (incident) {
              const effectiveVotes = await this.voteRepo.getEffectiveVotesForIncident(
                payload.incidentId,
                tx
              );

              const voteEvidence = effectiveVotes.map((v: any) => {
                const prox = calculateProximityWeight(
                  { latitude: incident.latitude, longitude: incident.longitude, accuracyM: incident.accuracyM, isMock: false },
                  { latitude: v.latitude, longitude: v.longitude, accuracyM: v.accuracyM, isMock: false }
                );
                const decay = calculateTimeDecay(v.authorTimestamp, watermark, LIMITS.INCIDENT_HALF_LIFE_HOURS);
                return {
                  voterPublicKey: v.voterPublicKey,
                  voteType: v.voteType,
                  proximityWeight: prox,
                  timeDecay: decay
                };
              });

              const evaluation = calculateConfidenceScore(voteEvidence);
              await this.incidentRepo.updateConfidence(
                payload.incidentId,
                evaluation.score,
                evaluation.badge,
                tx
              );
            }
            break;
          }

          case 'SOS':
            await this.sosRepo.projectSos(payload, ev.event_id, tx);
            break;

          case 'SOS_UPDATE':
            await this.sosRepo.resolveSos(payload, ev.event_id, tx);
            break;

          case 'TRIAGE':
            await this.triageRepo.projectTriage(payload, ev.event_id, tx);
            break;

          case 'SHELTER':
            await this.shelterRepo.projectShelter(payload, ev.event_id, tx);
            break;

          case 'SHELTER_UPDATE':
            await this.shelterRepo.projectShelterUpdate(
              payload,
              ev.event_id,
              ev.author_public_key,
              ev.author_timestamp,
              tx
            );
            break;

          case 'CHAT':
            await this.chatRepo.projectChat(payload, ev.event_id, tx);
            break;
        }
      }

      return events.length;
    });
  }
}
