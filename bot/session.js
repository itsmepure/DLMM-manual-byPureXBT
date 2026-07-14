// Satu chat = satu session (bot single-user by design).
const session = { step: null, data: {}, awaitingText: null };

export function getSession() {
  return session;
}

export function resetSession() {
  session.step = null;
  session.data = {};
  session.awaitingText = null;
}
