import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { calcNextDue, calcNextSkip, isOverdue, isBlocked, initialNextDue, hasCycle } from '../recurrence.js';
import { emitToSpaceAll } from '../sse.js';
import { sendPushToSpace } from '../push.js';

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

function enrichTask(db, task) {
  // Load dependencies
  const deps = db.prepare(`
    SELECT t.id, t.title, t.recurrence_type, t.status, t.next_due_date
    FROM task_dependencies td
    JOIN tasks t ON t.id = td.depends_on_id
    WHERE td.task_id = ?
  `).all(task.id);

  const blockedBy = db.prepare(`
    SELECT t.id, t.title
    FROM task_dependencies td
    JOIN tasks t ON t.id = td.task_id
    WHERE td.depends_on_id = ?
  `).all(task.id);

  const blocked = isBlocked(deps);
  return { ...task, blocked, depends_on: deps, blocks: blockedBy };
}

const taskSchema = z.object({
  list_id: z.number().nullable().optional(),
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
  active: z.number().int().min(0).max(1).default(1),
  status: z.enum(['active', 'waiting', 'done']).default('active'),
  waiting_for: z.string().nullable().optional(),
  waiting_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

// GET /api/spaces/:spaceId/tasks
router.get('/', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  let query = 'SELECT * FROM tasks WHERE space_id = ?';
  const params = [spaceId];

  const { list_id, status, include_inactive, due_before } = req.query;
  if (list_id) { query += ' AND list_id = ?'; params.push(Number(list_id)); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (!include_inactive || include_inactive === 'false') { query += ' AND active = 1'; }
  if (due_before) { query += ' AND next_due_date <= ?'; params.push(due_before); }

  query += ' ORDER BY next_due_date ASC NULLS LAST, created_at ASC';
  const tasks = db.prepare(query).all(...params);
  res.json(tasks.map(t => enrichTask(db, t)));
});

// POST /api/spaces/:spaceId/tasks
router.post('/', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const result = taskSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const data = result.data;
  const { next_due_date, next_due_datetime } = initialNextDue(data);

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO tasks (space_id, list_id, title, notes, recurrence_type, interval_days,
      schedule_pattern, start_date, due_date, has_specific_time, time_of_day, grace_period_minutes,
      next_due_date, next_due_datetime, active, status, waiting_for, waiting_until, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    spaceId, data.list_id ?? null, data.title, data.notes ?? null,
    data.recurrence_type, data.interval_days ?? null, data.schedule_pattern ?? null,
    data.start_date ?? null, data.due_date ?? null,
    data.has_specific_time, data.time_of_day ?? null, data.grace_period_minutes,
    next_due_date, next_due_datetime,
    data.active, data.status, data.waiting_for ?? null, data.waiting_until ?? null,
    req.user.id,
  );

  const task = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(lastInsertRowid));
  const members = spaceMembers(db, spaceId);
  emitToSpaceAll(spaceId, members, 'task_added', { task });
  sendPushToSpace(spaceId, req.user.id, {
    title: `${req.user.name} hat hinzugefügt`,
    body: data.title,
    url: '/',
    tag: `task-added-${lastInsertRowid}`,
  });

  res.status(201).json(task);
});

// GET /api/spaces/:spaceId/tasks/:taskId
router.get('/:taskId', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND space_id = ?').get(req.params.taskId, spaceId);
  if (!task) return res.status(404).json({ error: 'Task nicht gefunden' });

  const completions = db.prepare(`
    SELECT c.*, u.name as completed_by_name
    FROM completions c JOIN users u ON u.id = c.completed_by
    WHERE c.task_id = ? ORDER BY c.completed_at DESC LIMIT 20
  `).all(task.id);

  res.json({ ...enrichTask(db, task), completions });
});

