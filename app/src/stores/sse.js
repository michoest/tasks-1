import { defineStore } from 'pinia';
import { useTasksStore } from './tasks.js';
import { useInboxStore } from './inbox.js';

export const useSseStore = defineStore('sse', () => {
  let eventSource = null;
  let reconnectTimer = null;

  function connect() {
    if (eventSource) return;
    eventSource = new EventSource('/api/events', { withCredentials: true });

    eventSource.onopen = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      // Exponential backoff reconnect
      reconnectTimer = setTimeout(connect, 5000);
    };

    const tasksStore = useTasksStore();
    const inboxStore = useInboxStore();

    // Task events
    for (const event of ['task_added', 'task_updated', 'task_completed']) {
      eventSource.addEventListener(event, (e) => {
        const { space_id, task } = JSON.parse(e.data);
        tasksStore.applyTaskUpdate(space_id, task);
      });
    }

    eventSource.addEventListener('task_deleted', (e) => {
      const { space_id, task_id } = JSON.parse(e.data);
      tasksStore.applyTaskDelete(space_id, task_id);
    });

    eventSource.addEventListener('list_added', (e) => {
      const { space_id, list } = JSON.parse(e.data);
      tasksStore.applyListUpdate(space_id, list, 'added');
    });

    eventSource.addEventListener('list_updated', (e) => {
      const { space_id, list } = JSON.parse(e.data);
      tasksStore.applyListUpdate(space_id, list, 'updated');
    });

    eventSource.addEventListener('list_deleted', (e) => {
      const { space_id, list_id } = JSON.parse(e.data);
      tasksStore.applyListUpdate(space_id, list_id, 'deleted');
    });

    eventSource.addEventListener('inbox_item_added', (e) => {
      const { item } = JSON.parse(e.data);
      inboxStore.applyIncomingItem(item);
    });
  }

  function disconnect() {
    eventSource?.close();
    eventSource = null;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  return { connect, disconnect };
});
