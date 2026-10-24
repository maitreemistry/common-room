import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { guestSessionRequestSchema, messageHistoryQuerySchema, roomNameSchema } from '../validation/schemas.js';
import { createGuestSession } from '../services/guest-sessions.js';
import { apiError } from '../middleware/errors.js';

export function createApiRouter({ config, redisClients, messages, logger }) {
  const router = Router();
  const guestSessionLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  });

  router.get('/health', (_request, response) => {
    response.json({ success: true, data: { status: 'ok' }, error: null });
  });

  router.get('/ready', async (_request, response) => {
    try {
      await redisClients.ping();
      response.json({ success: true, data: { status: 'ready' }, error: null });
    } catch (error) {
      logger.warn({ err: error }, 'Readiness check failed');
      response.status(503).json({
        success: false,
        data: { status: 'not_ready' },
        error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'A required dependency is unavailable.' }
      });
    }
  });

  router.post('/guest-session', guestSessionLimiter, (request, response, next) => {
    const parsed = guestSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return next(apiError(400, 'INVALID_DISPLAY_NAME', 'Provide a display name between 2 and 30 valid characters.'));
    }
    const session = createGuestSession(parsed.data.displayName, config.guestSessionSecret);
    response.status(201).json({ success: true, data: session, error: null });
  });

  router.get('/rooms', async (_request, response, next) => {
    try {
      const rooms = await messages.listRooms();
      response.json({ success: true, data: { rooms }, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get('/rooms/:roomId/messages', async (request, response, next) => {
    const roomResult = roomNameSchema.safeParse(request.params.roomId);
    const queryResult = messageHistoryQuerySchema.safeParse(request.query);
    if (!roomResult.success) {
      return next(apiError(400, 'INVALID_ROOM', 'Room name must be between 1 and 40 valid characters.'));
    }
    if (!queryResult.success) {
      return next(apiError(400, 'INVALID_LIMIT', 'Limit must be an integer between 1 and 100.'));
    }

    try {
      const result = await messages.getRecent(roomResult.data, queryResult.data.limit);
      response.json({ success: true, data: { roomId: roomResult.data, messages: result }, error: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}