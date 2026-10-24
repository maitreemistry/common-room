import { useEffect, useState } from 'react';
import ChatLayout from './components/ChatLayout.jsx';
import JoinScreen from './components/JoinScreen.jsx';
import { createGuestSession, fetchRooms } from './services/chatApi.js';

const defaultRooms = ['general', 'random', 'help'];
const SESSION_KEY = 'commonroom.guest';
const ROOM_KEY = 'commonroom.room';

function restoreGuest() {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState(restoreGuest);
  const [initialRoom, setInitialRoom] = useState(() => sessionStorage.getItem(ROOM_KEY) || 'general');
  const [rooms, setRooms] = useState(defaultRooms);
  const [joining, setJoining] = useState(false);
  const [entryError, setEntryError] = useState('');

  useEffect(() => {
    let active = true;
    fetchRooms().then((availableRooms) => {
      if (active) setRooms([...new Set([...defaultRooms, ...availableRooms])]);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const join = async ({ displayName, roomId }) => {
    setJoining(true);
    setEntryError('');
    try {
      const guest = await createGuestSession(displayName);
      const nextSession = { ...guest, displayName };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      sessionStorage.setItem(ROOM_KEY, roomId);
      setInitialRoom(roomId);
      setSession(nextSession);
    } catch (error) {
      setEntryError(error.message);
    } finally {
      setJoining(false);
    }
  };

  const leave = () => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ROOM_KEY);
    setSession(null);
    setInitialRoom('general');
  };

  if (!session?.sessionToken) {
    return <JoinScreen rooms={rooms} onJoin={join} busy={joining} error={entryError} />;
  }

  return <ChatLayout key={session.sessionToken} session={session} initialRoom={initialRoom} rooms={rooms} onLeave={leave} />;
}