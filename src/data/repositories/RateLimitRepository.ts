import { DatabaseConnection } from '../database/connection';
import { LIMITS } from '../../shared/constants/config';
import { RateLimitExceededError } from '../../shared/errors/AppError';

export class RateLimitRepository {
  constructor(private db: DatabaseConnection) {}

  async checkAndIncrement(
    publicKey: string,
    actionType: string,
    now = Date.now(),
    windowMs = LIMITS.RATE_LIMIT_WINDOW_MS,
    maxActions = 1,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;

    const rows = await conn.query<any>(
      `SELECT window_started_at, action_count FROM rate_limits WHERE public_key = ? AND action_type = ?;`,
      [publicKey, actionType]
    );

    if (rows.length === 0) {
      await conn.execute(
        `INSERT INTO rate_limits (public_key, action_type, window_started_at, action_count) VALUES (?, ?, ?, 1);`,
        [publicKey, actionType, now]
      );
      return;
    }

    const current = rows[0]!;
    if (now - current.window_started_at > windowMs) {
      // Window has elapsed, reset counter
      await conn.execute(
        `UPDATE rate_limits SET window_started_at = ?, action_count = 1 WHERE public_key = ? AND action_type = ?;`,
        [now, publicKey, actionType]
      );
    } else {
      // Within window
      if (current.action_count >= maxActions) {
        const remainingMs = windowMs - (now - current.window_started_at);
        throw new RateLimitExceededError(
          `Rate limit exceeded for action ${actionType}. Cooldown remaining: ${Math.ceil(remainingMs / 1000)}s`
        );
      }
      await conn.execute(
        `UPDATE rate_limits SET action_count = action_count + 1 WHERE public_key = ? AND action_type = ?;`,
        [publicKey, actionType]
      );
    }
  }
}
