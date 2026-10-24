import { useState } from 'react';
import { ArrowUpRight, Hash, Plus, X } from 'lucide-react';
import OnlineUsers from './OnlineUsers.jsx';

const defaults = ['general', 'random', 'help'];

export default function RoomSidebar({
  rooms,
  currentRoom,
  users,
  currentUserId,
  displayName,
  changingRoom,
  onJoinRoom,
  onLeave,
  onClose
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newRoom, setNewRoom] = useState('');

  const joinCustomRoom = async (event) => {
    event.preventDefault();
    const roomId = newRoom.trim().toLowerCase();
    if (!roomId || roomId.length > 40 || /[\u0000-\u001f\u007f]/u.test(roomId)) return;
    try {
      await onJoinRoom(roomId);
      setNewRoom('');
      setCreateOpen(false);
      onClose?.();
    } catch {
      return;
    }
  };

  return (
    <>
      <button className="sidebar-scrim" aria-label="Close room menu" onClick={onClose} tabIndex={-1} />
      <aside className="room-sidebar" aria-label="Chat navigation">
        <div className="sidebar-brand-row">
          <a className="wordmark sidebar-wordmark" href="#chat" aria-label="Commonroom">
            <span className="brand-glyph" aria-hidden="true"><i /><i /><i /></span>
            commonroom
          </a>
          <button className="icon-button mobile-close" onClick={onClose} aria-label="Close room menu"><X size={18} /></button>
        </div>

        <div className="sidebar-room-block">
          <div className="sidebar-section-heading room-heading"><h2>Your rooms</h2><span className="room-count">{rooms.length}</span></div>
          <nav aria-label="Rooms">
            <ul className="room-list">
              {[...new Set([...defaults, ...rooms])].map((room) => (
                <li key={room}>
                  <button
                    className={`room-link ${currentRoom === room ? 'is-current' : ''}`}
                    onClick={() => { void onJoinRoom(room).catch(() => {}); onClose?.(); }}
                    disabled={changingRoom}
                    aria-current={currentRoom === room ? 'page' : undefined}
                  >
                    <Hash size={15} aria-hidden="true" /><span>{room}</span>
                    {currentRoom === room && <span className="room-live-dot" aria-label="Current room" />}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {createOpen ? (
            <form className="sidebar-create-form" onSubmit={joinCustomRoom}>
              <label className="visually-hidden" htmlFor="sidebar-room-name">Room name</label>
              <Hash size={14} aria-hidden="true" />
              <input id="sidebar-room-name" value={newRoom} maxLength={40} placeholder="room-name" onChange={(event) => setNewRoom(event.target.value)} autoFocus />
              <button type="submit" aria-label="Join room" disabled={!newRoom.trim() || changingRoom}><ArrowUpRight size={15} /></button>
            </form>
          ) : (
            <button className="add-room-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Add a room</button>
          )}
        </div>

        <OnlineUsers users={users} currentUserId={currentUserId} />

        <div className="sidebar-profile">
          <span className="profile-avatar">{displayName?.slice(0, 1).toUpperCase() || '?'}</span>
          <span className="profile-copy"><strong>{displayName || 'Guest session'}</strong><small>Identity not verified</small></span>
          <button className="profile-exit" onClick={onLeave} title="Leave room and change guest name" aria-label="Leave and change guest name"><ArrowUpRight size={16} /></button>
        </div>
      </aside>
    </>
  );
}