const BASE = import.meta.env.VITE_API_URL || '';

class ApiService {
  async request(method, path, body) {
    const opts = {
      method,
      credentials: 'include',
      headers: {},
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${path}`, opts);
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  delete(path, body) { return this.request('DELETE', path, body); }

  // Auth
  me() { return this.get('/api/auth/me'); }
  login(email, password) { return this.post('/api/auth/login', { email, password }); }
  register(name, email, password) { return this.post('/api/auth/register', { name, email, password }); }
  logout() { return this.post('/api/auth/logout'); }

  // User settings
  updateSettings(data) { return this.put('/api/user/settings', data); }
  updatePassword(current_password, new_password) { return this.put('/api/user/password', { current_password, new_password }); }
  getWebhookToken() { return this.get('/api/user/webhook-token'); }
  regenerateWebhookToken() { return this.post('/api/user/webhook-token/regenerate'); }
  getPushConfig() { return this.get('/api/user/push-config'); }
  subscribePush(subscription) { return this.post('/api/user/push/subscribe', subscription); }
  unsubscribePush(endpoint) { return this.delete('/api/user/push/unsubscribe', { endpoint }); }

  // Spaces
  getSpaces() { return this.get('/api/spaces'); }
  createSpace(name) { return this.post('/api/spaces', { name }); }
  updateSpace(id, name) { return this.put(`/api/spaces/${id}`, { name }); }
  deleteSpace(id) { return this.delete(`/api/spaces/${id}`); }
  getInviteCode(id) { return this.get(`/api/spaces/${id}/invite-code`); }
  joinSpace(id, invite_code) { return this.post(`/api/spaces/${id}/join`, { invite_code }); }
  removeMember(spaceId, userId) { return this.delete(`/api/spaces/${spaceId}/members/${userId}`); }
  setSpaceColor(id, color) { return this.put(`/api/spaces/${id}/my-color`, { color }); }

  // Lists
  getLists(spaceId) { return this.get(`/api/spaces/${spaceId}/lists`); }
  createList(spaceId, data) { return this.post(`/api/spaces/${spaceId}/lists`, data); }
  updateList(spaceId, listId, data) { return this.put(`/api/spaces/${spaceId}/lists/${listId}`, data); }
  deleteList(spaceId, listId) { return this.delete(`/api/spaces/${spaceId}/lists/${listId}`); }
  reorderLists(spaceId, order) { return this.put(`/api/spaces/${spaceId}/lists/reorder`, { order }); }

  // Tasks
  getTasks(spaceId, params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/api/spaces/${spaceId}/tasks${q ? '?' + q : ''}`);
  }
  getTask(spaceId, taskId) { return this.get(`/api/spaces/${spaceId}/tasks/${taskId}`); }
  createTask(spaceId, data) { return this.post(`/api/spaces/${spaceId}/tasks`, data); }
  updateTask(spaceId, taskId, data) { return this.put(`/api/spaces/${spaceId}/tasks/${taskId}`, data); }
  deleteTask(spaceId, taskId) { return this.delete(`/api/spaces/${spaceId}/tasks/${taskId}`); }
  completeTask(spaceId, taskId, notes) { return this.post(`/api/spaces/${spaceId}/tasks/${taskId}/complete`, { notes }); }
  skipTask(spaceId, taskId) { return this.post(`/api/spaces/${spaceId}/tasks/${taskId}/skip`); }
  postponeTask(spaceId, taskId, dateOrDays) { return this.post(`/api/spaces/${spaceId}/tasks/${taskId}/postpone`, dateOrDays); }

  // Dependencies
  getDependencies(spaceId, taskId) { return this.get(`/api/spaces/${spaceId}/tasks/${taskId}/dependencies`); }
  addDependency(spaceId, taskId, depends_on_id) { return this.post(`/api/spaces/${spaceId}/tasks/${taskId}/dependencies`, { depends_on_id }); }
  removeDependency(spaceId, taskId, depId) { return this.delete(`/api/spaces/${spaceId}/tasks/${taskId}/dependencies/${depId}`); }

  // Inbox
  getInbox() { return this.get('/api/inbox'); }
  addInboxItem(text) { return this.post('/api/inbox', { text }); }
  deleteInboxItem(id) { return this.delete(`/api/inbox/${id}`); }
  convertInboxItem(id, data) { return this.post(`/api/inbox/${id}/convert`, data); }
}

export const api = new ApiService();
