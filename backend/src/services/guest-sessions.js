import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { displayNameSchema } from '../validation/schemas.js';

const SESSION_LIFETIME_SECONDS = 60 * 60 * 12;

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createGuestSession(displayNameInput, secret, now = Date.now()) {
  const displayName = displayNameSchema.parse(displayNameInput);
  const userId = randomUUID();
  const payload = Buffer.from(JSON.stringify({
    userId,
    displayName,
    expiresAt: Math.floor(now / 1000) + SESSION_LIFETIME_SECONDS
  })).toString('base64url');

  return {
    userId,
    displayName,
    token: `${payload}.${signature(payload, secret)}`,
    expiresIn: SESSION_LIFETIME_SECONDS
  };
}

export function verifyGuestSession(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [payload, providedSignature, extra] = token.split('.');
  if (!payload || !providedSignature || extra !== undefined) return null;

  const expectedSignature = Buffer.from(signature(payload, secret));
  const actualSignature = Buffer.from(providedSignature);
  if (expectedSignature.length !== actualSignature.length || !timingSafeEqual(expectedSignature, actualSignature)) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.expiresAt <= Math.floor(now / 1000)) return null;
    return {
      userId: data.userId,
      displayName: displayNameSchema.parse(data.displayName)
    };
  } catch {
    return null;
  }
}