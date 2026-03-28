// Simple SSE broker.
// Clients subscribe by user ID; events are emitted to all connections for a given user.

const clients = new Map(); // userId -> Set<res>

export function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}

export function removeClient(userId, res) {
  clients.get(userId)?.delete(res);
  if (clients.get(userId)?.size === 0) clients.delete(userId);
}

// Emit an event to a specific user.
export function emitToUser(userId, event, data) {
  const conns = clients.get(userId);
  if (!conns?.size) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(msg); } catch { /* connection dropped */ }
  }
}

// Emit to all members of a space (optionally excluding one user).
export function emitToSpace(spaceId, memberIds, event, data, excludeUserId = null) {
  for (const uid of memberIds) {
    if (uid === excludeUserId) continue;
    emitToUser(uid, event, { space_id: spaceId, ...data });
  }
}

// Also emit to the triggering user (for their own other tabs/devices).
export function emitToSpaceAll(spaceId, memberIds, event, data) {
  emitToSpace(spaceId, memberIds, event, data, null);
}
