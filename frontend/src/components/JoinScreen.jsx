import { useState } from 'react';
import { ArrowRight, Hash, MessageCircle, Sparkles } from 'lucide-react';

const defaultRooms = ['general', 'random', 'help'];

export default function JoinScreen({ rooms = defaultRooms, onJoin, busy = false, error = '' }) {
  const [displayName, setDisplayName] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('general');
  const [customRoom, setCustomRoom] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [validationError, setValidationError] = useState('');
  const room = customMode ? customRoom : selectedRoom;

  const submit = async (event) => {
    event.preventDefault();
    const cleanName = displayName.trim();
    const cleanRoom = room.trim();
    if (cleanName.length < 2 || cleanName.length > 30 || /[\u0000-\u001f\u007f]/u.test(cleanName)) {
      setValidationError('Choose a display name between 2 and 30 characters.');
      return;
    }
    if (cleanRoom.length < 1 || cleanRoom.length > 40 || /[\u0000-\u001f\u007f]/u.test(cleanRoom)) {
      setValidationError('Room names can be 1 to 40 characters.');
      return;
    }
    setValidationError('');
    await onJoin({ displayName: cleanName, roomId: cleanRoom.toLowerCase() });
  };

  return (
    <main className="entry-screen">
      <header className="entry-topline">
        <a className="wordmark" href="#home" aria-label="Commonroom home">
          <span className="brand-glyph" aria-hidden="true"><i /><i /><i /></span>
          commonroom
        </a>
        <span className="entry-topnote"><span className="live-dot" /> Open rooms, real conversations</span>
      </header>

      <section className="entry-content" aria-labelledby="entry-heading">
        <div className="entry-copy">
          <p className="eyebrow"><Sparkles size={14} strokeWidth={2.2} /> A place to meet in the middle</p>
          <h1 id="entry-heading">Good things happen<br />when we <em>talk.</em></h1>
          <p className="entry-description">Drop into a room and join the conversation. No account, no waiting around.</p>
          <div className="entry-proof" aria-label="A conversation is happening now">
            <div className="proof-avatars" aria-hidden="true"><span>A</span><span>J</span><span>M</span><span>+</span></div>
            <span>Small rooms. <strong>Better conversations.</strong></span>
          </div>
        </div>

        <form className="join-form" onSubmit={submit} noValidate>
          <div className="form-heading">
            <span className="form-icon"><MessageCircle size={18} /></span>
            <div><h2>Find your room</h2><p>Your name is a guest label, not a verified identity.</p></div>
          </div>

          <label className="field-label" htmlFor="display-name">Your name</label>
          <input
            id="display-name"
            className="text-field"
            autoComplete="nickname"
            maxLength={30}
            placeholder="e.g. Alex Morgan"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />

          <div className="room-label-row">
            <label className="field-label" htmlFor={customMode ? 'custom-room' : 'room-select'}>Room</label>
            <button type="button" className="text-button" onClick={() => setCustomMode((active) => !active)}>
              {customMode ? 'Choose a room' : 'Create or join'}
            </button>
          </div>
          {customMode ? (
            <div className="room-input-wrap">
              <Hash size={17} aria-hidden="true" />
              <input
                id="custom-room"
                className="text-field room-field"
                maxLength={40}
                placeholder="Type a room name"
                value={customRoom}
                onChange={(event) => setCustomRoom(event.target.value)}
                required
              />
            </div>
          ) : (
            <select id="room-select" className="text-field room-select" value={selectedRoom} onChange={(event) => setSelectedRoom(event.target.value)}>
              {[...new Set([...defaultRooms, ...rooms])].map((roomName) => <option key={roomName} value={roomName}>{roomName}</option>)}
            </select>
          )}

          {(validationError || error) && <p className="form-error" role="alert">{validationError || error}</p>}
          <button className="primary-button entry-submit" type="submit" disabled={busy}>
            {busy ? 'Joining room…' : 'Join the conversation'}
            {!busy && <ArrowRight size={17} aria-hidden="true" />}
          </button>
          <p className="form-footnote">By joining, you agree to keep it kind and useful.</p>
        </form>
      </section>

      <footer className="entry-footer"><span>COMMONROOM / LIVE CHAT</span><span>Made for the in-between moments</span></footer>
    </main>
  );
}