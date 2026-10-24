import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGuestSession, fetchRooms } from './chatApi.js';

afterEach(() => vi.unstubAllGlobals());

describe('chat API adapter', () => {
  it('maps the backend guest token to the Socket.IO session token field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { userId: 'guest-1', displayName: 'Ada', token: 'signed-token', expiresIn: 43200 },
        error: null
      })
    }));
    await expect(createGuestSession('Ada')).resolves.toMatchObject({
      userId: 'guest-1',
      token: 'signed-token',
      sessionToken: 'signed-token'
    });
    expect(fetch).toHaveBeenCalledWith('/api/guest-session', expect.objectContaining({ method: 'POST' }));
  });

  it('reads the room list from the backend envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { rooms: ['general', 'design'] }, error: null })
    }));
    await expect(fetchRooms()).resolves.toEqual(['general', 'design']);
  });
});