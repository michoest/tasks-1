import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';

import App from './App.vue';
import router from './router.js';

const vuetify = createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          background: '#eef1f8',
          surface: '#ffffff',
          'surface-variant': '#e2e6f0',
          primary: '#1a56db',
          secondary: '#0891b2',
          error: '#dc2626',
          warning: '#d97706',
          info: '#0369a1',
          success: '#16a34a',
        },
      },
    },
  },
  defaults: {
    VBtn: { rounded: 'lg' },
    VCard: { rounded: 'lg' },
    VTextField: { variant: 'solo-filled', density: 'comfortable', flat: true },
    VSelect: { variant: 'solo-filled', density: 'comfortable', flat: true },
    VTextarea: { variant: 'solo-filled', density: 'comfortable', flat: true },
  },
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(vuetify);
app.mount('#app');
