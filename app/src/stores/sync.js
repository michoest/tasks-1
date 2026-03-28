import { ref } from 'vue';
import { defineStore } from 'pinia';
import { useOnline } from '@vueuse/core';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';
import { api } from '../services/api.js';

const QUEUE_PREFIX = 'sync_queue_';

export const useSyncStore = defineStore('sync', () => {
  const isOnline = useOnline();
  const syncing = ref(false);

  // Watch for reconnection and drain queue
  let wasOnline = isOnline.value;
  setInterval(async () => {
    if (isOnline.value && !wasOnline) {
      await syncQueue();
    }
    wasOnline = isOnline.value;
  }, 2000);

  async function enqueue(action) {
    const id = `${QUEUE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await idbSet(id, { ...action, id, queued_at: Date.now() });
  }

  async function syncQueue() {
    if (syncing.value) return;
    syncing.value = true;
    try {
      const allKeys = (await idbKeys()).filter(k => String(k).startsWith(QUEUE_PREFIX));
      const items = await Promise.all(allKeys.map(k => idbGet(k)));
      const sorted = items.filter(Boolean).sort((a, b) => a.queued_at - b.queued_at);

      for (const item of sorted) {
        try {
          await executeAction(item);
          await idbDel(item.id);
        } catch {
          // Leave failed items in queue; will retry next sync
        }
      }
    } finally {
      syncing.value = false;
    }
  }

  async function executeAction(action) {
    switch (action.type) {
      case 'complete_task':
        await api.completeTask(action.spaceId, action.taskId, action.notes);
        break;
      case 'skip_task':
        await api.skipTask(action.spaceId, action.taskId);
        break;
      case 'postpone_task':
        await api.postponeTask(action.spaceId, action.taskId, action.payload);
        break;
      case 'add_inbox':
        await api.addInboxItem(action.text);
        break;
    }
  }

  return { isOnline, syncing, enqueue, syncQueue };
});
