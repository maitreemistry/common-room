import { CircleUserRound } from 'lucide-react';

const swatches = ['#d9f07b', '#f3a58f', '#a6d7ca', '#e6c06b', '#c0b8e3'];

export default function OnlineUsers({ users, currentUserId }) {
  return (
    <section className="online-section" aria-labelledby="online-heading">
      <div className="sidebar-section-heading">
        <h2 id="online-heading">In this room</h2>
        <span className="online-count">{users.length}</span>
      </div>
      {users.length === 0 ? (
        <p className="online-empty">No one is here just yet.</p>
      ) : (
        <ul className="online-list">
          {users.map((user, index) => (
            <li className="online-person" key={user.userId}>
              <span className="person-avatar" style={{ '--avatar-color': swatches[index % swatches.length] }} aria-hidden="true">
                {user.displayName?.slice(0, 1).toUpperCase() || <CircleUserRound size={15} />}
              </span>
              <span className="person-name">{user.displayName}{user.userId === currentUserId && <small>you</small>}</span>
              <span className="person-presence" aria-label="Online" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}