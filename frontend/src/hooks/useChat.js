import { useEffect, useRef, useState } from 'react';
import { createChatSocket, emitWithAcknowledgement } from '../services/chatSocket.js';

function mergeMessage(current, incoming) {
  if (current.some((message) => message.id === incoming.id || (
    incoming.clientMessageId && message.clientMessageId === incoming.clientMessageId
  ))) return current;
  return [...current, incoming].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export function useChat(session, initialRoom, options = {}) {
  const [connection, setConnection] = useState('connecting');
  const [roomId, setRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [switchingRoom, setSwitchingRoom] = useState(false);
  const [toast, setToast] = useState(null);
  const socketRef = useRef(null);
  const roomRef = useRef(null);
  const desiredRoomRef = useRef(initialRoom);
  const joinRoomRef = useRef(null);

  useEffect(() => {
    if (!session?.sessionToken) return undefined;

    const socket = createChatSocket(session.sessionToken, options.socketFactory);
    socketRef.current = socket;

    const joinRoom = async (nextRoomId) => {
      const normalizedRoom = nextRoomId.trim().toLowerCase();
      if (!normalizedRoom) return;
      desiredRoomRef.current = normalizedRoom;
      setSwitchingRoom(true);
      try {
        const result = await emitWithAcknowledgement(socket, 'room:join', { roomId: normalizedRoom });
        if (!result.success) throw new Error(result.error?.message ?? 'Unable to join this room.');
        roomRef.current = result.data.roomId;
        setRoomId(result.data.roomId);
        setMessages(result.data.messages);
        setUsers(result.data.users);
        setToast(null);
        return result.data;
      } catch (error) {
        roomRef.current = null;
        setRoomId(null);
        setMessages([]);
        setUsers([]);
        setToast({ kind: 'error', message: error.message || 'Room change was not confirmed. Retry when connected.' });
        throw error;
      } finally {
        setSwitchingRoom(false);
      }
    };
    joinRoomRef.current = joinRoom;

    const handleConnect = () => {
      setConnection('connected');
      const desiredRoom = desiredRoomRef.current;
      if (desiredRoom) joinRoomRef.current?.(desiredRoom).catch(() => {});
    };
    const handleDisconnect = () => setConnection('reconnecting');
    const handleConnectError = () => {
      setConnection('reconnecting');
      setToast({ kind: 'error', message: 'Connection interrupted. Reconnecting automatically…' });
    };
    const handleMessage = (message) => {
      if (message.roomId === roomRef.current) {
        setMessages((current) => mergeMessage(current, message));
      }
    };
    const handlePresence = (presence) => {
      if (presence.roomId === roomRef.current) setUsers(presence.users);
    };
    const handleRoomLeft = ({ roomId: leftRoomId }) => {
      if (roomRef.current === leftRoomId) {
        roomRef.current = null;
        setRoomId(null);
        setMessages([]);
        setUsers([]);
      }
    };
    const handleSystemError = (error) => {
      setToast({ kind: 'error', message: error.message ?? 'The chat request could not be completed.' });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleMessage);
    socket.on('presence:update', handlePresence);
    socket.on('room:left', handleRoomLeft);
    socket.on('system:error', handleSystemError);
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      roomRef.current = null;
    };
  }, [session?.sessionToken, options.socketFactory]);

  const joinRoom = (nextRoomId) => joinRoomRef.current?.(nextRoomId);

  const leaveRoom = async () => {
    const socket = socketRef.current;
    const currentRoom = roomRef.current;
    if (!socket || !currentRoom) return;
    try {
      const result = await emitWithAcknowledgement(socket, 'room:leave', { roomId: currentRoom });
      if (!result.success) throw new Error(result.error?.message ?? 'Unable to leave this room.');
      roomRef.current = null;
      desiredRoomRef.current = null;
      setRoomId(null);
      setMessages([]);
      setUsers([]);
      return result.data;
    } catch (error) {
      setToast({ kind: 'error', message: error.message || 'Unable to leave this room right now.' });
      throw error;
    }
  };

  const sendMessage = async (content, clientMessageId) => {
    const socket = socketRef.current;
    const currentRoom = roomRef.current;
    if (!socket?.connected || !currentRoom) throw new Error('Reconnect and join a room before sending.');
    const result = await emitWithAcknowledgement(socket, 'message:send', {
      roomId: currentRoom,
      content,
      clientMessageId
    });
    if (!result.success) throw new Error(result.error?.message ?? 'Message was not sent.');
    setMessages((current) => mergeMessage(current, result.data.message));
    return result.data;
  };

  return {
    connection,
    roomId,
    messages,
    users,
    switchingRoom,
    toast,
    joinRoom,
    leaveRoom,
    sendMessage,
    dismissToast: () => setToast(null)
  };
}