import cron from 'node-cron';
import { getDb } from './db.js';
import { sendPushToUser } from './push.js';

// Runs every minute; checks per-user reminder times and task-specific times.
export function startScheduler() {
  // Check every minute
  cron.schedule('* * * * *', () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = now.toISOString().slice(0, 10);

    checkInboxReminders(currentTime, today);
    checkTaskDueNotifications(now, today);
    checkFollowUpReminders(today);
  });

  console.log('[scheduler] started');
}

// Inbox reminder: notify users whose inbox_reminder_time matches now and have items
function checkInboxReminders(currentTime, today) {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.inbox_reminder_time
    FROM users u
    WHERE u.inbox_reminder_time = ?
    AND EXISTS (SELECT 1 FROM inbox_items WHERE user_id = u.id)
  `).all(currentTime);

  for (const user of users) {
    const count = db.prepare('SELECT COUNT(*) as n FROM inbox_items WHERE user_id = ?').get(user.id).n;
    sendPushToUser(user.id, {
      title: 'Inbox leeren',
      body: `${count} ${count === 1 ? 'Item wartet' : 'Items warten'} auf Einsortierung`,
      url: '/inbox',
      tag: `inbox-reminder-${today}`,
    });
  }
}

// Task due notifications: for tasks with has_specific_time=1 whose next_due_datetime is now (±1 min)
function checkTaskDueNotifications(now, today) {
  const db = getDb();
  const windowStart = new Date(now.getTime() - 60000).toISOString().slice(0, 16); // HH:MM precision
  const windowEnd = now.toISOString().slice(0, 16);

  // Get tasks with specific time due in this minute
  const tasks = db.prepare(`
    SELECT t.*, sm.user_id
    FROM tasks t
    JOIN space_members sm ON sm.space_id = t.space_id
    WHERE t.has_specific_time = 1
    AND t.active = 1
    AND t.status = 'active'
    AND t.next_due_datetime BETWEEN ? AND ?
  `).all(windowStart + ':00', windowEnd + ':59');

  for (const task of tasks) {
    sendPushToUser(task.user_id, {
      title: 'Fällig',
      body: task.title,
      url: '/',
      tag: `task-due-${task.id}-${today}`,
    });
  }
}

// Follow-up reminders: waiting_until = today, send once in the morning
function checkFollowUpReminders(today) {
  const db = getDb();
  const currentHour = new Date().getHours();
  if (currentHour !== 9) return; // Only fire at 09:xx

  const tasks = db.prepare(`
    SELECT t.*, sm.user_id
    FROM tasks t
    JOIN space_members sm ON sm.space_id = t.space_id
    WHERE t.status = 'waiting'
    AND t.waiting_until = ?
    AND t.active = 1
  `).all(today);

  for (const task of tasks) {
    const body = task.waiting_for
      ? `${task.waiting_for} – Zeit nachzuhaken?`
      : `${task.title} – Zeit nachzuhaken?`;
    sendPushToUser(task.user_id, {
      title: 'Nachfassen',
      body,
      url: '/',
      tag: `followup-${task.id}-${today}`,
    });
  }
}
