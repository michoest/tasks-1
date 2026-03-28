import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { emitToSpaceAll } from '../sse.js';

const router = Router();
router.use(requireAuth);

// Helper: assert user is a member of the space
function assertMember(db, spaceId, userId, res) {
  const m = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(spaceId, userId);
  if (!m) { res.status(403).json({ error: 'Kein Zugriff auf diesen Space' }); return null; }
  return m;
}

function spaceMembers(db, spaceId) {
  return db.prepare('SELECT user_id FROM space_members WHERE space_id = ?').all(spaceId).map(r => r.user_id);
}

// GET /api/spaces — all spaces the user belongs to
router.get('/', (req, res) => {
  const db = getDb();
  const spaces = db.prepare(`
    SELECT s.*, sm.role, sm.color as my_color,
      (SELECT COUNT(*) FROM space_members sm2 WHERE sm2.space_id = s.id) as member_count
    FROM spaces s
    JOIN space_members sm ON sm.space_id = s.id AND sm.user_id = ?
    ORDER BY s.created_at ASC
  `).all(req.user.id);

  // Attach member details
  const result = spaces.map(space => {
    const members = db.prepare(`
      SELECT u.id, u.name, u.email, sm.role
      FROM space_members sm JOIN users u ON u.id = sm.user_id
      WHERE sm.space_id = ?
    `).all(space.id);
    return { ...space, members };
  });

  res.json(result);
});

// POST /api/spaces — create a new space
router.post('/', (req, res) => {
  const schema = z.object({ name: z.string().min(1).max(100) });
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.data });

  const db = getDb();
  const invite_code = uuidv4().slice(0, 8).toUpperCase();

  const { lastInsertRowid } = db
    .prepare('INSERT INTO spaces (name, owner_id, invite_code) VALUES (?, ?, ?)')
    .run(result.data.name, req.user.id, invite_code);

  db.prepare('INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)')
    .run(lastInsertRowid, req.user.id, 'owner');

  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(lastInsertRowid);
  res.status(201).json(space);
});

// PUT /api/spaces/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.id);
  const m = assertMember(db, spaceId, req.user.id, res);
  if (!m) return;
  if (m.role !== 'owner') return res.status(403).json({ error: 'Nur der Eigentümer kann den Space bearbeiten' });

  const schema = z.object({ name: z.string().min(1).max(100) });
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  db.prepare('UPDATE spaces SET name = ? WHERE id = ?').run(result.data.name, spaceId);
  res.json(db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId));
});

// DELETE /api/spaces/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.id);
  const m = assertMember(db, spaceId, req.user.id, res);
  if (!m) return;
  if (m.role !== 'owner') return res.status(403).json({ error: 'Nur der Eigentümer kann den Space löschen' });

  db.prepare('DELETE FROM spaces WHERE id = ?').run(spaceId);
  res.json({ ok: true });
});

// GET /api/spaces/:id/invite-code
router.get('/:id/invite-code', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.id);
  const space = db.prepare('SELECT invite_code, owner_id FROM spaces WHERE id = ?').get(spaceId);
  if (!space) return res.status(404).json({ error: 'Space nicht gefunden' });
  if (space.owner_id !== req.user.id) return res.status(403).json({ error: 'Nur der Eigentümer kann den Einladungscode sehen' });
  res.json({ invite_code: space.invite_code });
});

// POST /api/spaces/:id/join  (body: { invite_code })
router.post('/:id/join', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.id);
  const { invite_code } = req.body;

  const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND invite_code = ?').get(spaceId, invite_code);
  if (!space) return res.status(400).json({ error: 'Ungültiger Einladungscode' });

  const existing = db.prepare('SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?').get(spaceId, req.user.id);
  if (existing) return res.status(409).json({ error: 'Du bist bereits Mitglied dieses Spaces' });

  db.prepare('INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)')
    .run(spaceId, req.user.id, 'member');

  // Notify existing members
  const memberIds = spaceMembers(db, spaceId);
  emitToSpaceAll(spaceId, memberIds, 'space_member_joined', {
    user: { id: req.user.id, name: req.user.name },
  });

  res.status(201).json({ ok: true });
});

// DELETE /api/spaces/:id/members/:userId
router.delete('/:id/members/:userId', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.id);
  const targetId = Number(req.params.userId);

  const m = assertMember(db, spaceId, req.user.id, res);
  if (!m) return;

  // Can remove self, or owner can remove others
  if (req.user.id !== targetId && m.role !== 'owner') {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  if (targetId === req.user.id && m.role === 'owner') {
    return res.status(400).json({ error: 'Eigentümer kann den Space nicht verlassen; erst löschen' });
  }

  db.prepare('DELETE FROM space_members WHERE space_id = ? AND user_id = ?').run(spaceId, targetId);
  res.json({ ok: true });
});

// PUT /api/spaces/:id/my-color — set personal color for this space
router.put('/:id/my-color', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.id);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const { color } = req.body;
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return res.status(400).json({ error: 'Ungültige Farbe' });
  }
  db.prepare('UPDATE space_members SET color = ? WHERE space_id = ? AND user_id = ?')
    .run(color, spaceId, req.user.id);
  res.json({ ok: true, color });
});

export default router;
