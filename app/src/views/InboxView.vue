<template>
  <div class="inbox-view">
    <div class="px-4 pt-4 pb-2 d-flex align-center gap-2">
      <div class="text-h6 font-weight-bold flex-grow-1">Inbox</div>
      <v-chip v-if="inbox.items.length" size="small" color="secondary">{{ inbox.items.length }}</v-chip>
    </div>

    <!-- Quick add -->
    <div class="px-4 pb-3">
      <v-text-field
        v-model="newText"
        placeholder="Was willst du nicht vergessen?"
        hide-details
        autofocus
        @keydown.enter="addItem"
      >
        <template #append-inner>
          <v-btn icon size="small" :disabled="!newText.trim()" @click="addItem">
            <v-icon>mdi-send</v-icon>
          </v-btn>
        </template>
      </v-text-field>
    </div>

    <v-divider />

    <!-- Empty state -->
    <div v-if="!inbox.items.length" class="text-center py-12">
      <v-icon size="64" color="success" class="mb-3">mdi-inbox-arrow-down</v-icon>
      <div class="text-h6">Inbox ist leer</div>
      <div class="text-caption text-medium-emphasis mt-1">Nichts zu sortieren.</div>
    </div>

    <!-- Items list -->
    <v-list v-else class="inbox-list pa-3">
      <v-list-item
        v-for="item in inbox.items"
        :key="item.id"
        rounded="lg"
        class="inbox-item mb-2"
        @click="openConvert(item)"
      >
        <v-list-item-title>{{ item.text }}</v-list-item-title>
        <v-list-item-subtitle class="d-flex align-center gap-2 mt-1">
          <v-icon size="12">{{ item.source === 'webhook' ? 'mdi-webhook' : 'mdi-pencil-outline' }}</v-icon>
          <span>{{ item.source === 'webhook' ? 'Webhook' : 'Manuell' }}</span>
          <span>·</span>
          <span>{{ formatAge(item.created_at) }}</span>
        </v-list-item-subtitle>

        <template #append>
          <v-btn icon size="small" variant="text" @click.stop="deleteItem(item.id)">
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
          <v-btn icon size="small" variant="text" color="primary" @click.stop="openConvert(item)">
            <v-icon size="18">mdi-arrow-right</v-icon>
          </v-btn>
        </template>
      </v-list-item>
    </v-list>

    <!-- Convert sheet -->
    <v-bottom-sheet v-model="showConvert" :scrim="true" scrollable max-height="90dvh">
      <v-card v-if="convertItem" rounded="t-xl">
        <v-toolbar color="transparent" density="compact" class="px-2 pt-2">
          <v-btn icon variant="text" @click="showConvert = false"><v-icon>mdi-close</v-icon></v-btn>
          <v-toolbar-title>Einsortieren</v-toolbar-title>
          <v-btn color="primary" variant="text" :loading="converting" @click="doConvert">Speichern</v-btn>
        </v-toolbar>

        <v-card-text class="pt-2 pb-8 overflow-y-auto">
          <v-text-field v-model="convertForm.title" label="Titel" class="mb-2" />
          <v-textarea v-model="convertForm.notes" label="Notizen" rows="2" auto-grow class="mb-2" />

          <v-row dense class="mb-2">
            <v-col cols="6">
              <v-select
                v-model="convertForm.space_id"
                :items="tasksStore.spaces"
                label="Space"
                item-title="name"
                item-value="id"
                @update:model-value="convertForm.list_id = null"
              />
            </v-col>
            <v-col cols="6">
              <v-select
                v-model="convertForm.list_id"
                :items="tasksStore.listsBySpace[convertForm.space_id] || []"
                label="Liste"
                item-title="name"
                item-value="id"
                clearable
              />
            </v-col>
          </v-row>

          <v-btn-toggle v-model="convertForm.recurrence_type" mandatory divided class="mb-3 w-100" density="compact">
            <v-btn value="one_time" class="flex-grow-1">Einmalig</v-btn>
            <v-btn value="interval" class="flex-grow-1">Intervall</v-btn>
            <v-btn value="schedule" class="flex-grow-1">Zeitplan</v-btn>
          </v-btn-toggle>

          <v-text-field
            v-if="convertForm.recurrence_type === 'one_time'"
            v-model="convertForm.due_date"
            label="Fälligkeitsdatum (optional)"
            type="date"
            clearable
            class="mb-2"
          />
          <v-text-field
            v-if="convertForm.recurrence_type === 'interval'"
            v-model.number="convertForm.interval_days"
            label="Alle X Tage"
            type="number"
            min="1"
            class="mb-2"
          />

          <v-text-field
            v-model="convertForm.start_date"
            label="Startdatum (optional)"
            type="date"
            clearable
            hint="Task erscheint erst ab diesem Datum in Heute"
            persistent-hint
          />
        </v-card-text>
      </v-card>
    </v-bottom-sheet>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { useInboxStore } from '../stores/inbox.js';
import { useTasksStore } from '../stores/tasks.js';
import { useSyncStore } from '../stores/sync.js';

const inbox = useInboxStore();
const tasksStore = useTasksStore();
const sync = useSyncStore();

const newText = ref('');

async function addItem() {
  if (!newText.value.trim()) return;
  if (sync.isOnline) {
    await inbox.add(newText.value.trim());
  } else {
    await sync.enqueue({ type: 'add_inbox', text: newText.value.trim() });
  }
  newText.value = '';
}

async function deleteItem(id) {
  await inbox.remove(id);
}

function formatAge(dateStr) {
  // SQLite datetime('now') returns UTC without Z — append it so JS parses correctly
  const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return formatDistanceToNow(new Date(normalized), { locale: de, addSuffix: true });
}

// Convert to task
const showConvert = ref(false);
const convertItem = ref(null);
const converting = ref(false);
const convertForm = ref({});

function openConvert(item) {
  convertItem.value = item;
  convertForm.value = {
    title: item.text,
    notes: '',
    space_id: tasksStore.spaces[0]?.id || null,
    list_id: null,
    recurrence_type: 'one_time',
    interval_days: 7,
    due_date: null,
    start_date: null,
  };
  showConvert.value = true;
}

async function doConvert() {
  if (!convertForm.value.title.trim() || !convertForm.value.space_id) return;
  converting.value = true;
  try {
    const task = await inbox.convert(convertItem.value.id, convertForm.value);
    tasksStore.applyTaskUpdate(convertForm.value.space_id, task);
    showConvert.value = false;
  } finally {
    converting.value = false;
  }
}
</script>

<style scoped>
.inbox-view {
  height: calc(100dvh - 56px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.inbox-list { overflow-y: auto; flex: 1; }
.inbox-item { background: rgba(255,255,255,0.04); }
</style>
