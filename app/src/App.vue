<template>
  <!-- Splash screen: always in DOM, shown until auth is resolved -->
  <div v-if="showSplash" class="splash">
    <div class="splash-content">
      <v-icon size="64" color="primary">mdi-check-circle-outline</v-icon>
      <div class="splash-title mt-3">Tasks</div>
    </div>
  </div>

  <v-app v-show="!showSplash" class="app-container">
    <router-view />
  </v-app>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useAuthStore } from './stores/auth.js';

const auth = useAuthStore();
const showSplash = ref(true);

watch(
  () => auth.initialized,
  (ready) => {
    if (ready) setTimeout(() => { showSplash.value = false; }, 150);
  },
);
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
}

.splash {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f6;
  z-index: 9999;
}

.splash-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.splash-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #333;
  letter-spacing: 0.05em;
}

.app-container {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
</style>
