<template>
  <v-app>
    <v-main class="main-content">
      <router-view />
    </v-main>

    <!-- Bottom navigation -->
    <v-bottom-navigation
      v-model="activeTab"
      :elevation="4"
      class="bottom-nav"
      grow
    >
      <v-btn value="today" to="/today">
        <v-icon>mdi-calendar-today</v-icon>
      </v-btn>
      <v-btn value="inbox" to="/inbox">
        <v-badge :content="inboxCount || undefined" :model-value="inboxCount > 0" color="secondary">
          <v-icon>mdi-inbox</v-icon>
        </v-badge>
      </v-btn>
      <!-- Leerplatz für FAB in der Mitte -->
      <div class="fab-spacer" />
      <v-btn value="lists" to="/lists">
        <v-icon>mdi-format-list-bulleted</v-icon>
      </v-btn>
      <v-btn value="settings" to="/settings">
        <v-icon>mdi-cog</v-icon>
      </v-btn>
    </v-bottom-navigation>

    <!-- Zentrierter Inbox-FAB (Google Tasks-Stil) -->
    <v-btn
      class="center-fab"
      icon
      rounded="circle"
      size="56"
      color="primary"
      elevation="6"
      @click="showQuickAdd = true"
    >
      <v-icon size="28">mdi-plus</v-icon>
    </v-btn>

    <!-- Online-Status-Chip — erscheint nur wenn offline -->
    <transition name="fade">
      <v-chip
        v-if="!sync.isOnline"
        class="offline-chip"
        color="warning"
        prepend-icon="mdi-wifi-off"
        size="small"
        label
      >
        Offline
      </v-chip>
    </transition>

    <!-- Quick-add bottom sheet -->
    <v-bottom-sheet v-model="showQuickAdd" :scrim="true">
      <v-card class="pa-4 pb-6" rounded="t-xl">
        <div class="text-caption text-medium-emphasis mb-2">Zur Inbox hinzufügen</div>
        <v-text-field
          v-model="quickText"
          placeholder="Was willst du nicht vergessen?"
          hide-details
          autofocus
          @keydown.enter="submitQuickAdd"
          @keydown.esc="showQuickAdd = false"
        >
          <template #append-inner>
            <v-btn icon size="small" :disabled="!quickText.trim()" @click="submitQuickAdd">
              <v-icon>mdi-send</v-icon>
            </v-btn>
          </template>
        </v-text-field>
      </v-card>
    </v-bottom-sheet>
  </v-app>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useInboxStore } from '../stores/inbox.js';
import { useTasksStore } from '../stores/tasks.js';
import { useSyncStore } from '../stores/sync.js';
import { useSseStore } from '../stores/sse.js';

const route = useRoute();
const inbox = useInboxStore();
const tasks = useTasksStore();
const sync = useSyncStore();
const sse = useSseStore();

const activeTab = computed(() => route.path.split('/')[1] || 'today');
const inboxCount = computed(() => inbox.items.length);

const showQuickAdd = ref(false);
const quickText = ref('');

async function submitQuickAdd() {
  if (!quickText.value.trim()) return;
  if (sync.isOnline) {
    await inbox.add(quickText.value.trim());
  } else {
    await sync.enqueue({ type: 'add_inbox', text: quickText.value.trim() });
  }
  quickText.value = '';
  showQuickAdd.value = false;
}

watch(showQuickAdd, (v) => { if (!v) quickText.value = ''; });

onMounted(async () => {
  sse.connect();
  await tasks.loadSpaces();
  await tasks.loadAllTasks();
  await inbox.load();
});
</script>

<style scoped>
.main-content {
  padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  height: calc(56px + env(safe-area-inset-bottom, 0px)) !important;
}

/* Placeholder so the two center nav-items don't crowd the FAB */
.fab-spacer {
  width: 64px;
  flex-shrink: 0;
  pointer-events: none;
}

/* Centered FAB overlapping the bottom nav (Google Tasks style) */
.center-fab {
  position: fixed;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
}

/* Offline indicator — top-right, subtle */
.offline-chip {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 300;
}

.fade-enter-active,
.fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
