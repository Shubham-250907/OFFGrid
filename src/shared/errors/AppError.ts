export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class SignatureVerificationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'SIGNATURE_VERIFICATION_FAILED', details);
    this.name = 'SignatureVerificationError';
  }
}

export class IntegrityConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'INTEGRITY_CONFLICT', details);
    this.name = 'IntegrityConflictError';
  }
}

export class RateLimitExceededError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'RATE_LIMIT_EXCEEDED', details);
    this.name = 'RateLimitExceededError';
  }
}

export class MockLocationRejectedError extends AppError {
  constructor(message = 'Mock GPS location detected and rejected for broadcast') {
    super(message, 'MOCK_LOCATION_REJECTED');
    this.name = 'MockLocationRejectedError';
  }
}
