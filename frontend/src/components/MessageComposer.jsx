import { useState } from 'react';
import { CornerDownLeft, LoaderCircle, Send } from 'lucide-react';
import { createClientMessageId } from '../services/chatSocket.js';

export default function MessageComposer({ onSend, disabled, connection, roomId = 'room' }) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null);
  const [sendStatus, setSendStatus] = useState('');

  const submit = async (event) => {
    event?.preventDefault();
    const content = pending?.content ?? draft.trim();
    if (!content || disabled || pending?.sending) return;
    const attempt = pending ?? { content, clientMessageId: createClientMessageId(), sending: false, failed: false };
    setPending({ ...attempt, sending: true, failed: false });
    setSendStatus('');
    try {
      await onSend(attempt.content, attempt.clientMessageId);
      setDraft('');
      setPending(null);
      setSendStatus('Message sent and stored.');
    } catch (error) {
      setPending({ ...attempt, sending: false, failed: true });
      setSendStatus(error.message || 'Message was not confirmed. Retry to safely check delivery.');
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form className="composer-wrap" onSubmit={submit}>
      <div className={`composer ${pending?.failed ? 'composer-failed' : ''}`}>
        <label className="visually-hidden" htmlFor="message-draft">Write a message</label>
        <textarea
          id="message-draft"
          value={draft}
          maxLength={2000}
          rows={1}
          placeholder={disabled ? 'Reconnect to send a message' : `Message #${roomId}…`}
          disabled={disabled || pending?.sending || pending?.failed}
          onChange={(event) => { setDraft(event.target.value); setSendStatus(''); }}
          onKeyDown={onKeyDown}
        />
        <button className="send-button" type="submit" aria-label={pending?.failed ? 'Retry message' : 'Send message'} disabled={disabled || pending?.sending || (!draft.trim() && !pending?.failed)}>
          {pending?.sending ? <LoaderCircle size={17} className="spin-icon" /> : <Send size={17} />}
        </button>
      </div>
      <div className="composer-bottom">
        <span className={`send-feedback ${pending?.failed ? 'feedback-error' : ''}`} role="status">{pending?.sending ? 'Sending…' : sendStatus}</span>
        {pending?.failed && <button className="retry-link" type="button" onClick={() => void submit()}>Retry same message</button>}
        {pending?.failed && <button className="retry-link edit-retry" type="button" onClick={() => { setPending(null); setSendStatus(''); }}>Edit draft</button>}
        {!pending?.failed && <span className="keyboard-hint"><CornerDownLeft size={13} /> Enter to send <i /> Shift+Enter for a new line</span>}
        <span className="connection-hint">{connection === 'connected' ? 'Messages are stored in room history' : 'Waiting for a secure connection'}</span>
      </div>
    </form>
  );
}