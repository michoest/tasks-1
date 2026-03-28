<template>
  <v-list-item
    :class="['task-item', { 'task-overdue': isOverdue, 'task-due-today': isDueToday && !isOverdue }]"
    @click="$emit('open', task)"
  >
    <template #prepend>
      <v-btn
        icon
        variant="text"
        size="small"
        :color="isOverdue ? 'error' : isDueToday ? 'warning' : 'default'"
        @click.stop="$emit('complete', task)"
      >
        <v-icon>{{ task.status === 'waiting' ? 'mdi-clock-outline' : 'mdi-circle-outline' }}</v-icon>
      </v-btn>
    </template>

    <!-- Space · List row above title -->
    <div v-if="(showSpace && spaceInfo) || (showList && listInfo)" class="task-meta-row">
      <span v-if="showSpace && spaceInfo" class="meta-label" :style="{ color: spaceInfo.my_color || 'var(--v-theme-primary)' }">
        <v-icon size="9" style="margin-right:2px; vertical-align:middle">mdi-folder-outline</v-icon>{{ spaceInfo.name }}
      </span>
      <span v-if="showSpace && spaceInfo && showList && listInfo" class="meta-sep">·</span>
      <span v-if="showList && listInfo" class="meta-label" :style="{ color: listInfo.color || undefined }">
        <v-icon v-if="listInfo.icon" size="9" :icon="listInfo.icon" style="margin-right:2px; vertical-align:middle" />
        <v-icon v-else size="7" style="margin-right:2px; vertical-align:middle">mdi-circle</v-icon>
        {{ listInfo.name }}
      </span>
    </div>

    <v-list-item-title class="task-title">{{ task.title }}</v-list-item-title>

    <v-list-item-subtitle v-if="task.notes" class="task-notes">
      {{ task.notes }}
    </v-list-item-subtitle>

    <template #append>
      <div class="task-append d-flex flex-column align-end gap-1">
        <!-- Status badges -->
        <div class="d-flex gap-1 flex-wrap justify-end">
          <v-chip v-if="task.blocked" size="x-small" color="error" variant="tonal" prepend-icon="mdi-lock">
            Blockiert
          </v-chip>
          <v-chip v-if="!task.active" size="x-small" color="warning" variant="tonal" prepend-icon="mdi-pause">
            Pausiert
          </v-chip>
          <v-chip v-if="task.status === 'waiting'" size="x-small" color="info" variant="tonal" prepend-icon="mdi-clock-outline">
            {{ task.waiting_for || 'Wartet' }}
          </v-chip>
        </div>

        <!-- Due date -->
        <div v-if="task.next_due_date" class="text-caption" :class="dueDateClass">
          {{ formattedDueDate }}
        </div>
        <div v-else-if="!task.next_due_date && task.recurrence_type === 'one_time' && task.status !== 'done'" class="text-caption text-medium-emphasis">
          jederzeit
        </div>
      </div>
    </template>
  </v-list-item>
</template>

<script setup>
import { computed } from 'vue';
import { format, isToday, isPast, isTomorrow, differenceInDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { useTasksStore } from '../stores/tasks.js';

const props = defineProps({
  task: { type: Object, required: true },
  showList: { type: Boolean, default: false },
  showSpace: { type: Boolean, default: false },
});

defineEmits(['open', 'complete']);

const tasksStore = useTasksStore();
const listInfo = computed(() => props.showList && props.task.list_id ? tasksStore.getListName(props.task.list_id) : null);
const spaceInfo = computed(() => props.showSpace ? tasksStore.spaces.find(s => s.id === props.task.space_id) : null);

const today = new Date().toISOString().slice(0, 10);

const isOverdue = computed(() => {
  if (!props.task.next_due_date) return false;
  return props.task.next_due_date < today;
});

const isDueToday = computed(() => {
  if (!props.task.next_due_date) return false;
  return props.task.next_due_date === today;
});

const dueDateClass = computed(() => {
  if (isOverdue.value) return 'text-error';
  if (isDueToday.value) return 'text-warning';
  return 'text-medium-emphasis';
});

const formattedDueDate = computed(() => {
  if (!props.task.next_due_date) return '';
  const d = new Date(props.task.next_due_date + 'T00:00:00');

  if (isToday(d)) {
    if (props.task.has_specific_time && props.task.time_of_day) {
      return `heute · ${props.task.time_of_day}`;
    }
    return 'heute';
  }
  if (isPast(d)) {
    const days = differenceInDays(new Date(), d);
    return days === 1 ? 'gestern' : `vor ${days} Tagen`;
  }
  if (isTomorrow(d)) return 'morgen';
  const days = differenceInDays(d, new Date());
  if (days <= 6) return format(d, 'EEEE', { locale: de });
  return format(d, 'd. MMM', { locale: de });
});
</script>

<style scoped>
.task-item {
  border-left: 3px solid transparent;
  margin-bottom: 2px;
  transition: border-color 0.2s;
}
.task-overdue { border-left-color: rgb(var(--v-theme-error)); }
.task-due-today { border-left-color: rgb(var(--v-theme-warning)); }

.task-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 1px;
  line-height: 1.2;
}

.meta-label {
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  opacity: 0.85;
}

.meta-sep {
  font-size: 0.62rem;
  opacity: 0.4;
}

.task-title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-notes {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.75rem;
  opacity: 0.7;
  max-width: 200px;
}

.task-append {
  min-width: 60px;
  max-width: 110px;
}
</style>
