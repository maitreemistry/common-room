import { useEffect, useState } from 'react';
import { Hash, Menu, Users } from 'lucide-react';
import { useChat } from '../hooks/useChat.js';
import ConnectionStatus from './ConnectionStatus.jsx';
import MessageComposer from './MessageComposer.jsx';
import MessageList from './MessageList.jsx';
import RoomSidebar from './RoomSidebar.jsx';
import Toast from './Toast.jsx';

export default function ChatLayout({ session, initialRoom, rooms, onLeave }) {
  const chat = useChat(session, initialRoom);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roomLoading, setRoomLoading] = useState(true);

  useEffect(() => {
    if (chat.roomId) setRoomLoading(false);
    else if (!chat.switchingRoom && chat.connection === 'connected') setRoomLoading(false);
  }, [chat.roomId, chat.switchingRoom, chat.connection]);

  const exit = async () => {
    try {
      await chat.leaveRoom();
    } finally {
      onLeave();
    }
  };

  const joinedRoom = chat.roomId ?? initialRoom;

  return (
    <main className="chat-shell">
      <RoomSidebar
        rooms={rooms}
        currentRoom={chat.roomId}
        users={chat.users}
        currentUserId={session.userId}
        displayName={session.displayName}
        changingRoom={chat.switchingRoom}
        onJoinRoom={(roomId) => chat.joinRoom(roomId)}
        onLeave={exit}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="chat-main">
        <header className="chat-topbar">
          <button className="icon-button mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open room menu" aria-expanded={mobileMenuOpen}><Menu size={19} /></button>
          <div className="breadcrumbs"><span>ROOMS</span><b>/</b><strong>{joinedRoom}</strong></div>
          <div className="topbar-right">
            <span className="online-summary"><Users size={15} /> {chat.users.length} here</span>
            <ConnectionStatus status={chat.connection} />
          </div>
        </header>

        <div className="room-heading-main">
          <div className="room-heading-title">
            <span className="room-heading-icon"><Hash size={19} /></span>
            <div><h1>{joinedRoom}</h1><p>A shared room for thoughts, questions, and good ideas.</p></div>
          </div>
          <div className="room-heading-count"><span className="live-dot" /> {chat.users.length} {chat.users.length === 1 ? 'person' : 'people'} here</div>
        </div>

        <MessageList messages={chat.messages} currentUserId={session.userId} loading={roomLoading} roomId={joinedRoom} />
        <MessageComposer roomId={joinedRoom} onSend={chat.sendMessage} disabled={chat.connection !== 'connected' || !chat.roomId || chat.switchingRoom} connection={chat.connection} />
        <Toast toast={chat.toast} onDismiss={chat.dismissToast} />
      </section>

    </main>
  );
}