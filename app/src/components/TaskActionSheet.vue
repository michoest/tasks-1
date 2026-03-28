<template>
  <v-bottom-sheet v-model="open" :scrim="true">
    <v-card v-if="task" rounded="t-xl">
      <v-card-text class="pb-2 pt-4">
        <div class="d-flex align-start mb-3">
          <div class="flex-grow-1">
            <div class="text-subtitle-1 font-weight-bold">{{ task.title }}</div>
            <div v-if="task.notes" class="text-body-2 text-medium-emphasis mt-1">{{ task.notes }}</div>
          </div>
          <v-btn icon variant="text" size="small" @click="open = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>

        <!-- Dependencies -->
        <div v-if="task.depends_on?.length" class="mb-3">
          <div class="text-caption text-medium-emphasis mb-1">Blockiert durch</div>
          <div class="d-flex flex-wrap gap-1">
            <v-chip v-for="dep in task.depends_on" :key="dep.id" size="small" prepend-icon="mdi-lock-outline">
              {{ dep.title }}
            </v-chip>
          </div>
        </div>
        <div v-if="task.blocks?.length" class="mb-3">
          <div class="text-caption text-medium-emphasis mb-1">Blockiert</div>
          <div class="d-flex flex-wrap gap-1">
            <v-chip v-for="b in task.blocks" :key="b.id" size="small" prepend-icon="mdi-lock">
              {{ b.title }}
            </v-chip>
          </div>
        </div>

        <!-- Actions -->
        <v-list density="compact">
          <!-- Complete -->
          <v-list-item
            v-if="task.status !== 'done'"
            prepend-icon="mdi-check-circle-outline"
            title="Erledigt"
            @click="handleComplete"
          />

          <!-- Waiting toggle -->
          <v-list-item
            v-if="task.status === 'active'"
            prepend-icon="mdi-clock-outline"
            title="Als wartend markieren…"
            @click="showWaitingForm = !showWaitingForm"
          />
          <div v-if="showWaitingForm" class="px-2 pb-2">
            <v-text-field v-model="waitingFor" label="Auf wen?" density="compact" class="mb-1" />
            <v-text-field v-model="waitingUntil" label="Follow-up Datum" type="date" density="compact" class="mb-2" />
            <v-btn size="small" color="info" @click="handleSetWaiting">Speichern</v-btn>
          </div>
          <v-list-item
            v-if="task.status === 'waiting'"
            prepend-icon="mdi-play-circle-outline"
            title="Wieder aktivieren"
            @click="handleActivate"
          />

          <!-- Postpone -->
          <v-list-item prepend-icon="mdi-calendar-arrow-right" title="Verschieben…" @click="showPostponeForm = !showPostponeForm" />
          <div v-if="showPostponeForm" class="px-2 pb-2 d-flex gap-2 align-center flex-wrap">
            <v-btn size="small" variant="outlined" @click="postpone({ days: 1 })">+1 Tag</v-btn>
            <v-btn size="small" variant="outlined" @click="postpone({ days: 3 })">+3 Tage</v-btn>
            <v-btn size="small" variant="outlined" @click="postpone({ days: 7 })">+1 Woche</v-btn>
            <v-text-field
              v-model="customDate"
              type="date"
              density="compact"
              hide-details
              style="max-width: 160px;"
            />
            <v-btn size="small" color="primary" :disabled="!customDate" @click="postpone({ date: customDate })">OK</v-btn>
          </div>

          <!-- Skip (recurring only) -->
          <v-list-item
            v-if="task.recurrence_type !== 'one_time'"
            prepend-icon="mdi-skip-next"
            title="Überspringen"
            @click="handleSkip"
          />

          <!-- Pause/resume (recurring only) -->
          <v-list-item
            v-if="task.recurrence_type !== 'one_time' && task.active"
            prepend-icon="mdi-pause-circle-outline"
            title="Pausieren"
            @click="handleToggleActive(0)"
          />
          <v-list-item
            v-if="task.recurrence_type !== 'one_time' && !task.active"
            prepend-icon="mdi-play-circle-outline"
            title="Fortsetzen"
            @click="handleToggleActive(1)"
          />

          <v-divider class="my-1" />

          <v-list-item prepend-icon="mdi-pencil-outline" title="Bearbeiten" @click="$emit('edit', task); open = false;" />
          <v-list-item prepend-icon="mdi-delete-outline" title="Löschen" base-color="error" @click="handleDelete" />
        </v-list>
      </v-card-text>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup>
import { ref, computed } from 'vue';
import { api } from '../services/api.js';
import { useTasksStore } from '../stores/tasks.js';
import { useSyncStore } from '../stores/sync.js';

const props = defineProps({
  modelValue: Boolean,
  task: { type: Object, default: null },
});
const emit = defineEmits(['update:modelValue', 'edit', 'deleted']);

const tasksStore = useTasksStore();
const sync = useSyncStore();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const showWaitingForm = ref(false);
const waitingFor = ref('');
const waitingUntil = ref('');
const showPostponeForm = ref(false);
const customDate = ref('');

async function handleComplete() {
  if (!props.task) return;
  if (sync.isOnline) {
    const updated = await api.completeTask(props.task.space_id, props.task.id);
    tasksStore.applyTaskUpdate(props.task.space_id, updated);
  } else {
    await sync.enqueue({ type: 'complete_task', spaceId: props.task.space_id, taskId: props.task.id });
  }
  open.value = false;
}

async function handleSkip() {
  if (!props.task) return;
  if (sync.isOnline) {
    const updated = await api.skipTask(props.task.space_id, props.task.id);
    tasksStore.applyTaskUpdate(props.task.space_id, updated);
  } else {
    await sync.enqueue({ type: 'skip_task', spaceId: props.task.space_id, taskId: props.task.id });
  }
  open.value = false;
}

async function postpone(payload) {
  if (!props.task) return;
  if (sync.isOnline) {
    const updated = await api.postponeTask(props.task.space_id, props.task.id, payload);
    tasksStore.applyTaskUpdate(props.task.space_id, updated);
  } else {
    await sync.enqueue({ type: 'postpone_task', spaceId: props.task.space_id, taskId: props.task.id, payload });
  }
  open.value = false;
}

async function handleSetWaiting() {
  if (!props.task) return;
  const updated = await api.updateTask(props.task.space_id, props.task.id, {
    status: 'waiting',
    waiting_for: waitingFor.value || null,
    waiting_until: waitingUntil.value || null,
  });
  tasksStore.applyTaskUpdate(props.task.space_id, updated);
  open.value = false;
}

async function handleActivate() {
  if (!props.task) return;
  const updated = await api.updateTask(props.task.space_id, props.task.id, {
    status: 'active',
    waiting_for: null,
    waiting_until: null,
  });
  tasksStore.applyTaskUpdate(props.task.space_id, updated);
  open.value = false;
}

async function handleToggleActive(active) {
  if (!props.task) return;
  const updated = await api.updateTask(props.task.space_id, props.task.id, { active });
  tasksStore.applyTaskUpdate(props.task.space_id, updated);
  open.value = false;
}

async function handleDelete() {
  if (!props.task) return;
  await api.deleteTask(props.task.space_id, props.task.id);
  tasksStore.applyTaskDelete(props.task.space_id, props.task.id);
  emit('deleted');
  open.value = false;
}
</script>
