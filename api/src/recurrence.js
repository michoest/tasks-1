// Recurrence calculation helpers.
// All dates are handled as YYYY-MM-DD strings or Date objects (local time).

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function parsePattern(task) {
  try {
    return typeof task.schedule_pattern === 'string'
      ? JSON.parse(task.schedule_pattern)
      : task.schedule_pattern;
  } catch {
    return null;
  }
}

// Returns the next YYYY-MM-DD strictly after `fromDate` for a schedule pattern.
function nextFromPattern(pattern, fromDate) {
  if (!pattern) return null;
  const from = new Date(fromDate + 'T00:00:00');

  if (pattern.type === 'weekly') {
    // weekdays: array of 0-6 (0=Sun)
    const days = (pattern.weekdays || []).map(Number).sort((a, b) => a - b);
    if (!days.length) return null;
    for (let i = 1; i <= 14; i++) {
      const candidate = new Date(from);
      candidate.setDate(from.getDate() + i);
      if (days.includes(candidate.getDay())) return toDateStr(candidate);
    }
    return null;
  }

  if (pattern.type === 'monthly') {
    // days: array of day-of-month numbers
    const days = (pattern.days || []).map(Number).sort((a, b) => a - b);
    if (!days.length) return null;
    // Check remaining days in current month, then next month
    for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
      const year = from.getFullYear();
      const month = from.getMonth() + monthOffset;
      for (const day of days) {
        const candidate = new Date(year, month, day);
        if (candidate > from) return toDateStr(candidate);
      }
    }
    return null;
  }

  if (pattern.type === 'specific_dates') {
    const sorted = (pattern.dates || []).slice().sort();
    return sorted.find(d => d > fromDate) || null;
  }

  return null;
}

// Calculate next_due_date and next_due_datetime after a completion or skip.
// `completedAt` is an ISO datetime string (or YYYY-MM-DD for date-only).
export function calcNextDue(task, completedAt) {
  const today = completedAt.slice(0, 10); // YYYY-MM-DD

  let nextDate = null;

  if (task.recurrence_type === 'one_time') {
    return { next_due_date: null, next_due_datetime: null };
  }

  if (task.recurrence_type === 'interval') {
    nextDate = addDays(today, task.interval_days || 1);
  }

  if (task.recurrence_type === 'schedule') {
    const pattern = parsePattern(task);
    nextDate = nextFromPattern(pattern, today);
  }

  if (!nextDate) return { next_due_date: null, next_due_datetime: null };

  const next_due_datetime =
    task.has_specific_time && task.time_of_day
      ? `${nextDate}T${task.time_of_day}:00`
      : null;

  return { next_due_date: nextDate, next_due_datetime };
}

// Calculate next occurrence for a skip.
// If the task is already due in the future, skip from that future date (not today),
// so skipping always advances by one occurrence.
export function calcNextSkip(task) {
  const today = toDateStr(new Date());
  const base = task.next_due_date && task.next_due_date > today ? task.next_due_date : today;
  return calcNextDue(task, base);
}

// Determine if a task is currently overdue.
export function isOverdue(task) {
  const today = toDateStr(new Date());
  if (!task.next_due_date) return false;

  if (!task.has_specific_time || !task.next_due_datetime) {
    return task.next_due_date < today;
  }

  const graceMs = (task.grace_period_minutes || 120) * 60 * 1000;
  const dueMs = new Date(task.next_due_datetime).getTime();
  return Date.now() > dueMs + graceMs;
}

// Check if a task is blocked (all of its dependencies must be "done for this cycle").
// Takes an array of dependency task objects.
export function isBlocked(dependencyTasks) {
  const today = toDateStr(new Date());
  for (const dep of dependencyTasks) {
    const oneTimeDone = dep.recurrence_type === 'one_time' && dep.status === 'done';
    const recurringDone =
      dep.recurrence_type !== 'one_time' && dep.next_due_date && dep.next_due_date > today;
    if (!oneTimeDone && !recurringDone) return true;
  }
  return false;
}

// Build initial next_due_date when creating a new task.
export function initialNextDue(task) {
  if (task.recurrence_type === 'one_time') {
    return {
      next_due_date: task.due_date || null,
      next_due_datetime:
        task.due_date && task.has_specific_time && task.time_of_day
          ? `${task.due_date}T${task.time_of_day}:00`
          : null,
    };
  }

  const today = toDateStr(new Date());
  const from = task.due_date && task.due_date < today ? task.due_date : today;

  // For a new recurring task, set next_due to today (or the specified due_date if in the future).
  if (task.recurrence_type === 'interval') {
    const nextDate = task.due_date || today;
    return {
      next_due_date: nextDate,
      next_due_datetime:
        task.has_specific_time && task.time_of_day ? `${nextDate}T${task.time_of_day}:00` : null,
    };
  }

  if (task.recurrence_type === 'schedule') {
    const pattern = parsePattern(task);
    // Use day before `from` so nextFromPattern returns on or after `from`
    const prev = addDays(from, -1);
    const nextDate = nextFromPattern(pattern, prev) || today;
    return {
      next_due_date: nextDate,
      next_due_datetime:
        task.has_specific_time && task.time_of_day ? `${nextDate}T${task.time_of_day}:00` : null,
    };
  }

  return { next_due_date: null, next_due_datetime: null };
}

// Detect cycle in dependency graph using DFS.
// `edges` is a Map<taskId, Set<dependsOnId>> for all tasks in the space.
export function hasCycle(edges, startId, newDepId) {
  // Check if newDepId can reach startId (which would create a cycle)
  const visited = new Set();
  const stack = [newDepId];
  while (stack.length) {
    const node = stack.pop();
    if (node === startId) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    const deps = edges.get(node) || new Set();
    for (const dep of deps) stack.push(dep);
  }
  return false;
}
