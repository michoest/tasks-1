// Minimal SQLite session store compatible with express-session interface.
// Stores sessions in the `sessions` table: { sid, expire (unix seconds), sess (JSON) }.
// Must extend express-session's Store class (which itself extends EventEmitter
// and provides createSession and other required methods).

import expressSession from 'express-session';
const { Store } = expressSession;

export class SqliteSessionStore extends Store {
  constructor(db) {
    super();
    this.db = db;
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?').get(sid);
      if (!row) return cb(null, null);
      if (row.expire < Math.floor(Date.now() / 1000)) {
        this.destroy(sid, () => {});
        return cb(null, null);
      }
      cb(null, JSON.parse(row.sess));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, session, cb) {
    try {
      const expire = session.cookie?.expires
        ? Math.floor(new Date(session.cookie.expires).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 86400 * 30;
      this.db
        .prepare('INSERT OR REPLACE INTO sessions (sid, expire, sess) VALUES (?, ?, ?)')
        .run(sid, expire, JSON.stringify(session));
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, session, cb) {
    this.set(sid, session, cb);
  }
}
