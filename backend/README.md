# Backend

The backend is an ES-module Node.js service using Express, Socket.IO, and Redis. Redis is required for message history and presence; startup fails if it is unavailable or authentication/configuration is invalid.

## Local setup

Use Node.js 22 or 24. Copy `.env.example` to `.env`, set `REDIS_PASSWORD` to match your Redis server, and set `GUEST_SESSION_SECRET` to a random value of at least 32 characters. For PowerShell, generate a secret with:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Install and run:

```powershell
npm install
npm start
```

Set up an authenticated local Redis server separately. The Docker Compose and container setup belongs to a later project phase.

## HTTP API

All responses use `{ "success": boolean, "data": object|null, "error": object|null }`.

- `GET /api/health` is a liveness check and does not depend on Redis.
- `GET /api/ready` checks Redis and returns 503 when it is unavailable.
- `POST /api/guest-session` accepts `{ "displayName": "Ada" }` and returns a signed, 12-hour guest session. The guest ID is server-generated; names are not verified identities.
- `GET /api/rooms` lists default and previously used rooms.
- `GET /api/rooms/:roomId/messages?limit=50` returns up to 100 messages in chronological order.

## Socket events

Pass the returned `sessionToken` as `io(url, { auth: { sessionToken } })`.

- `room:join`, payload `{ "roomId": "general" }`; acknowledgement returns `{ success, data: { roomId, messages, users } }`.
- `room:leave`, payload `{ "roomId": "general" }`; acknowledgement confirms the leave.
- `message:send`, payload `{ "roomId": "general", "content": "Hello", "clientMessageId": "<UUID>" }`; acknowledge with a Socket.IO timeout. The response includes the server message and whether it was a duplicate retry.
- `room:joined`, `room:left`, `message:new`, `presence:update`, and `system:error` are server events. `message:new` is emitted only after Redis confirms the bounded history write, and duplicate retries are acknowledged without rebroadcasting.

Messages are capped at the configured history limit (default 100) and duplicate client IDs are idempotent for 24 hours. Redis stores the latest messages and temporary presence; without Redis persistence, a Redis restart can lose message history. The Redis adapter distributes Socket.IO events across backend instances but does not store chat history. This guest chat is not end-to-end encrypted and does not guarantee durable message delivery.

## Tests

Run `npm test`. Unit and API tests run without Redis. Redis integration tests use an authenticated Redis server at `127.0.0.1:6389` by default and report a skip when it is unavailable. Override with `REDIS_TEST_HOST`, `REDIS_TEST_PORT`, and `REDIS_TEST_PASSWORD`.