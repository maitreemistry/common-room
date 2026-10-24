import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChat } from './useChat.js';

class FakeSocket {
  constructor() {
    this.connected = false;
    this.listeners = new Map();
    this.events = [];
  }

  on(eventName, listener) {
    const listeners = this.listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
    return this;
  }

  removeAllListeners() { this.listeners.clear(); }

  connect() {
    this.connected = true;
    this.dispatch('connect');
  }

  disconnect() {
    this.connected = false;
    this.dispatch('disconnect', 'io client disconnect');
  }

  dispatch(eventName, payload) {
    for (const listener of this.listeners.get(eventName) ?? []) listener(payload);
  }

  timeout() { return this; }

  emitWithAck(eventName, payload) {
    this.events.push({ eventName, payload });
    if (eventName === 'room:join') {
      return Promise.resolve({ success: true, data: { roomId: payload.roomId, messages: [], users: [] } });
    }
    if (eventName === 'message:send') {
      const message = {
        id: 'server-message-1',
        ...payload,
        senderId: 'guest-1',
        senderName: 'Alex',
        timestamp: '2026-10-24T12:00:00.000Z'
      };
      this.dispatch('message:new', message);
      return Promise.resolve({ success: true, data: { message, duplicate: false } });
    }
    if (eventName === 'room:leave') return Promise.resolve({ success: true, data: { roomId: payload.roomId } });
    return Promise.resolve({ success: false, error: { message: 'Unknown event' } });
  }
}

describe('useChat backend contract', () => {
  it('joins through the backend event contract and reconciles message acknowledgement with broadcast', async () => {
    const socket = new FakeSocket();
    const socketFactory = vi.fn(() => socket);
    const session = { userId: 'guest-1', sessionToken: 'signed-session' };
    const { result } = renderHook(() => useChat(session, 'general', { socketFactory }));

    await waitFor(() => expect(result.current.roomId).toBe('general'));
    expect(socketFactory).toHaveBeenCalledWith(window.location.origin, expect.objectContaining({
      auth: { sessionToken: 'signed-session' },
      autoConnect: false
    }));
    expect(socket.events[0]).toEqual({ eventName: 'room:join', payload: { roomId: 'general' } });

    await act(async () => {
      await result.current.sendMessage('Hello room', 'a8e5298a-a36e-4d5c-a6ad-6102d94ea616');
    });
    expect(socket.events[1]).toEqual({
      eventName: 'message:send',
      payload: {
        roomId: 'general',
        content: 'Hello room',
        clientMessageId: 'a8e5298a-a36e-4d5c-a6ad-6102d94ea616'
      }
    });
    expect(result.current.messages).toHaveLength(1);

    await act(async () => { await result.current.joinRoom('random'); });
    expect(socket.events.at(-1)).toEqual({ eventName: 'room:join', payload: { roomId: 'random' } });
    expect(result.current.roomId).toBe('random');
  });

  it('updates room presence only from the matching room event', async () => {
    const socket = new FakeSocket();
    const socketFactory = () => socket;
    const { result } = renderHook(() => useChat(
      { userId: 'guest-1', sessionToken: 'signed-session' },
      'general',
      { socketFactory }
    ));
    await waitFor(() => expect(result.current.roomId).toBe('general'));
    act(() => socket.dispatch('presence:update', {
      roomId: 'random',
      users: [{ userId: 'other', displayName: 'Jamie' }],
      count: 1
    }));
    expect(result.current.users).toEqual([]);
    act(() => socket.dispatch('presence:update', {
      roomId: 'general',
      users: [{ userId: 'other', displayName: 'Jamie' }],
      count: 1
    }));
    expect(result.current.users).toEqual([{ userId: 'other', displayName: 'Jamie' }]);
  });
});