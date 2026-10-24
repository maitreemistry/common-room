import { useEffect, useRef, useState } from 'react';
import { ArrowDown, MessageCircle } from 'lucide-react';

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function MessageItem({ message, mine, index }) {
  const initial = message.senderName?.slice(0, 1).toUpperCase() || '?';
  return (
    <article className={`message-row ${mine ? 'message-mine' : ''}`} style={{ '--message-index': Math.min(index, 8) }}>
      {!mine && <span className="message-avatar" aria-hidden="true">{initial}</span>}
      <div className="message-column">
        <div className="message-meta">
          <span className="message-sender">{mine ? 'You' : message.senderName}</span>
          <time dateTime={message.timestamp}>{formatTime(message.timestamp)}</time>
        </div>
        <p className="message-bubble">{message.content}</p>
      </div>
    </article>
  );
}

export default function MessageList({ messages, currentUserId, loading, roomId }) {
  const scrollArea = useRef(null);
  const nearBottom = useRef(true);
  const [showLatest, setShowLatest] = useState(false);

  useEffect(() => {
    const element = scrollArea.current;
    if (!element) return;
    if (nearBottom.current) {
      element.scrollTop = element.scrollHeight;
      setShowLatest(false);
    } else if (messages.length > 0) {
      setShowLatest(true);
    }
  }, [messages]);

  const updateScrollPosition = () => {
    const element = scrollArea.current;
    if (!element) return;
    nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    if (nearBottom.current) setShowLatest(false);
  };

  const scrollToLatest = () => {
    const element = scrollArea.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    nearBottom.current = true;
    setShowLatest(false);
  };

  return (
    <section className="message-region" aria-label={`Messages in ${roomId}`}>
      <div className="message-scroll" ref={scrollArea} onScroll={updateScrollPosition} aria-live="polite" aria-relevant="additions">
        {loading ? (
          <div className="message-loading" role="status" aria-label="Loading messages">
            <span /><span /><span />
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-room">
            <span className="empty-icon"><MessageCircle size={21} /></span>
            <h2>Room for a first message.</h2>
            <p>Start the conversation in <strong>#{roomId}</strong>.</p>
          </div>
        ) : (
          <div className="message-list">
            <div className="history-note"><span /> You’re up to date <span /></div>
            {messages.map((message, index) => (
              <MessageItem key={message.id ?? message.clientMessageId} message={message} mine={message.senderId === currentUserId} index={index} />
            ))}
          </div>
        )}
      </div>
      {showLatest && <button className="latest-button" onClick={scrollToLatest}><ArrowDown size={15} /> Latest messages</button>}
    </section>
  );
}