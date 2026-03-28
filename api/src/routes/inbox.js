import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { initialNextDue } from '../recurrence.js';
import { emitToUser } from '../sse.js';

const router = Router();

// Public webhook endpoint — no auth, token in URL
// POST /api/webhook/inbox/:token
export const webhookRouter = Router();

webhookRouter.post('/:token', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE webhook_token = ?').get(req.params.token);
  if (!user) return res.status(401).json({ error: 'Ungültiger Token' });

  const text = req.body?.text;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text ist erforderlich' });
  }

  const { lastInsertRowid } = db
    .prepare('INSERT INTO inbox_items (user_id, text, source) VALUES (?, ?, ?)')
    .run(user.id, text.trim(), 'webhook');

  const item = db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(lastInsertRowid);
  emitToUser(user.id, 'inbox_item_added', { item });
  res.status(201).json({ ok: true, id: lastInsertRowid });
});

// Authenticated inbox routes
router.use(requireAuth);

// GET /api/inbox
router.get('/', (req, res) => {
  const db = getDb();
  const items = db
    .prepare('SELECT * FROM inbox_items WHERE user_id = ? ORDER BY created_at ASC')
    .all(req.user.id);
  res.json(items);
});

// POST /api/inbox
router.post('/', (req, res) => {
  const schema = z.object({ text: z.string().min(1).max(2000) });
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const db = getDb();
  const { lastInsertRowid } = db
    .prepare('INSERT INTO inbox_items (user_id, text, source) VALUES (?, ?, ?)')
    .run(req.user.id, result.data.text, 'manual');

  const item = db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(lastInsertRowid);
  res.status(201).json(item);
});

// DELETE /api/inbox/:itemId
router.delete('/:itemId', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT id FROM inbox_items WHERE id = ? AND user_id = ?').get(req.params.itemId, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item nicht gefunden' });
  db.prepare('DELETE FROM inbox_items WHERE id = ?').run(item.id);
  res.json({ ok: true });
});

// POST /api/inbox/:itemId/convert — turn inbox item into a real task
const convertSchema = z.object({
  space_id: z.number().int(),
  list_id: z.number().int().nullable().optional(),
  title: z.string().min(1).max(500),
  notes: z.string().nullable().optional(),
  recurrence_type: z.enum(['one_time', 'interval', 'schedule']).default('one_time'),
  interval_days: z.number().int().min(1).nullable().optional(),
  schedule_pattern: z.string().nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  has_specific_time: z.number().int().min(0).max(1).default(0),
  time_of_day: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  grace_period_minutes: z.number().int().min(0).default(120),
});

router.post('/:itemId/convert', (req, res) => {
  const db = getDb();

  const item = db.prepare('SELECT * FROM inbox_items WHERE id = ? AND user_id = ?').get(req.params.itemId, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item nicht gefunden' });

  const result = convertSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const data = result.data;

  // Verify space membership
  const member = db.prepare('SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?').get(data.space_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Kein Zugriff auf diesen Space' });

  const { next_due_date, next_due_datetime } = initialNextDue(data);

  const tx = db.transaction(() => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO tasks (space_id, list_id, title, notes, recurrence_type, interval_days,
        schedule_pattern, start_date, due_date, has_specific_time, time_of_day, grace_period_minutes,
        next_due_date, next_due_datetime, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.space_id, data.list_id ?? null, data.title, data.notes ?? null,
      data.recurrence_type, data.interval_days ?? null, data.schedule_pattern ?? null,
      data.start_date ?? null, data.due_date ?? null,
      data.has_specific_time, data.time_of_day ?? null, data.grace_period_minutes,
      next_due_date, next_due_datetime, req.user.id,
    );
    db.prepare('DELETE FROM inbox_items WHERE id = ?').run(item.id);
    return lastInsertRowid;
  });

  const taskId = tx();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  res.status(201).json(task);
});

export default router;
