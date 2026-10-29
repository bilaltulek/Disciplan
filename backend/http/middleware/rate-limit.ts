const crypto = require('crypto');
const db = require('../../db');
const config = require('../../config.env');

const hashKey = (value: any) => crypto.createHmac('sha256', config.jwtSecret).update(String(value)).digest('hex');

const createRateLimiter = ({ scope, limit, windowMs, key = (req: any) => req.user?.id || req.ip }: any) => async (req: any, res: any, next: any) => {
  try {
    const rawKey = key(req);
    if (!rawKey) return res.status(400).json({ error: 'Unable to identify request source.', code: 'RATE_LIMIT_KEY_MISSING' });
    const bucketMs = Math.floor(Date.now() / windowMs) * windowMs;
    const bucketStart = new Date(bucketMs);
    const result = await db.query(
      `INSERT INTO api_rate_limits (scope, key_hash, bucket_start, request_count, expires_at)
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (scope, key_hash, bucket_start)
       DO UPDATE SET request_count = api_rate_limits.request_count + 1
       RETURNING request_count`,
      [scope, hashKey(rawKey), bucketStart, new Date(bucketMs + windowMs * 2)],
    );
    const count = Number(result.rows[0]?.request_count || 0);
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil((bucketMs + windowMs) / 1000)));
    if (count > limit) return res.status(429).json({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' });
    return next();
  } catch (error: any) {
    return next(error);
  }
};

const authRateLimit = createRateLimiter({ scope: 'auth', limit: 10, windowMs: 15 * 60_000 });
const agentRateLimit = createRateLimiter({ scope: 'agent_command', limit: 30, windowMs: 60 * 60_000 });

export = { agentRateLimit, authRateLimit, createRateLimiter, hashKey };
