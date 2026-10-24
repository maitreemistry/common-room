import { io } from 'socket.io-client';

export function createChatSocket(sessionToken, socketFactory = io) {
  const origin = import.meta.env.VITE_SOCKET_URL || window.location.origin;
  return socketFactory(origin, {
    auth: { sessionToken },
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000
  });
}

export function emitWithAcknowledgement(socket, eventName, payload, timeoutMs = 5000) {
  return socket.timeout(timeoutMs).emitWithAck(eventName, payload);
}

export function createClientMessageId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}