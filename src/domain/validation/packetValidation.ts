import {
  IncidentPayload,
  VotePayload,
  SOSPayload,
  TriagePayload,
  ShelterPayload,
  ChatPayload
} from '../../mesh/protocol/contracts';
import { LIMITS } from '../../shared/constants/config';
import { ValidationError } from '../../shared/errors/AppError';

export function validateIncidentPayload(payload: IncidentPayload): void {
  if (!payload.incidentId) {
    throw new ValidationError('Incident missing incidentId');
  }
  if (!payload.description || payload.description.length > LIMITS.MAX_DESCRIPTION_CHARS) {
    throw new ValidationError(
      `Description must be between 1 and ${LIMITS.MAX_DESCRIPTION_CHARS} characters`
    );
  }
  if (payload.severity < 1 || payload.severity > 5) {
    throw new ValidationError('Severity must be between 1 and 5');
  }
  if (typeof payload.latitude !== 'number' || typeof payload.longitude !== 'number') {
    throw new ValidationError('Coordinates must be numeric');
  }
}

export function validateVotePayload(payload: VotePayload): void {
  if (!payload.voteId || !payload.incidentId) {
    throw new ValidationError('Vote missing voteId or incidentId');
  }
  if (payload.voteType !== 'CONFIRM' && payload.voteType !== 'DISPUTE') {
    throw new ValidationError(`Invalid voteType: ${payload.voteType}`);
  }
}

export function validateSOSPayload(payload: SOSPayload): void {
  if (!payload.sosId) {
    throw new ValidationError('SOS missing sosId');
  }
  if (payload.batteryLevel < 0 || payload.batteryLevel > 100) {
    throw new ValidationError('Battery level must be between 0 and 100');
  }
  if (payload.headcount < 1) {
    throw new ValidationError('Headcount must be at least 1');
  }
  if (payload.message && payload.message.length > LIMITS.MAX_SOS_MESSAGE_CHARS) {
    throw new ValidationError(
      `SOS message cannot exceed ${LIMITS.MAX_SOS_MESSAGE_CHARS} characters`
    );
  }
}

export function validateTriagePayload(payload: TriagePayload): void {
  if (!payload.triageId) {
    throw new ValidationError('Triage missing triageId');
  }
  if (
    payload.headcount < LIMITS.MIN_TRIAGE_HEADCOUNT ||
    payload.headcount > LIMITS.MAX_TRIAGE_HEADCOUNT
  ) {
    throw new ValidationError(
      `Headcount must be between ${LIMITS.MIN_TRIAGE_HEADCOUNT} and ${LIMITS.MAX_TRIAGE_HEADCOUNT}`
    );
  }
  if (payload.description && payload.description.length > LIMITS.MAX_DESCRIPTION_CHARS) {
    throw new ValidationError(
      `Description cannot exceed ${LIMITS.MAX_DESCRIPTION_CHARS} characters`
    );
  }
}

export function validateShelterPayload(payload: ShelterPayload): void {
  if (!payload.shelterId) {
    throw new ValidationError('Shelter missing shelterId');
  }
  if (!payload.name || payload.name.length > LIMITS.MAX_SHELTER_NAME_CHARS) {
    throw new ValidationError(
      `Shelter name must be between 1 and ${LIMITS.MAX_SHELTER_NAME_CHARS} characters`
    );
  }
  if (payload.capacity !== undefined && payload.capacity < 0) {
    throw new ValidationError('Shelter capacity cannot be negative');
  }
}

export function validateChatPayload(payload: ChatPayload): void {
  if (!payload.messageId || !payload.text) {
    throw new ValidationError('Chat message missing id or text');
  }
  if (payload.text.length > LIMITS.MAX_CHAT_TEXT_CHARS) {
    throw new ValidationError(
      `Chat message exceeds ${LIMITS.MAX_CHAT_TEXT_CHARS} characters`
    );
  }
}
