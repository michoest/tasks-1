# tasks-1 — Spezifikation

> Persönliche Task-Management PWA mit optionalem Space-Sharing, Inbox-Flow, Task-Dependencies und Real-Time-Sync.

---

## 1. Navigation

Vier Tabs (Bottom Navigation, nur Icons):

| Tab | Icon | Inhalt |
|---|---|---|
| **Heute** | `mdi-calendar-today` | Tagesübersicht: Nachfassen / Muss / Kann / Wartet |
| **Inbox** | `mdi-inbox` | Schnell-Notizen, die noch eingearbeitet werden müssen |
| **Listen** | `mdi-format-list-bulleted` | Alle Tasks nach Space / Liste |
| **Einstellungen** | `mdi-cog` | Profil, Spaces, Notifications, Webhook |

**Globale Inbox-Schnelleingabe:** Auf jeder Ansicht gibt es einen sekundären FAB (oder einen persistenten Button), der einen minimalen Bottom-Sheet öffnet — nur ein Textfeld, Bestätigen → Item landet in der Inbox. Kein Tab-Wechsel nötig.

**Stats (v2, noch nicht implementiert):** Daten werden ab Tag 1 vollständig gespeichert. Geplante Ansicht: pro recurring Task eine Heatmap + Streak + "zuletzt erledigt"; aggregiert pro Space: "Diese Woche erledigt: X von Y".

---

## 2. Datenmodell

