import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../services/api.js';

export const useTasksStore = defineStore('tasks', () => {
  const spaces = ref([]);
  const tasksBySpace = ref({}); // spaceId -> task[]
  const listsBySpace = ref({}); // spaceId -> list[]
  const loading = ref(false);

  async function loadSpaces() {
    spaces.value = await api.getSpaces();
    // Load lists for all spaces
    for (const space of spaces.value) {
      listsBySpace.value[space.id] = await api.getLists(space.id);
    }
  }

  async function loadTasks(spaceId, params = {}) {
    const tasks = await api.getTasks(spaceId, { include_inactive: true, ...params });
    tasksBySpace.value[spaceId] = tasks;
    return tasks;
  }

  async function loadAllTasks() {
    for (const space of spaces.value) {
      await loadTasks(space.id, { include_inactive: true });
    }
  }

  // Today view: collect all tasks across all spaces, compute sections
  function getTodayTasks() {
    const today = new Date().toISOString().slice(0, 10);
    const followUp = [];
    const must = [];
    const can = [];
    const waiting = [];

    for (const [spaceId, tasks] of Object.entries(tasksBySpace.value)) {
      for (const task of tasks) {
        if (!task.active) continue;
        if (task.start_date && task.start_date > today) continue;

        // Waiting follow-ups go to Nachfassen regardless of blocked status
        if (task.status === 'waiting' && task.waiting_until && task.waiting_until <= today) {
          followUp.push({ ...task, space_id: Number(spaceId) });
          continue;
        }

        if (task.status === 'waiting') {
          waiting.push({ ...task, space_id: Number(spaceId) });
          continue;
        }

        if (task.status !== 'active') continue;
        if (task.blocked) continue;

        const isDue = task.next_due_date && task.next_due_date <= today;
        if (isDue) {
          must.push({ ...task, space_id: Number(spaceId) });
        } else {
          can.push({ ...task, space_id: Number(spaceId) });
        }
      }
    }

    // Sort must: overdue first, then by date
    must.sort((a, b) => (a.next_due_date || '').localeCompare(b.next_due_date || ''));
    can.sort((a, b) => (a.next_due_date || 'zzzz').localeCompare(b.next_due_date || 'zzzz'));

    return { followUp, must, can, waiting };
  }

  function getScheduledToday() {
    const today = new Date().toISOString().slice(0, 10);
    const result = [];
    for (const tasks of Object.values(tasksBySpace.value)) {
      for (const task of tasks) {
        if (task.has_specific_time && task.next_due_date === today && task.time_of_day) {
          result.push(task);
        }
      }
    }
    return result.sort((a, b) => a.time_of_day.localeCompare(b.time_of_day));
  }

  // Apply a task update from SSE or local action
  function applyTaskUpdate(spaceId, updatedTask) {
    const tasks = tasksBySpace.value[spaceId];
    if (!tasks) return;
    const idx = tasks.findIndex(t => t.id === updatedTask.id);
    if (idx >= 0) tasks[idx] = updatedTask;
    else tasks.push(updatedTask);
  }

  function applyTaskDelete(spaceId, taskId) {
    const tasks = tasksBySpace.value[spaceId];
    if (!tasks) return;
    tasksBySpace.value[spaceId] = tasks.filter(t => t.id !== taskId);
  }

  function applyListUpdate(spaceId, list, type) {
    if (!listsBySpace.value[spaceId]) listsBySpace.value[spaceId] = [];
    if (type === 'deleted') {
      listsBySpace.value[spaceId] = listsBySpace.value[spaceId].filter(l => l.id !== list);
    } else if (type === 'added') {
      if (!listsBySpace.value[spaceId].find(l => l.id === list.id))
        listsBySpace.value[spaceId].push(list);
    } else {
      const idx = listsBySpace.value[spaceId].findIndex(l => l.id === list.id);
      if (idx >= 0) listsBySpace.value[spaceId][idx] = list;
    }
  }

  function getListName(listId) {
    for (const lists of Object.values(listsBySpace.value)) {
      const found = lists.find(l => l.id === listId);
      if (found) return found;
    }
    return null;
  }

  return {
    spaces, tasksBySpace, listsBySpace, loading,
    loadSpaces, loadTasks, loadAllTasks,
    getTodayTasks, getScheduledToday,
    applyTaskUpdate, applyTaskDelete, applyListUpdate,
    getListName,
  };
});
