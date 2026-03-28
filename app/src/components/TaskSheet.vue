<template>
  <v-bottom-sheet v-model="open" :scrim="true" scrollable max-height="95dvh">
    <v-card rounded="t-xl">
      <!-- Header -->
      <v-toolbar color="transparent" density="compact" class="px-2 pt-2">
        <v-btn icon variant="text" @click="open = false"><v-icon>mdi-close</v-icon></v-btn>
        <v-toolbar-title>{{ isEdit ? 'Task bearbeiten' : 'Neuer Task' }}</v-toolbar-title>
      </v-toolbar>

      <v-card-text class="pt-2 pb-2 overflow-y-auto">
        <!-- Title -->
        <v-text-field
          v-model="form.title"
          label="Titel"
          autofocus
          class="mb-2"
          @keydown.enter.prevent="save"
        />

        <!-- Notes (collapsible) -->
        <div class="mb-3">
          <div class="d-flex align-center cursor-pointer" style="gap:4px;" @click="showNotes = !showNotes">
            <v-icon size="16" color="medium-emphasis">{{ showNotes ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
            <span class="text-caption text-medium-emphasis">Notizen</span>
            <span v-if="!showNotes && form.notes" class="text-caption ml-1" style="opacity:0.5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px;">{{ form.notes }}</span>
          </div>
          <v-textarea v-if="showNotes" v-model="form.notes" rows="2" auto-grow hide-details class="mt-1" />
        </div>

        <!-- Space + List -->
        <v-row dense class="mb-2">
          <v-col cols="6">
            <v-select
              v-model="form.space_id"
              :items="spaceItems"
              label="Space"
              item-title="name"
              item-value="id"
              @update:model-value="form.list_id = null"
            />
          </v-col>
          <v-col cols="6">
            <v-select
              v-model="form.list_id"
              :items="currentListItems"
              label="Liste"
              item-title="name"
              item-value="id"
              clearable
              @update:model-value="v => { if (v !== null && typeof v === 'object') form.list_id = null; }"
              @click:clear="form.list_id = null"
            />
          </v-col>
        </v-row>

        <!-- Recurrence type -->
        <v-btn-toggle v-model="form.recurrence_type" mandatory divided class="mb-4 w-100" density="compact">
          <v-btn value="one_time" class="flex-grow-1">Einmalig</v-btn>
          <v-btn value="interval" class="flex-grow-1">Intervall</v-btn>
          <v-btn value="schedule" class="flex-grow-1">Zeitplan</v-btn>
        </v-btn-toggle>

        <!-- one_time: due date -->
        <div v-if="form.recurrence_type === 'one_time'" class="mb-3">
          <v-text-field v-model="form.due_date" label="Fälligkeitsdatum (optional)" type="date" clearable hide-details />
        </div>

        <!-- interval -->
        <div v-if="form.recurrence_type === 'interval'" class="mb-3">
          <v-text-field v-model.number="form.interval_days" label="Alle X Tage" type="number" min="1" hide-details />
        </div>

        <!-- schedule -->
        <div v-if="form.recurrence_type === 'schedule'" class="mb-4">
          <v-btn-toggle v-model="scheduleType" mandatory divided class="mb-3 w-100" density="compact">
            <v-btn value="weekly" class="flex-grow-1">Wöchentlich</v-btn>
            <v-btn value="monthly" class="flex-grow-1">Monatlich</v-btn>
          </v-btn-toggle>
          <div v-if="scheduleType === 'weekly'" class="d-flex gap-1 flex-wrap">
            <v-btn
              v-for="(day, i) in weekdays"
              :key="i"
              size="small"
              :variant="selectedWeekdays.includes(i) ? 'flat' : 'outlined'"
              :color="selectedWeekdays.includes(i) ? 'primary' : undefined"
              rounded="pill"
              @click="toggleWeekday(i)"
            >{{ day }}</v-btn>
          </div>
          <div v-if="scheduleType === 'monthly'">
            <v-text-field
              v-model="monthlyDaysInput"
              label="Tage (kommasepariert, z.B. 1,15)"
              hint="Zahlen von 1–31"
              persistent-hint
            />
          </div>
        </div>

        <!-- Next occurrence (recurring only) -->
        <div v-if="form.recurrence_type !== 'one_time'" class="mb-3">
          <v-text-field
            v-model="form.next_due_date"
            label="Nächste Fälligkeit"
            type="date"
            clearable
            hide-details
            hint="Leer lassen zum automatischen Berechnen"
          />
        </div>

        <!-- Optional field icon row -->
        <div class="d-flex align-center gap-1 mt-2 mb-1 px-1">
          <v-btn
            icon variant="text" size="small"
            :color="form.start_date ? 'primary' : undefined"
            :style="{ opacity: form.start_date ? 1 : 0.35 }"
            @click="toggleStart"
          >
            <v-icon size="20">mdi-calendar-start</v-icon>
            <v-tooltip activator="parent" location="top">Startdatum</v-tooltip>
          </v-btn>
          <v-btn
            icon variant="text" size="small"
            :color="form.has_specific_time ? 'primary' : undefined"
            :style="{ opacity: form.has_specific_time ? 1 : 0.35 }"
            @click="toggleTime"
          >
            <v-icon size="20">mdi-clock-outline</v-icon>
            <v-tooltip activator="parent" location="top">Uhrzeit</v-tooltip>
          </v-btn>
          <v-btn
            icon variant="text" size="small"
            :color="form.status === 'waiting' ? 'warning' : undefined"
            :style="{ opacity: form.status === 'waiting' ? 1 : 0.35 }"
            @click="toggleWaiting"
          >
            <v-icon size="20">mdi-timer-sand</v-icon>
            <v-tooltip activator="parent" location="top">Wartet auf...</v-tooltip>
          </v-btn>
          <v-btn
            v-if="form.recurrence_type !== 'one_time'"
            icon variant="text" size="small"
            :color="!form.active ? 'warning' : undefined"
            :style="{ opacity: !form.active ? 1 : 0.35 }"
            @click="form.active = form.active ? 0 : 1"
          >
            <v-icon size="20">mdi-pause-circle-outline</v-icon>
            <v-tooltip activator="parent" location="top">{{ form.active ? 'Pausieren' : 'Fortsetzen' }}</v-tooltip>
          </v-btn>
        </div>

        <!-- Start date section -->
        <div v-if="showStartSection" class="optional-section">
          <v-text-field
            v-model="form.start_date"
            label="Startdatum"
            type="date"
            clearable
            hide-details
            hint="Task erscheint erst ab diesem Datum"
          />
        </div>

        <!-- Time section -->
        <div v-if="form.has_specific_time" class="optional-section">
          <div class="d-flex gap-2">
            <v-text-field v-model="form.time_of_day" label="Uhrzeit" type="time" style="max-width:160px;" hide-details />
            <v-text-field v-model.number="form.grace_period_minutes" label="Nachfrist (Min.)" type="number" min="0" hide-details />
          </div>
        </div>

        <!-- Waiting section -->
        <div v-if="form.status === 'waiting'" class="optional-section">
          <v-text-field v-model="form.waiting_for" label="Auf wen wartest du?" hide-details class="mb-2" />
          <v-text-field v-model="form.waiting_until" label="Follow-up Datum" type="date" clearable hide-details />
        </div>
      </v-card-text>

      <!-- Sticky save button at bottom -->
      <v-card-actions class="px-4 pb-6 pt-2">
        <v-btn color="primary" block size="large" :loading="saving" @click="save">
          {{ isEdit ? 'Speichern' : 'Task erstellen' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useTasksStore } from '../stores/tasks.js';
import { api } from '../services/api.js';

const props = defineProps({
  modelValue: Boolean,
  task: { type: Object, default: null },
  defaultSpaceId: { type: Number, default: null },
  defaultListId: { type: Number, default: null },
});

const emit = defineEmits(['update:modelValue', 'saved']);

const tasksStore = useTasksStore();
const saving = ref(false);
const showNotes = ref(false);
const showStartSection = ref(false);

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isEdit = computed(() => !!props.task);

const form = ref(emptyForm());

function emptyForm() {
  return {
    space_id: props.defaultSpaceId || tasksStore.spaces[0]?.id || null,
    list_id: props.defaultListId || null,
    title: '',
    notes: '',
    recurrence_type: 'one_time',
    interval_days: 7,
    start_date: null,
    due_date: null,
    has_specific_time: 0,
    time_of_day: null,
    grace_period_minutes: 120,
    status: 'active',
    waiting_for: null,
    waiting_until: null,
    active: 1,
    next_due_date: null,
  };
}

watch(open, (v) => {
  if (v) {
    if (props.task) {
      form.value = { ...props.task };
      showNotes.value = !!props.task.notes;
      showStartSection.value = !!props.task.start_date;
      if (props.task.schedule_pattern) {
        const p = JSON.parse(props.task.schedule_pattern);
        scheduleType.value = p.type === 'monthly' ? 'monthly' : 'weekly';
        if (p.type === 'weekly') selectedWeekdays.value = [...(p.weekdays || [])];
        if (p.type === 'monthly') monthlyDaysInput.value = (p.days || []).join(',');
      }
    } else {
      form.value = emptyForm();
      showNotes.value = false;
      showStartSection.value = false;
      selectedWeekdays.value = [];
      monthlyDaysInput.value = '';
    }
  }
});

// Toggle helpers
function toggleStart() {
  showStartSection.value = !showStartSection.value;
  if (!showStartSection.value) form.value.start_date = null;
}

function toggleTime() {
  form.value.has_specific_time = form.value.has_specific_time ? 0 : 1;
  if (!form.value.has_specific_time) form.value.time_of_day = null;
}

function toggleWaiting() {
  form.value.status = form.value.status === 'waiting' ? 'active' : 'waiting';
  if (form.value.status !== 'waiting') {
    form.value.waiting_for = null;
    form.value.waiting_until = null;
  }
}

// Schedule helpers
const scheduleType = ref('weekly');
const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const selectedWeekdays = ref([]);
const monthlyDaysInput = ref('');

function toggleWeekday(i) {
  const idx = selectedWeekdays.value.indexOf(i);
  if (idx >= 0) selectedWeekdays.value.splice(idx, 1);
  else selectedWeekdays.value.push(i);
}

function buildSchedulePattern() {
  if (scheduleType.value === 'weekly') {
    return JSON.stringify({ type: 'weekly', weekdays: [...selectedWeekdays.value].sort() });
  }
  const days = monthlyDaysInput.value.split(',').map(s => parseInt(s.trim())).filter(n => n >= 1 && n <= 31);
  return JSON.stringify({ type: 'monthly', days });
}

// Space / list selectors
const spaceItems = computed(() => tasksStore.spaces);
const currentListItems = computed(() => {
  if (!form.value.space_id) return [];
  return tasksStore.listsBySpace[form.value.space_id] || [];
});

async function save() {
  if (!form.value.title.trim()) return;
  saving.value = true;

  const payload = { ...form.value };
  if (payload.recurrence_type === 'schedule') {
    payload.schedule_pattern = buildSchedulePattern();
  }
  if (payload.recurrence_type !== 'interval') payload.interval_days = null;
  if (payload.recurrence_type !== 'schedule') payload.schedule_pattern = null;
  if (payload.recurrence_type === 'one_time') delete payload.next_due_date;

  try {
    let task;
    if (isEdit.value) {
      task = await api.updateTask(form.value.space_id, props.task.id, payload);
      tasksStore.applyTaskUpdate(form.value.space_id, task);
    } else {
      task = await api.createTask(form.value.space_id, payload);
      tasksStore.applyTaskUpdate(form.value.space_id, task);
    }
    emit('saved', task);
    open.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.optional-section {
  background: rgba(0, 0, 0, 0.04);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 8px;
}
</style>
