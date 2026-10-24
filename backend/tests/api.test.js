import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/utils/logger.js';

const config = {
  nodeEnv: 'test',
  guestSessionSecret: 'test-secret-with-at-least-thirty-two-characters'
};

function createTestServer({ ping = vi.fn().mockResolvedValue('PONG') } = {}) {
  const app = createApp({
    config,
    redisClients: { ping },
    messages: {
      listRooms: vi.fn().mockResolvedValue(['general', 'random']),
      getRecent: vi.fn().mockResolvedValue([{ id: 'message-1' }])
    },
    logger: createLogger('test')
  });
  return createServer(app);
}

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe('HTTP API', () => {
  it('reports liveness independently of Redis', async () => {
    const server = createTestServer();
    servers.push(server);
    const response = await request(server).get('/api/health').expect(200);
    expect(response.body).toEqual({ success: true, data: { status: 'ok' }, error: null });
  });

  it('reports readiness as unavailable when Redis is down', async () => {
    const server = createTestServer({ ping: vi.fn().mockRejectedValue(new Error('private redis detail')) });
    servers.push(server);
    const response = await request(server).get('/api/ready').expect(503);
    expect(response.body.error).toEqual({ code: 'DEPENDENCY_UNAVAILABLE', message: 'A required dependency is unavailable.' });
    expect(JSON.stringify(response.body)).not.toContain('private redis detail');
  });

  it('reports ready when Redis responds', async () => {
    const server = createTestServer();
    servers.push(server);
    await request(server).get('/api/ready').expect(200, {
      success: true, data: { status: 'ready' }, error: null
    });
  });

  it('lists rooms and returns bounded message history', async () => {
    const server = createTestServer();
    servers.push(server);
    await request(server).get('/api/rooms').expect(200, {
      success: true, data: { rooms: ['general', 'random'] }, error: null
    });
    const response = await request(server).get('/api/rooms/General/messages?limit=5').expect(200);
    expect(response.body.data).toEqual({ roomId: 'general', messages: [{ id: 'message-1' }] });
  });

  it('rejects invalid rooms and history limits safely', async () => {
    const server = createTestServer();
    servers.push(server);
    await request(server).get('/api/rooms/%00/messages').expect(400);
    const response = await request(server).get('/api/rooms/general/messages?limit=101').expect(400);
    expect(response.body.error.code).toBe('INVALID_LIMIT');
  });

  it('issues a signed guest identity after validating the display name', async () => {
    const server = createTestServer();
    servers.push(server);
    const response = await request(server).post('/api/guest-session').send({ displayName: '  Ada  ' }).expect(201);
    expect(response.body.data).toMatchObject({ displayName: 'Ada', expiresIn: 43200 });
    expect(response.body.data.userId).toBeTruthy();
    await request(server).post('/api/guest-session').send({ displayName: 'A' }).expect(400);
  });

  it('returns safe JSON errors for malformed and oversized request bodies', async () => {
    const server = createTestServer();
    servers.push(server);
    const malformed = await request(server).post('/api/guest-session').set('Content-Type', 'application/json').send('{bad');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');
  });
});