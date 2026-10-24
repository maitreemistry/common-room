const APP_ROOMS = ['general', 'random', 'help'];
const KNOWN_ROOMS_KEY = 'chat:rooms';

const APPEND_MESSAGE_SCRIPT = `
local existing = redis.call('GET', KEYS[2])
if existing then
  return { existing, 0 }
end
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[3])
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], -tonumber(ARGV[2]), -1)
redis.call('SADD', KEYS[3], ARGV[4])
return { ARGV[1], 1 }
`;

export function roomRedisKey(roomId) {
  return `chat:room:${Buffer.from(roomId, 'utf8').toString('base64url')}:messages`;
}

export function createMessageRepository(redis, historyLimit = 100) {
  return {
    async registerRoom(roomId) {
      await redis.sadd(KNOWN_ROOMS_KEY, roomId);
    },
    async append(message) {
      const roomKey = roomRedisKey(message.roomId);
      const dedupeKey = `${roomKey}:client:${message.senderId}:${message.clientMessageId}`;
      const result = await redis.eval(
        APPEND_MESSAGE_SCRIPT,
        3,
        roomKey,
        dedupeKey,
        KNOWN_ROOMS_KEY,
        JSON.stringify(message),
        String(historyLimit),
        '86400',
        message.roomId
      );
      return { message: JSON.parse(result[0]), created: result[1] === 1 };
    },
    async getRecent(roomId, limit = 50) {
      const entries = await redis.lrange(roomRedisKey(roomId), -limit, -1);
      return entries.map((entry) => JSON.parse(entry));
    },
    async listRooms() {
      const knownRooms = await redis.smembers(KNOWN_ROOMS_KEY);
      return [...new Set([...APP_ROOMS, ...knownRooms])].sort((left, right) => left.localeCompare(right));
    }
  };
}

export { APP_ROOMS };