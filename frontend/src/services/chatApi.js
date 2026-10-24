async function request(path, options) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers }
    });
  } catch {
    throw new Error('The chat service could not be reached. Check your connection and try again.');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('The chat service returned an unreadable response.');
  }
  if (!response.ok || !body.success) {
    throw new Error(body.error?.message ?? 'The request could not be completed.');
  }
  return body.data;
}

export async function createGuestSession(displayName) {
  const session = await request('/api/guest-session', {
    method: 'POST',
    body: JSON.stringify({ displayName })
  });
  return { ...session, sessionToken: session.token };
}

export async function fetchRooms() {
  const data = await request('/api/rooms');
  return data.rooms;
}