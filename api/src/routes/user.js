import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireAuth, hashPassword, verifyPassword } from '../auth.js';
import { isVapidConfigured } from '../push.js';

const router = Router();
router.use(requireAuth);

// PUT /api/user/settings
router.put('/settings', (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    inbox_reminder_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const db = getDb();
  const { name, inbox_reminder_time } = result.data;
  db.prepare(`UPDATE users SET
    name = COALESCE(?, name),
    inbox_reminder_time = COALESCE(?, inbox_reminder_time)
    WHERE id = ?`).run(name ?? null, inbox_reminder_time ?? null, req.user.id);

  const user = db.prepare('SELECT id, email, name, inbox_reminder_time, webhook_token FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// PUT /api/user/password
router.put('/password', async (req, res) => {
  const schema = z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(8),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const valid = await verifyPassword(result.data.current_password, user.password_hash);
  if (!valid) return res.status(400).json({ error: 'Aktuelles Passwort ist falsch' });

  const hash = await hashPassword(result.data.new_password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

// GET /api/user/webhook-token
router.get('/webhook-token', (req, res) => {
  res.json({ token: req.user.webhook_token });
});

// POST /api/user/webhook-token/regenerate
router.post('/webhook-token/regenerate', (req, res) => {
  const db = getDb();
  const token = uuidv4();
  db.prepare('UPDATE users SET webhook_token = ? WHERE id = ?').run(token, req.user.id);
  res.json({ token });
});

// GET /api/user/push-config
router.get('/push-config', (req, res) => {
  res.json({
    vapid_public_key: process.env.VAPID_PUBLIC_KEY || null,
    configured: isVapidConfigured(),
  });
});

// POST /api/push/subscribe
router.post('/push/subscribe', (req, res) => {
  const schema = z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
    VALUES (?, ?, ?, ?)`).run(
    req.user.id,
    result.data.endpoint,
    result.data.keys.p256dh,
    result.data.keys.auth,
  );
  res.status(201).json({ ok: true });
});

// DELETE /api/push/unsubscribe
router.delete('/push/unsubscribe', (req, res) => {
  const schema = z.object({ endpoint: z.string() });
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'endpoint erforderlich' });

  const db = getDb();
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .run(req.user.id, result.data.endpoint);
  res.json({ ok: true });
});

export default router;
