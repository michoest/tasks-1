<template>
  <div class="lists-view">
    <!-- Space filter chips -->
    <div class="px-3 pt-3 pb-2 space-chips">
      <v-chip
        v-for="space in tasksStore.spaces"
        :key="space.id"
        :color="selectedSpaceId === space.id ? (space.my_color || 'primary') : undefined"
        :variant="selectedSpaceId === space.id ? 'flat' : 'tonal'"
        class="mr-1"
        @click="selectedSpaceId = space.id"
      >
        {{ space.name }}
      </v-chip>
    </div>

    <v-divider />

    <div class="lists-scroll pa-3">
      <!-- Lists for selected space -->
      <div v-for="list in currentLists" :key="list.id" class="mb-5">
        <!-- List header -->
        <div class="list-header d-flex align-center mb-2">
          <v-icon v-if="list.icon" :icon="list.icon" :color="list.color" size="18" class="mr-2" />
          <div v-else class="mr-2" :style="{ background: list.color, width:'8px', height:'8px', borderRadius:'50%', flexShrink:0 }" />
          <span class="text-subtitle-2 font-weight-bold">{{ list.name }}</span>
          <v-spacer />
          <v-btn icon size="x-small" variant="text" @click="openEditList(list)">
            <v-icon size="16">mdi-pencil-outline</v-icon>
          </v-btn>
        </div>

        <!-- Tasks in list -->
        <v-list class="task-list" rounded="lg">
          <task-item
            v-for="task in tasksForList(list.id)"
            :key="task.id"
            :task="task"
            @open="openAction(task)"
            @complete="completeTask(task)"
          />
          <v-list-item v-if="!tasksForList(list.id).length" class="text-medium-emphasis text-caption py-2">
            Keine Tasks
          </v-list-item>
        </v-list>
      </div>

      <!-- Tasks without list -->
      <div v-if="unlistedTasks.length" class="mb-5">
        <div class="list-header d-flex align-center mb-2">
          <v-icon size="18" class="mr-2" color="medium-emphasis">mdi-inbox-outline</v-icon>
          <span class="text-subtitle-2 font-weight-bold text-medium-emphasis">Ohne Liste</span>
        </div>
        <v-list class="task-list" rounded="lg">
          <task-item
            v-for="task in unlistedTasks"
            :key="task.id"
            :task="task"
            @open="openAction(task)"
            @complete="completeTask(task)"
          />
        </v-list>
      </div>

      <!-- Add list button -->
      <div v-if="selectedSpaceId" class="d-flex justify-center mt-4">
        <v-btn variant="tonal" prepend-icon="mdi-plus" @click="openAddList">Neue Liste</v-btn>
      </div>

      <div v-if="!selectedSpaceId" class="text-center py-12 text-medium-emphasis">
        <v-icon size="48" class="mb-3">mdi-layers-outline</v-icon>
        <div>Kein Space ausgewählt</div>
      </div>
    </div>

    <!-- FAB: add task -->
    <v-btn class="task-fab" icon size="large" color="primary" elevation="6" @click="openAddTask">
      <v-icon>mdi-plus</v-icon>
    </v-btn>

    <!-- Task sheet -->
    <task-sheet
      v-model="showTaskSheet"
      :task="editingTask"
      :default-space-id="selectedSpaceId"
      :default-list-id="selectedListId"
      @saved="editingTask = null"
    />

    <!-- Task actions -->
    <task-action-sheet v-model="showActionSheet" :task="selectedTask" @edit="editTask" />

    <!-- List add/edit dialog -->
    <v-dialog v-model="showListDialog" max-width="400">
      <v-card>
        <v-card-title>{{ editingList ? 'Liste bearbeiten' : 'Neue Liste' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="listForm.name" label="Name" autofocus class="mb-2" @keydown.enter="saveList" />
          <div class="mb-2">
            <div class="text-caption mb-1">Farbe</div>
            <div class="d-flex flex-wrap gap-2">
              <div
                v-for="color in PRESET_COLORS"
                :key="color"
                class="color-swatch"
                :style="{ background: color, outline: listForm.color === color ? '2px solid white' : 'none' }"
                @click="listForm.color = color"
              />
            </div>
          </div>
          <v-text-field v-model="listForm.icon" label="Icon (mdi-name, optional)" prepend-inner-icon="mdi-emoticon-outline" />
        </v-card-text>
        <v-card-actions>
          <v-btn v-if="editingList" color="error" variant="text" @click="deleteList">Löschen</v-btn>
          <v-spacer />
          <v-btn @click="showListDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="saveList">Speichern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useTasksStore } from '../stores/tasks.js';
import { useSyncStore } from '../stores/sync.js';
import { api } from '../services/api.js';
import TaskItem from '../components/TaskItem.vue';
import TaskSheet from '../components/TaskSheet.vue';
import TaskActionSheet from '../components/TaskActionSheet.vue';

const PRESET_COLORS = ['#7c6af7','#f06292','#26a69a','#ff9800','#42a5f5','#66bb6a','#ef5350','#ab47bc','#607D8B'];

const tasksStore = useTasksStore();
const sync = useSyncStore();

const selectedSpaceId = ref(tasksStore.spaces[0]?.id || null);

watch(() => tasksStore.spaces, (spaces) => {
  if (!selectedSpaceId.value && spaces.length) selectedSpaceId.value = spaces[0].id;
}, { immediate: true });

const currentLists = computed(() => {
  if (!selectedSpaceId.value) return [];
  return tasksStore.listsBySpace[selectedSpaceId.value] || [];
});

const currentTasks = computed(() => {
  if (!selectedSpaceId.value) return [];
  return (tasksStore.tasksBySpace[selectedSpaceId.value] || []).filter(t => t.status !== 'done' || t.recurrence_type !== 'one_time');
});

function tasksForList(listId) {
  return currentTasks.value.filter(t => t.list_id === listId);
}

const unlistedTasks = computed(() => currentTasks.value.filter(t => !t.list_id));

// Task actions
const showActionSheet = ref(false);
const showTaskSheet = ref(false);
const selectedTask = ref(null);
const editingTask = ref(null);
const selectedListId = ref(null);

function openAction(task) {
  selectedTask.value = task;
  showActionSheet.value = true;
}

function editTask(task) {
  editingTask.value = task;
  showTaskSheet.value = true;
}

function openAddTask(listId = null) {
  editingTask.value = null;
  selectedListId.value = listId;
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

// List management
const showListDialog = ref(false);
const editingList = ref(null);
const listForm = ref({ name: '', color: '#7c6af7', icon: '' });

function openAddList() {
  editingList.value = null;
  listForm.value = { name: '', color: '#7c6af7', icon: '' };
  showListDialog.value = true;
}

function openEditList(list) {
  editingList.value = list;
  listForm.value = { name: list.name, color: list.color, icon: list.icon || '' };
  showListDialog.value = true;
}

async function saveList() {
  if (!listForm.value.name.trim() || !selectedSpaceId.value) return;
  const data = { name: listForm.value.name, color: listForm.value.color, icon: listForm.value.icon || null };
  if (editingList.value) {
    const updated = await api.updateList(selectedSpaceId.value, editingList.value.id, data);
    tasksStore.applyListUpdate(selectedSpaceId.value, updated, 'updated');
  } else {
    const created = await api.createList(selectedSpaceId.value, data);
    tasksStore.applyListUpdate(selectedSpaceId.value, created, 'added');
  }
  showListDialog.value = false;
}

async function deleteList() {
  if (!editingList.value) return;
  await api.deleteList(selectedSpaceId.value, editingList.value.id);
  tasksStore.applyListUpdate(selectedSpaceId.value, editingList.value.id, 'deleted');
  showListDialog.value = false;
}
</script>

<style scoped>
.lists-view {
  height: calc(100dvh - 56px);
  display: flex;
  flex-direction: column;
}
.lists-scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 80px;
}
.space-chips {
  overflow-x: auto;
  white-space: nowrap;
}
.task-list {
  background: transparent;
  padding: 0;
}
.list-header {
  padding: 0 4px;
}
.task-fab {
  position: fixed;
  bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  right: 16px;
}
.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}
.color-swatch:hover { transform: scale(1.15); }
</style>
