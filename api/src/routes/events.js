import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { addClient, removeClient } from '../sse.js';

const router = Router();

// GET /api/events — SSE stream for all spaces of the authenticated user
router.get('/', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });
  res.flushHeaders();

  // Send a comment every 30s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* ignore */ }
  }, 30000);

  addClient(req.user.id, res);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(req.user.id, res);
  });
});

export default router;