// PUT /api/spaces/:spaceId/tasks/:taskId
router.put('/:taskId', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND space_id = ?').get(req.params.taskId, spaceId);
  if (!task) return res.status(404).json({ error: 'Task nicht gefunden' });

  const result = taskSchema.partial().safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const data = result.data;
  const merged = { ...task, ...data };

  let next_due_date, next_due_datetime;
  if (data.next_due_date !== undefined) {
    // Explicit override from the client
    next_due_date = data.next_due_date;
    next_due_datetime = data.next_due_date && merged.time_of_day
      ? `${data.next_due_date}T${merged.time_of_day}:00` : null;
  } else if (task.last_completed_at) {
    next_due_date = task.next_due_date;
    next_due_datetime = task.next_due_datetime;
  } else {
    ({ next_due_date, next_due_datetime } = initialNextDue(merged));
  }

  db.prepare(`UPDATE tasks SET
    list_id = ?, title = ?, notes = ?, recurrence_type = ?, interval_days = ?,
    schedule_pattern = ?, start_date = ?, due_date = ?, has_specific_time = ?,
    time_of_day = ?, grace_period_minutes = ?, next_due_date = ?, next_due_datetime = ?,
    active = ?, status = ?, waiting_for = ?, waiting_until = ?, updated_at = datetime('now')
    WHERE id = ?`).run(
    merged.list_id, merged.title, merged.notes, merged.recurrence_type, merged.interval_days,
    merged.schedule_pattern, merged.start_date, merged.due_date, merged.has_specific_time,
    merged.time_of_day, merged.grace_period_minutes, next_due_date, next_due_datetime,
    merged.active, merged.status, merged.waiting_for, merged.waiting_until, task.id,
  );

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id));
  emitToSpaceAll(spaceId, spaceMembers(db, spaceId), 'task_updated', { task: updated });
  res.json(updated);
});

