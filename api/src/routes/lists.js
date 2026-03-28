import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { emitToSpaceAll } from '../sse.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

function assertMember(db, spaceId, userId, res) {
  const m = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(spaceId, userId);
  if (!m) { res.status(403).json({ error: 'Kein Zugriff' }); return null; }
  return m;
}

function spaceMembers(db, spaceId) {
  return db.prepare('SELECT user_id FROM space_members WHERE space_id = ?').all(spaceId).map(r => r.user_id);
}

const listSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#607D8B'),
  icon: z.string().optional().nullable(),
});

// GET /api/spaces/:spaceId/lists
router.get('/', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const lists = db.prepare('SELECT * FROM lists WHERE space_id = ? ORDER BY position ASC, id ASC').all(spaceId);
  res.json(lists);
});

// POST /api/spaces/:spaceId/lists
router.post('/', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const result = listSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const maxPos = db.prepare('SELECT MAX(position) as p FROM lists WHERE space_id = ?').get(spaceId)?.p ?? -1;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO lists (space_id, name, color, icon, position) VALUES (?, ?, ?, ?, ?)')
    .run(spaceId, result.data.name, result.data.color, result.data.icon ?? null, maxPos + 1);

  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(lastInsertRowid);
  emitToSpaceAll(spaceId, spaceMembers(db, spaceId), 'list_added', { list });
  res.status(201).json(list);
});

// PUT /api/spaces/:spaceId/lists/reorder  — must come before /:listId
router.put('/reorder', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const schema = z.object({ order: z.array(z.number()) });
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'order must be an array of IDs' });

  const update = db.prepare('UPDATE lists SET position = ? WHERE id = ? AND space_id = ?');
  const tx = db.transaction(() => {
    result.data.order.forEach((id, idx) => update.run(idx, id, spaceId));
  });
  tx();
  res.json({ ok: true });
});

// PUT /api/spaces/:spaceId/lists/:listId
router.put('/:listId', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const list = db.prepare('SELECT * FROM lists WHERE id = ? AND space_id = ?').get(req.params.listId, spaceId);
  if (!list) return res.status(404).json({ error: 'Liste nicht gefunden' });

  const result = listSchema.partial().safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const fields = result.data;
  db.prepare(`UPDATE lists SET
    name = COALESCE(?, name),
    color = COALESCE(?, color),
    icon = COALESCE(?, icon)
    WHERE id = ?`).run(fields.name ?? null, fields.color ?? null, fields.icon ?? null, list.id);

  const updated = db.prepare('SELECT * FROM lists WHERE id = ?').get(list.id);
  emitToSpaceAll(spaceId, spaceMembers(db, spaceId), 'list_updated', { list: updated });
  res.json(updated);
});

// DELETE /api/spaces/:spaceId/lists/:listId
router.delete('/:listId', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const list = db.prepare('SELECT id FROM lists WHERE id = ? AND space_id = ?').get(req.params.listId, spaceId);
  if (!list) return res.status(404).json({ error: 'Liste nicht gefunden' });

  db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
  emitToSpaceAll(spaceId, spaceMembers(db, spaceId), 'list_deleted', { list_id: list.id });
  res.json({ ok: true });
});

export default router;
