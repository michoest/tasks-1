import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { hashPassword, verifyPassword, requireAuth } from '../auth.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', async (req, res) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const { name, email, password } = result.data;
  const db = getDb();

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'E-Mail wird bereits verwendet' });
  }

  const password_hash = await hashPassword(password);
  const webhook_token = uuidv4();

  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (name, email, password_hash, webhook_token) VALUES (?, ?, ?, ?)')
    .run(name, email, password_hash, webhook_token);

  req.session.userId = Number(lastInsertRowid);
  const user = db
    .prepare('SELECT id, email, name, inbox_reminder_time, webhook_token FROM users WHERE id = ?')
    .get(lastInsertRowid);

  res.status(201).json({ user });
});

router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const { email, password } = result.data;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  }

  req.session.userId = user.id;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      inbox_reminder_time: user.inbox_reminder_time,
      webhook_token: user.webhook_token,
    },
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