// DELETE /api/spaces/:spaceId/tasks/:taskId
router.delete('/:taskId', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND space_id = ?').get(req.params.taskId, spaceId);
  if (!task) return res.status(404).json({ error: 'Task nicht gefunden' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  emitToSpaceAll(spaceId, spaceMembers(db, spaceId), 'task_deleted', { task_id: task.id });
  res.json({ ok: true });
});

// POST /api/spaces/:spaceId/tasks/:taskId/complete
router.post('/:taskId/complete', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND space_id = ?').get(req.params.taskId, spaceId);
  if (!task) return res.status(404).json({ error: 'Task nicht gefunden' });

  const notes = typeof req.body?.notes === 'string' ? req.body.notes : null;
  const overdue = isOverdue(task) ? 1 : 0;
  const now = new Date().toISOString();

  const { next_due_date, next_due_datetime } = calcNextDue(task, now);

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO completions (task_id, completed_by, completed_at, was_overdue, notes)
      VALUES (?, ?, ?, ?, ?)`).run(task.id, req.user.id, now, overdue, notes);
    db.prepare(`UPDATE tasks SET
      last_completed_at = ?, last_completed_by = ?,
      next_due_date = ?, next_due_datetime = ?,
      status = CASE WHEN recurrence_type = 'one_time' THEN 'done' ELSE 'active' END,
      updated_at = datetime('now')
      WHERE id = ?`).run(now, req.user.id, next_due_date, next_due_datetime, task.id);
  });
  tx();

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id));
  const members = spaceMembers(db, spaceId);
  emitToSpaceAll(spaceId, members, 'task_completed', {
    task: updated,
    completed_by_name: req.user.name,
  });
  sendPushToSpace(spaceId, req.user.id, {
    title: `${req.user.name} hat erledigt`,
    body: task.title,
    url: '/',
    tag: `task-completed-${task.id}`,
  });

  res.json(updated);
});

// POST /api/spaces/:spaceId/tasks/:taskId/skip
router.post('/:taskId/skip', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND space_id = ?').get(req.params.taskId, spaceId);
  if (!task) return res.status(404).json({ error: 'Task nicht gefunden' });
  if (task.recurrence_type === 'one_time') return res.status(400).json({ error: 'Einmalige Tasks können nicht übersprungen werden' });

  const { next_due_date, next_due_datetime } = calcNextSkip(task);
  db.prepare('UPDATE tasks SET next_due_date = ?, next_due_datetime = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(next_due_date, next_due_datetime, task.id);

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id));
  emitToSpaceAll(spaceId, spaceMembers(db, spaceId), 'task_updated', { task: updated });
  res.json(updated);
});

// POST /api/spaces/:spaceId/tasks/:taskId/postpone
router.post('/:taskId/postpone', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND space_id = ?').get(req.params.taskId, spaceId);
  if (!task) return res.status(404).json({ error: 'Task nicht gefunden' });

  const schema = z.union([
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    z.object({ days: z.number().int().min(1) }),
  ]);
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Bitte date oder days angeben' });

  let newDate;
  if ('date' in result.data) {
    newDate = result.data.date;
  } else {
    const base = new Date();
    base.setDate(base.getDate() + result.data.days);
    newDate = base.toISOString().slice(0, 10);
  }

  const next_due_datetime = task.has_specific_time && task.time_of_day
    ? `${newDate}T${task.time_of_day}:00` : null;

  db.prepare('UPDATE tasks SET next_due_date = ?, next_due_datetime = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(newDate, next_due_datetime, task.id);

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id));
  emitToSpaceAll(spaceId, spaceMembers(db, spaceId), 'task_updated', { task: updated });
  res.json(updated);
});

// --- Dependencies ---

// GET /api/spaces/:spaceId/tasks/:taskId/dependencies
router.get('/:taskId/dependencies', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND space_id = ?').get(req.params.taskId, spaceId);
  if (!task) return res.status(404).json({ error: 'Task nicht gefunden' });

  const deps = db.prepare(`
    SELECT td.id, t.id as task_id, t.title, t.status, t.next_due_date, t.recurrence_type
    FROM task_dependencies td JOIN tasks t ON t.id = td.depends_on_id
    WHERE td.task_id = ?
  `).all(task.id);
  res.json(deps);
});

// POST /api/spaces/:spaceId/tasks/:taskId/dependencies
router.post('/:taskId/dependencies', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND space_id = ?').get(req.params.taskId, spaceId);
  if (!task) return res.status(404).json({ error: 'Task nicht gefunden' });

  const schema = z.object({ depends_on_id: z.number().int() });
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const depTask = db.prepare('SELECT id FROM tasks WHERE id = ? AND space_id = ?').get(result.data.depends_on_id, spaceId);
  if (!depTask) return res.status(400).json({ error: 'Abhängiger Task nicht im selben Space' });

  if (task.id === result.data.depends_on_id) return res.status(400).json({ error: 'Task kann nicht von sich selbst abhängen' });

  // Cycle detection: load all existing edges for this space
  const allEdges = db.prepare('SELECT task_id, depends_on_id FROM task_dependencies td JOIN tasks t ON t.id = td.task_id WHERE t.space_id = ?').all(spaceId);
  const edges = new Map();
  for (const e of allEdges) {
    if (!edges.has(e.task_id)) edges.set(e.task_id, new Set());
    edges.get(e.task_id).add(e.depends_on_id);
  }
  if (hasCycle(edges, task.id, result.data.depends_on_id)) {
    return res.status(400).json({ error: 'Diese Abhängigkeit würde einen Zyklus erzeugen' });
  }

  try {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)')
      .run(task.id, result.data.depends_on_id);
    res.status(201).json({ id: lastInsertRowid, task_id: task.id, depends_on_id: result.data.depends_on_id });
  } catch {
    res.status(409).json({ error: 'Abhängigkeit existiert bereits' });
  }
});

// DELETE /api/spaces/:spaceId/tasks/:taskId/dependencies/:depId
router.delete('/:taskId/dependencies/:depId', (req, res) => {
  const db = getDb();
  const spaceId = Number(req.params.spaceId);
  if (!assertMember(db, spaceId, req.user.id, res)) return;

  db.prepare('DELETE FROM task_dependencies WHERE id = ?').run(req.params.depId);
  res.json({ ok: true });
});

export default router;
