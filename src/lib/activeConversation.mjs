const keyFor = userId => "eternyx.chat.active." + userId;

export function readActiveConversation(userId) {
  try {
    return sessionStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

export function rememberConversation(userId, sessionId) {
  try {
    if (sessionId) sessionStorage.setItem(keyFor(userId), sessionId);
    else sessionStorage.removeItem(keyFor(userId));
  } catch {
    // Browser storage is optional. The current chat can continue in memory.
  }
}
