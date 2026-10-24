import { describe, expect, it } from 'vitest';
import { createGuestSession, verifyGuestSession } from '../src/services/guest-sessions.js';

const secret = 'test-secret-with-at-least-thirty-two-characters';

describe('guest sessions', () => {
  it('issues a signed identity and verifies it', () => {
    const session = createGuestSession('  Ada  ', secret, 1_000_000);
    expect(session.displayName).toBe('Ada');
    expect(verifyGuestSession(session.token, secret, 1_000_000)).toMatchObject({
      userId: session.userId,
      displayName: 'Ada'
    });
  });

  it('rejects modified, expired, and differently signed tokens', () => {
    const session = createGuestSession('Ada', secret, 1_000_000);
    expect(verifyGuestSession(`${session.token}x`, secret, 1_000_000)).toBeNull();
    expect(verifyGuestSession(session.token, 'other-secret-with-at-least-thirty-two-characters', 1_000_000)).toBeNull();
    expect(verifyGuestSession(session.token, secret, 1_000_000 + session.expiresIn * 1000)).toBeNull();
  });
});