import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

import { getDb } from './db.js';
import { createSessionMiddleware } from './auth.js';
import { initPush } from './push.js';
import { startScheduler } from './scheduler.js';

import authRouter from './routes/auth.js';
import spacesRouter from './routes/spaces.js';
import listsRouter from './routes/lists.js';
import tasksRouter from './routes/tasks.js';
import inboxRouter, { webhookRouter } from './routes/inbox.js';
import eventsRouter from './routes/events.js';
import userRouter from './routes/user.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists
mkdirSync(path.join(__dirname, '../../data'), { recursive: true });

const app = express();
const PORT = Number(process.env.PORT || 3001);

// CORS — configured only here (not in nginx)
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());
app.use(createSessionMiddleware());

// Initialize DB (runs schema creation)
getDb();

// Initialize push notifications
initPush();

// Start background scheduler
startScheduler();

// Routes
app.use('/api/auth', authRouter);
app.use('/api/spaces', spacesRouter);
app.use('/api/spaces/:spaceId/lists', listsRouter);
app.use('/api/spaces/:spaceId/tasks', tasksRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/events', eventsRouter);
app.use('/api/user', userRouter);
app.use('/api/webhook/inbox', webhookRouter);

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
