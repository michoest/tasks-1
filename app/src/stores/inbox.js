import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../services/api.js';

export const useInboxStore = defineStore('inbox', () => {
  const items = ref([]);

  async function load() {
    items.value = await api.getInbox();
  }

  async function add(text) {
    const item = await api.addInboxItem(text);
    items.value.push(item);
    return item;
  }

  async function remove(id) {
    await api.deleteInboxItem(id);
    items.value = items.value.filter(i => i.id !== id);
  }

  async function convert(id, data) {
    const task = await api.convertInboxItem(id, data);
    items.value = items.value.filter(i => i.id !== id);
    return task;
  }

  function applyIncomingItem(item) {
    if (!items.value.find(i => i.id === item.id)) {
      items.value.push(item);
    }
  }

  return { items, load, add, remove, convert, applyIncomingItem };
});
