import webpush from 'web-push';
import { getDb } from './db.js';

let vapidConfigured = false;

export function initPush() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  } else {
    console.warn('[push] VAPID not configured — push notifications disabled');
  }
}

export function isVapidConfigured() {
  return vapidConfigured;
}

// Send a push notification to all subscriptions of a given user.
// Dead subscriptions (404/410) are automatically removed.
export async function sendPushToUser(userId, payload) {
  if (!vapidConfigured) return;
  const db = getDb();
  const subs = db
    .prepare('SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = ?')
    .all(userId);
  if (!subs.length) return;

  const payloadStr = JSON.stringify(payload);
  const deadIds = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
          payloadStr,
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          deadIds.push(sub.id);
        }
      }
    }),
  );

  if (deadIds.length) {
    const placeholders = deadIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM push_subscriptions WHERE id IN (${placeholders})`).run(...deadIds);
  }
}

// Send to all members of a space except the triggering user.
export async function sendPushToSpace(spaceId, excludeUserId, payload) {
  if (!vapidConfigured) return;
  const db = getDb();
  const members = db
    .prepare('SELECT user_id FROM space_members WHERE space_id = ? AND user_id != ?')
    .all(spaceId, excludeUserId);
  await Promise.all(members.map((m) => sendPushToUser(m.user_id, payload)));
}
