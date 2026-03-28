<template>
  <div class="today-view">
    <!-- Header -->
    <div class="today-header px-4 pt-4 pb-2">
      <div class="d-flex align-center gap-2">
        <div class="text-h6 font-weight-bold flex-grow-1">{{ formattedDate }}</div>
        <v-btn icon size="small" variant="text" @click="showFilter = !showFilter">
          <v-icon :color="hasFilter ? 'primary' : undefined">mdi-filter-outline</v-icon>
        </v-btn>
      </div>
      <div class="text-caption text-medium-emphasis">{{ summaryLine }}</div>
    </div>

    <!-- Space-Filter -->
    <div v-if="showFilter" class="px-3 pb-2 d-flex flex-wrap gap-1">
      <v-chip
        v-for="space in tasksStore.spaces"
        :key="space.id"
        :color="!hiddenSpaces.has(space.id) ? (space.my_color || 'primary') : undefined"
        :variant="!hiddenSpaces.has(space.id) ? 'flat' : 'outlined'"
        size="small"
        @click="toggleSpace(space.id)"
      >
        {{ space.name }}
      </v-chip>
    </div>

    <v-divider />

    <div class="today-scroll pa-3">
      <!-- Zeitplan (tasks with specific time today) -->
      <div v-if="scheduledToday.length" class="mb-4">
        <div class="section-label">Zeitplan</div>
        <v-card class="pa-3" variant="tonal" color="info">
          <div v-for="task in scheduledToday" :key="task.id" class="d-flex align-center gap-3 py-1">
            <span class="text-caption font-weight-bold" style="min-width:40px;">{{ task.time_of_day }}</span>
            <span class="text-body-2">{{ task.title }}</span>
            <v-spacer />
            <v-btn icon size="x-small" variant="text" @click="completeTask(task)">
              <v-icon>mdi-check</v-icon>
            </v-btn>
          </div>
        </v-card>
      </div>

      <!-- Nachfassen -->
      <div v-if="todayTasks.followUp.length" class="mb-4">
        <div class="section-label warning-label">
          <v-icon size="14" class="mr-1">mdi-bell-ring-outline</v-icon>
          Nachfassen ({{ todayTasks.followUp.length }})
        </div>
        <v-list class="task-list">
          <task-item
            v-for="task in todayTasks.followUp"
            :key="task.id"
            :task="task"
            show-list
            show-space
            @open="openAction(task)"
            @complete="completeTask(task)"
          />
        </v-list>
      </div>

      <!-- Muss -->
      <div v-if="todayTasks.must.length" class="mb-4">
        <div class="section-label error-label">
          Muss ({{ todayTasks.must.length }})
        </div>
        <v-list class="task-list">
          <task-item
            v-for="task in todayTasks.must"
            :key="task.id"
            :task="task"
            show-list
            show-space
            @open="openAction(task)"
            @complete="completeTask(task)"
          />
        </v-list>
      </div>

      <!-- Kann -->
      <div v-if="todayTasks.can.length" class="mb-4">
        <div class="section-label cursor-pointer d-flex align-center" @click="showCan = !showCan">
          <v-icon size="14" class="mr-1">{{ showCan ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
          Kann ({{ todayTasks.can.length }})
        </div>
        <v-list v-if="showCan" class="task-list">
          <task-item
            v-for="task in todayTasks.can"
            :key="task.id"
            :task="task"
            show-list
            show-space
            @open="openAction(task)"
            @complete="completeTask(task)"
          />
        </v-list>
      </div>

      <!-- Wartet (collapsible) -->
      <div v-if="todayTasks.waiting.length" class="mb-4">
        <div class="section-label cursor-pointer d-flex align-center" @click="showWaiting = !showWaiting">
          <v-icon size="14" class="mr-1">{{ showWaiting ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
          Wartet ({{ todayTasks.waiting.length }})
        </div>
        <v-list v-if="showWaiting" class="task-list" rounded="lg">
          <task-item
            v-for="task in todayTasks.waiting"
            :key="task.id"
            :task="task"
            show-list
            show-space
            @open="openAction(task)"
            @complete="completeTask(task)"
          />
        </v-list>
      </div>

      <!-- Empty state -->
      <div v-if="isEmpty" class="text-center py-12">
        <v-icon size="64" color="success" class="mb-3">mdi-check-all</v-icon>
        <div class="text-h6">Alles erledigt!</div>
        <div class="text-caption text-medium-emphasis mt-1">Keine offenen Tasks für heute.</div>
      </div>
    </div>

    <!-- FAB: add new task -->
    <v-btn
      class="task-fab"
      icon
      size="large"
      color="primary"
      elevation="6"
      @click="showTaskSheet = true"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>

    <task-action-sheet v-model="showActionSheet" :task="selectedTask" @edit="editTask" />
    <task-sheet v-model="showTaskSheet" :task="editingTask" @saved="editingTask = null" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useTasksStore } from '../stores/tasks.js';
import { useSyncStore } from '../stores/sync.js';
import { api } from '../services/api.js';
import TaskItem from '../components/TaskItem.vue';
import TaskActionSheet from '../components/TaskActionSheet.vue';
import TaskSheet from '../components/TaskSheet.vue';

const tasksStore = useTasksStore();
const sync = useSyncStore();

const showWaiting = ref(false);
const showCan = ref(true);
const showActionSheet = ref(false);
const showTaskSheet = ref(false);
const selectedTask = ref(null);
const editingTask = ref(null);

// Space filter
const showFilter = ref(false);
const hiddenSpaces = ref(new Set());
const hasFilter = computed(() => hiddenSpaces.value.size > 0);

function toggleSpace(spaceId) {
  const next = new Set(hiddenSpaces.value);
  if (next.has(spaceId)) next.delete(spaceId);
  else next.add(spaceId);
  hiddenSpaces.value = next;
}

const formattedDate = computed(() =>
  format(new Date(), "EEEE, d. MMMM", { locale: de })
);

const todayTasks = computed(() => {
  const all = tasksStore.getTodayTasks();
  if (!hiddenSpaces.value.size) return all;
  const filter = t => !hiddenSpaces.value.has(t.space_id);
  return {
    followUp: all.followUp.filter(filter),
    must: all.must.filter(filter),
    can: all.can.filter(filter),
    waiting: all.waiting.filter(filter),
  };
});
const scheduledToday = computed(() =>
  tasksStore.getScheduledToday().filter(t => !hiddenSpaces.value.has(t.space_id))
);

const isEmpty = computed(() => {
  const t = todayTasks.value;
  return !t.followUp.length && !t.must.length && !t.can.length && !scheduledToday.value.length;
});

const summaryLine = computed(() => {
  const t = todayTasks.value;
  const must = t.must.length;
  const can = t.can.length;
  if (!must && !can) return 'Alles erledigt';
  const parts = [];
  if (must) parts.push(`${must} fällig`);
  if (can) parts.push(`${can} verfügbar`);
  return parts.join(' · ');
});

function openAction(task) {
  selectedTask.value = task;
  showActionSheet.value = true;
}

function editTask(task) {
  editingTask.value = task;
  showTaskSheet.value = true;
}

async function completeTask(task) {
  if (sync.isOnline) {
    const updated = await api.completeTask(task.space_id, task.id);
    tasksStore.applyTaskUpdate(task.space_id, updated);
  } else {
    await sync.enqueue({ type: 'complete_task', spaceId: task.space_id, taskId: task.id });
  }
}
</script>

<style scoped>
.today-view {
  height: calc(100dvh - 56px);
  display: flex;
  flex-direction: column;
}

.today-scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 80px;
}

.section-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0,0,0,0.4);
  margin-bottom: 6px;
  padding-left: 4px;
}
.error-label { color: rgb(var(--v-theme-error)); }
.warning-label { color: rgb(var(--v-theme-warning)); }

.task-list {
  background: transparent;
  padding: 0;
}

.task-fab {
  position: fixed;
  bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  right: 16px;
}
</style>