### `users`
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  inbox_reminder_time TEXT DEFAULT '20:00',  -- HH:MM
  webhook_token TEXT UNIQUE NOT NULL,        -- auto-generiert bei Registrierung
  created_at TEXT DEFAULT (datetime('now'))
);
```

### `sessions`
```sql
CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  expire INTEGER NOT NULL,
  sess TEXT NOT NULL
);
```

### `push_subscriptions`
```sql
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT UNIQUE NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### `spaces`
```sql
CREATE TABLE spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### `space_members`
```sql
CREATE TABLE space_members (
  space_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'member',  -- 'owner' | 'member'
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (space_id, user_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### `lists`
```sql
CREATE TABLE lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,       -- Hex, z.B. "#FF5722"
  icon TEXT,                 -- MDI-Name, z.B. "mdi-home" (optional)
  position INTEGER DEFAULT 0,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  UNIQUE(space_id, name)
);

CREATE INDEX idx_lists_space ON lists(space_id);
```

### `tasks`
```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL,
  list_id INTEGER,

  -- Inhalt
  title TEXT NOT NULL,
  notes TEXT,                -- Mehrzeilig; in Listenansicht 1-zeilig mit Ellipsis

  -- Wiederholung
  recurrence_type TEXT NOT NULL DEFAULT 'one_time',
    -- 'one_time' | 'interval' | 'schedule'
  interval_days INTEGER,     -- für recurrence_type = 'interval'
  schedule_pattern TEXT,     -- JSON, für recurrence_type = 'schedule' (s. Abschnitt 3.2)

  -- Zeitsteuerung
  start_date TEXT,           -- YYYY-MM-DD (optional; Task erst ab diesem Datum in "Kann")
  due_date TEXT,             -- YYYY-MM-DD (Ausgangsdatum für one_time und initial für recurring)
  has_specific_time INTEGER DEFAULT 0,
  time_of_day TEXT,          -- HH:MM (nur wenn has_specific_time = 1)
  grace_period_minutes INTEGER DEFAULT 120,
    -- Nachfrist nach time_of_day; greift nur wenn has_specific_time = 1

  -- Gecachtes nächstes Fälligkeitsdatum (wird nach jeder Completion neu berechnet)
  next_due_date TEXT,        -- YYYY-MM-DD
  next_due_datetime TEXT,    -- ISO datetime (nur wenn has_specific_time = 1)

  -- Pause-Flag (nur für recurring tasks sinnvoll)
  active INTEGER DEFAULT 1,  -- 0 = pausiert; wird in "Heute" nicht angezeigt

  -- Externer Wartestatus
  status TEXT DEFAULT 'active',  -- 'active' | 'waiting' | 'done'
  waiting_for TEXT,              -- Freitext, z.B. "Max Mustermann"
  waiting_until TEXT,            -- YYYY-MM-DD (Follow-up-Datum)

  -- Completion-Tracking
  last_completed_at TEXT,
  last_completed_by INTEGER,

  created_by INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (last_completed_by) REFERENCES users(id)
);

CREATE INDEX idx_tasks_space ON tasks(space_id);
CREATE INDEX idx_tasks_list ON tasks(list_id);
CREATE INDEX idx_tasks_next_due ON tasks(next_due_date) WHERE next_due_date IS NOT NULL;
```

### `task_dependencies`
```sql
CREATE TABLE task_dependencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,       -- der blockierte Task (B)
  depends_on_id INTEGER NOT NULL, -- der blockierende Task (A)
  -- Invariante: beide Tasks müssen im selben Space sein
  -- Invariante: keine Zyklen (DAG; wird im Backend validiert)
  UNIQUE(task_id, depends_on_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

### `inbox_items`
```sql
CREATE TABLE inbox_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  source TEXT DEFAULT 'manual',  -- 'manual' | 'webhook'
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### `completions`
```sql
CREATE TABLE completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  completed_by INTEGER NOT NULL,
  completed_at TEXT DEFAULT (datetime('now')),
  was_overdue INTEGER DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (completed_by) REFERENCES users(id)
);

CREATE INDEX idx_completions_task ON completions(task_id);
CREATE INDEX idx_completions_user ON completions(completed_by);
CREATE INDEX idx_completions_date ON completions(completed_at);
```

---

## 3. Business Logic

### 3.1 Task-Sichtbarkeit

#### In "Heute" erscheint ein Task, wenn ALLE der folgenden Bedingungen gelten:
1. `active = 1`
2. `status IN ('active', 'waiting')`
3. `start_date IS NULL OR start_date <= today`
4. Nicht blockiert (s.u.)

Ausnahme: Tasks mit `status = 'waiting' AND waiting_until <= today` erscheinen in der **Nachfassen**-Sektion unabhängig davon, ob sie blockiert sind.

#### Sektionen in "Heute":
- **Nachfassen:** `status = 'waiting' AND waiting_until <= today`
- **Muss:** `status = 'active'`, nicht blockiert, `next_due_date <= today`
- **Kann:** `status = 'active'`, nicht blockiert, `next_due_date > today OR next_due_date IS NULL`
- **Wartet:** `status = 'waiting' AND (waiting_until IS NULL OR waiting_until > today)` — eingeklappt

#### Tasks, die in "Heute" NICHT erscheinen:
- `active = 0` (pausiert)
- `start_date > today` (noch nicht startbar)
- Blockiert durch andere Tasks (außer in Nachfassen-Ausnahme)

Diese Tasks sind nur in der **Listen-Ansicht** sichtbar, dort mit einem entsprechenden Badge markiert.

### 3.2 Blockiert-Logik

Task B ist **blockiert**, wenn mindestens eine seiner Dependencies (Einträge in `task_dependencies` mit `task_id = B.id`) den blockierenden Task A in einem nicht-erledigten Zustand hat:

```
A blockiert B, wenn:
  (A.recurrence_type = 'one_time' AND A.status != 'done')
  OR
  (A.recurrence_type IN ('interval', 'schedule') AND A.next_due_date <= today)
```

Ein recurring Task gilt für die aktuelle Runde als **erledigt**, sobald `next_due_date > today` (d.h. er wurde abgehakt und die nächste Runde liegt in der Zukunft).

### 3.3 Wiederholungstypen

#### one_time
- Optionales `due_date` (kein Due Date = jederzeit fällig, sobald startbar)
- Nach Erledigung: `status = 'done'`, `next_due_date = NULL`

#### interval
```json
{ "interval_days": 7 }
```
- Nach Erledigung: `next_due_date = completed_at + interval_days`

#### schedule — JSON-Patterns:
```json
{ "type": "weekly", "weekdays": [1, 3, 6] }
```
```json
{ "type": "monthly", "days": [1, 15] }
```
```json
{ "type": "specific_dates", "dates": ["2026-06-21", "2026-12-21"] }
```

Wochentage: 0 = So, 1 = Mo, …, 6 = Sa

Nach Erledigung: `next_due_date = nächstes Datum aus Pattern, strikt nach completed_at`

### 3.4 Überfälligkeits-Logik

**Ohne Uhrzeit (`has_specific_time = 0`):**
```
is_overdue = next_due_date < today
```

**Mit Uhrzeit (`has_specific_time = 1`):**
```
grace_deadline = next_due_datetime + grace_period_minutes
is_overdue = now() > grace_deadline
```

### 3.5 Verschieben & Überspringen

**Verschieben** (one_time + recurring):
- Eingabe: konkretes Datum oder "in X Tagen" (wird zu absolutem Datum aufgelöst)
- Setzt `next_due_date` (und `next_due_datetime` wenn relevant) auf das neue Datum
- Keine Completion wird geloggt

**Überspringen** (nur recurring):
- Berechnet die nächste Occurrence aus dem Pattern/Interval ab `today`, ohne die aktuelle zu loggen
- Setzt `next_due_date` auf das berechnete Datum
- Kein Completion-Eintrag

### 3.6 Warte-Status

- `status = 'waiting'`: Task erscheint nicht in Muss/Kann
- `waiting_for`: Freitext (z.B. "Andrea", "Vermieter")
- `waiting_until`: Follow-up-Datum; bei Eingabe wahlweise konkretes Datum oder "in X Tagen"
- Sobald `waiting_until <= today`: erscheint Task in der **Nachfassen**-Sektion in "Heute"
- Wieder aktivieren: `status = 'active'`, `waiting_for`/`waiting_until` löschen

### 3.7 Einsortieren (Inbox → Task)

Flow beim Antippen eines Inbox-Items:
1. Bottom-Sheet oder Vollbild-Formular öffnet sich
2. Titel ist vorausgefüllt mit dem Inbox-Text
3. Pflichtfelder: Space, Liste
4. Optionale Felder: Titel bearbeiten, Notes, Recurrence-Typ, Due Date, Start Date
5. Speichern → Task angelegt, Inbox-Item gelöscht

---

## 4. Views im Detail

### Heute-Tab
```
Samstag, 28. März

┌─ Zeitplan ──────────────────────────────────────┐
│  08:00  Medikament nehmen                        │
│  14:00  Anruf bei Bank  ← in 3h                  │
└─ (nur wenn Tasks mit Uhrzeit heute fällig sind) ─┘

┌─ Nachfassen (1) ────────────────────────────────┐
│  ○  Angebot von Stefan  · wartet seit gestern    │
└─────────────────────────────────────────────────┘

┌─ Muss (3) ──────────────────────────────────────┐
│  ○  Rechnung bezahlen   · überfällig seit Mi     │
│  ○  Müll rausbringen    · heute                  │
│  ○  E-Mail an Chef      · heute                  │
└─────────────────────────────────────────────────┘

┌─ Kann (5) ──────────────────────────────────────┐
│  ○  Buch lesen          · notes: "Kapitel 4..."  │
│  ○  Termin buchen       · ab morgen fällig       │
│  ...                                             │
└─────────────────────────────────────────────────┘

┌─ Wartet (2) ▶ (eingeklappt) ───────────────────┐
│  ...                                             │
└─────────────────────────────────────────────────┘
```

Der Zeitplan-Block erscheint nur, wenn mindestens ein Task mit `has_specific_time = 1` heute fällig ist. Er dient als "Tagesübersicht" morgens.

### Inbox-Tab
```
┌─────────────────────────────────────────────────┐
│  Was willst du nicht vergessen?                 │
│  [_________________________________] [+]         │
└─────────────────────────────────────────────────┘

  "Zahnarzt anrufen"          manuell · vor 2h   →
  "Buch bestellen"            Webhook · gestern   →
  "Regal aufbauen"            manuell · vor 3 Tagen →

  (leer: "Inbox ist leer ✓")
```

Quelle (manual/webhook) wird einzeilig angezeigt. Antippen → Einsortier-Flow.

### Listen-Tab
```
[Privat ×]  [Haushalt]  [Arbeit]     ← Space-Filter-Chips

— Einkaufen ──────────────────────────────────────
  ○  Haferflocken           · heute fällig
  ○  Shampoo                · 01.04.
     notes: "Drogerie..."
  ⛔ Drucker reparieren     · blockiert
     → Druckerpatrone bestellen

— Arbeit ─────────────────────────────────────────
  ○  Präsentation           · 05.04.
  ◷  Reisekostenabrechnung  · pausiert
  ...
```

Badges:
- `⛔` = blockiert
- `◷` = pausiert (`active = 0`)
- `⏳` = wartet
- Startdatum in der Zukunft: gedimmt mit Datumsanzeige

### Einstellungen-Tab
```
— Profil ──────────────────────────────────────────
  Name, E-Mail, Passwort ändern

— Spaces ──────────────────────────────────────────
  [Privat]  Nur du  ·  3 Listen
  [Haushalt]  Du + Andrea  ·  5 Listen
  [+] Space erstellen
  [+] Space beitreten (Code eingeben)

— Benachrichtigungen ──────────────────────────────
  Inbox-Erinnerung:  [20:00]
  Push-Notifications: [Browser-Permission anfordern]

— Webhook ─────────────────────────────────────────
  Token: abc123xyz...  [Kopieren]  [Neu generieren]
  Endpoint: POST /api/webhook/inbox/{token}
  Payload: { "text": "Aufgabe" }
```

---

## 5. API

### Auth
```
POST   /api/auth/register          { name, email, password }
POST   /api/auth/login             { email, password }
POST   /api/auth/logout
GET    /api/auth/me
```

### Spaces
```
GET    /api/spaces
POST   /api/spaces                 { name }
PUT    /api/spaces/:id             { name }
DELETE /api/spaces/:id
GET    /api/spaces/:id/invite-code           (nur owner)
POST   /api/spaces/:id/join        { invite_code }
DELETE /api/spaces/:id/members/:userId       (nur owner)
```

### Listen
```
GET    /api/spaces/:id/lists
POST   /api/spaces/:id/lists       { name, color, icon? }
PUT    /api/spaces/:id/lists/:listId
DELETE /api/spaces/:id/lists/:listId
PUT    /api/spaces/:id/lists/reorder  { order: [id, id, ...] }
```

### Tasks
```
GET    /api/spaces/:id/tasks                 (Filter: list_id, status, due_before, include_inactive)
POST   /api/spaces/:id/tasks
GET    /api/spaces/:id/tasks/:taskId
PUT    /api/spaces/:id/tasks/:taskId
DELETE /api/spaces/:id/tasks/:taskId
POST   /api/spaces/:id/tasks/:taskId/complete   { notes? }
POST   /api/spaces/:id/tasks/:taskId/skip
POST   /api/spaces/:id/tasks/:taskId/postpone   { date } | { days }
```

### Dependencies
```
GET    /api/spaces/:id/tasks/:taskId/dependencies
POST   /api/spaces/:id/tasks/:taskId/dependencies  { depends_on_id }
DELETE /api/spaces/:id/tasks/:taskId/dependencies/:depId
```

### Inbox
```
GET    /api/inbox
POST   /api/inbox                  { text }
DELETE /api/inbox/:itemId
POST   /api/inbox/:itemId/convert  { space_id, list_id, title?, notes?, recurrence_type, due_date?, start_date? }
```

### User-Einstellungen
```
PUT    /api/user/settings          { name?, inbox_reminder_time? }
PUT    /api/user/password          { current_password, new_password }
GET    /api/user/webhook-token
POST   /api/user/webhook-token/regenerate
```

### Push
```
POST   /api/push/subscribe         { endpoint, keys }
DELETE /api/push/unsubscribe
```

### Real-Time
```
GET    /api/events                 SSE — alle Spaces des eingeloggten Users
```

### Webhook (public)
```
POST   /api/webhook/inbox/:token   { text }
       → 201 Created oder 401 Unauthorized
```

---

## 6. Real-Time (SSE)

Ein SSE-Endpoint `/api/events` für alle Spaces des eingeloggten Users.

Events (payload enthält immer `space_id` und `data`):

| Event | Auslöser |
|---|---|
| `task_added` | Neuer Task in einem Space |
| `task_updated` | Task bearbeitet |
| `task_completed` | Task abgehakt (+ `completed_by_name`) |
| `task_deleted` | Task gelöscht |
| `list_added` | Neue Liste |
| `list_updated` | Liste bearbeitet |
| `list_deleted` | Liste gelöscht |
| `space_member_joined` | Jemand ist beigetreten |
| `inbox_item_added` | Item per Webhook eingegangen |

---

## 7. Offline-Verhalten

**Offline Queue (IndexedDB via idb-keyval):** Nur schreibende Aktionen werden gequeued:
- Task abschließen
- Task überspringen / verschieben
- Inbox-Item hinzufügen

Beim Reconnect: Queue wird in chronologischer Reihenfolge abgearbeitet.

**Lesende Operationen:** Service Worker cached API-Responses. Cache-first für Kerndaten (Tasks, Listen, Spaces).

---

## 8. Push-Notifications

| Trigger | Zeitpunkt | Text |
|---|---|---|
| Task mit Uhrzeit fällig | Zur angegebenen Uhrzeit | "Fällig: [Titel]" |
| Follow-up (waiting_until) | An dem Tag (morgens) | "[waiting_for] – Zeit nachzuhaken?" |
| Inbox-Erinnerung | `inbox_reminder_time` täglich (nur wenn Inbox nicht leer) | "Inbox leeren: [N] Items warten" |
| Anderes Space-Mitglied erledigt Task | Sofort | "[Name] hat erledigt: [Titel]" |
| Anderes Space-Mitglied fügt Task hinzu | Sofort | "[Name] hat hinzugefügt: [Titel]" |

---

## 9. Technik-Stack

Gemäß `WEBAPP_GUIDELINES.md`:

**Frontend (`/app`):**
- Vue 3 + Vite, Composition API (`<script setup>`)
- Vuetify 3 (tree-shaken via `vite-plugin-vuetify`)
- Pinia (Setup-Store-Stil)
- Vue Router 4 (`createWebHistory`)
- `vite-plugin-pwa` (`registerType: 'prompt'`)
- `idb-keyval` für Offline-Queue
- `@vueuse/core` (`useOnline`, etc.), `date-fns`
- Deploy: GitHub Pages (`gh-pages --dotfiles`)

**Backend (`/api`):**
- Node.js + Express, ES Modules
- SQLite via `better-sqlite3`
- Session-Auth mit Cookies (`bcryptjs` für Hashing)
- Zod für Request-Validierung
- `web-push` für Push-Notifications
- Scheduler für tägliche Reminders (node-cron oder node --watch)
- PM2 + nginx auf Raspberry Pi (Production)

---

## 10. Bewusst ausgeklammert (v2)

- **Stats-View:** Daten sind ab Tag 1 vollständig in `completions` gespeichert
- **Skip-Aktion in der UI** (API ist vorhanden)
- **LLM-Analyse von Inbox-Items**
- **Kalender-Ansicht**
