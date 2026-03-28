import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../services/api.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const initialized = ref(false);
  const loading = ref(false);
  const error = ref(null);

  const isAuthenticated = computed(() => !!user.value);

  async function checkAuth() {
    try {
      const data = await api.me();
      user.value = data.user;
    } catch {
      user.value = null;
    } finally {
      initialized.value = true;
    }
  }

  async function login(email, password) {
    loading.value = true;
    error.value = null;
    try {
      const data = await api.login(email, password);
      user.value = data.user;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function register(name, email, password) {
    loading.value = true;
    error.value = null;
    try {
      const data = await api.register(name, email, password);
      user.value = data.user;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    await api.logout();
    user.value = null;
  }

  function updateUser(updates) {
    if (user.value) user.value = { ...user.value, ...updates };
  }

  return { user, initialized, loading, error, isAuthenticated, checkAuth, login, register, logout, updateUser };
});
