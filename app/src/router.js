import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth.js';

const routes = [
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { requiresGuest: true } },
  {
    path: '/',
    component: () => import('./views/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/today' },
      { path: 'today', component: () => import('./views/TodayView.vue') },
      { path: 'inbox', component: () => import('./views/InboxView.vue') },
      { path: 'lists', component: () => import('./views/ListsView.vue') },
      { path: 'settings', component: () => import('./views/SettingsView.vue') },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.initialized) await auth.checkAuth();

  if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login';
  if (to.meta.requiresGuest && auth.isAuthenticated) return '/today';
});

export default router;
