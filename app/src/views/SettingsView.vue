<template>
  <div class="settings-view">
    <div class="px-4 pt-4 pb-2">
      <div class="text-h6 font-weight-bold">Einstellungen</div>
    </div>
    <v-divider />

    <div class="settings-scroll pa-4">

      <!-- Profile -->
      <div class="section-title">Profil</div>
      <v-card class="mb-4">
        <v-card-text>
          <v-text-field v-model="profileForm.name" label="Name" class="mb-2" />
          <v-text-field :model-value="auth.user?.email" label="E-Mail" readonly class="mb-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4 gap-2">
          <v-btn color="primary" variant="tonal" :loading="savingProfile" @click="saveProfile">Speichern</v-btn>
          <v-btn variant="outlined" @click="showPwDialog = true">Passwort ändern</v-btn>
          <v-spacer />
          <v-btn color="error" variant="text" @click="handleLogout">Abmelden</v-btn>
        </v-card-actions>
      </v-card>

      <!-- Inbox reminder -->
      <div class="section-title">Benachrichtigungen</div>
      <v-card class="mb-4">
        <v-card-text>
          <v-text-field
            v-model="profileForm.inbox_reminder_time"
            label="Inbox-Erinnerung"
            type="time"
            hint="Täglich zu dieser Uhrzeit (wenn Inbox nicht leer)"
            persistent-hint
            class="mb-3"
          />

          <!-- Push notifications -->
          <div v-if="pushConfigured">
            <div class="text-body-2 mb-2">Push-Benachrichtigungen</div>
            <v-btn v-if="!pushSubscribed" color="primary" variant="tonal" :loading="subscribingPush" @click="subscribePush">
              Aktivieren
            </v-btn>
            <div v-else class="d-flex align-center gap-2">
              <v-icon color="success" size="18">mdi-check-circle</v-icon>
              <span class="text-body-2">Aktiviert</span>
              <v-btn variant="text" size="small" @click="unsubscribePush">Deaktivieren</v-btn>
            </div>
          </div>
          <div v-else class="text-caption text-medium-emphasis">Push-Notifications: VAPID nicht konfiguriert</div>
        </v-card-text>
      </v-card>

      <!-- Spaces -->
      <div class="section-title">Spaces</div>
      <v-card class="mb-4">
        <v-list density="compact">
          <v-list-item v-for="space in tasksStore.spaces" :key="space.id">
            <v-list-item-title>{{ space.name }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ space.members?.length || 1 }} {{ space.members?.length === 1 ? 'Mitglied' : 'Mitglieder' }}
              · {{ space.role === 'owner' ? 'Eigentümer' : 'Mitglied' }}
            </v-list-item-subtitle>
            <template #append>
              <v-btn icon size="small" variant="text" @click="openSpaceDetail(space)">
                <v-icon size="16">mdi-cog-outline</v-icon>
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <v-card-actions class="gap-2 flex-wrap px-4 pb-3">
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="showCreateSpace = true">
            Space erstellen
          </v-btn>
          <v-btn variant="outlined" prepend-icon="mdi-account-plus-outline" @click="showJoinSpace = true">
            Beitreten
          </v-btn>
        </v-card-actions>
      </v-card>

      <!-- Webhook -->
      <div class="section-title">Webhook</div>
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-caption text-medium-emphasis mb-1">Token</div>
          <div class="d-flex align-center gap-2 mb-3">
            <code class="token-display flex-grow-1">{{ webhookToken || '...' }}</code>
            <v-btn icon size="small" variant="text" @click="copyToken">
              <v-icon>mdi-content-copy</v-icon>
            </v-btn>
            <v-btn icon size="small" variant="text" @click="regenToken">
              <v-icon>mdi-refresh</v-icon>
            </v-btn>
          </div>
          <div class="text-caption text-medium-emphasis">
            Endpoint: <code>POST {{ apiBase }}/api/webhook/inbox/{{ webhookToken }}</code>
          </div>
          <div class="text-caption text-medium-emphasis">
            Payload: <code>{ "text": "..." }</code>
          </div>
        </v-card-text>
      </v-card>

    </div>

    <!-- Passwort-Dialog -->
    <v-dialog v-model="showPwDialog" max-width="400">
      <v-card>
        <v-card-title>Passwort ändern</v-card-title>
        <v-card-text>
          <v-text-field v-model="pwForm.current" label="Aktuelles Passwort" type="password" autofocus class="mb-2" />
          <v-text-field v-model="pwForm.next" label="Neues Passwort (min. 8 Zeichen)" type="password" @keydown.enter="savePassword" />
          <v-alert v-if="pwError" type="error" density="compact" class="mt-2">{{ pwError }}</v-alert>
          <v-alert v-if="pwSuccess" type="success" density="compact" class="mt-2">Passwort geändert.</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showPwDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" :loading="savingPw" @click="savePassword">Ändern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Space detail dialog -->
    <v-dialog v-model="showSpaceDetail" max-width="400">
      <v-card v-if="selectedSpace">
        <v-card-title>{{ selectedSpace.name }}</v-card-title>
        <v-card-text>
          <!-- Invite code (owner only) -->
          <div v-if="selectedSpace.role === 'owner'" class="mb-4">
            <div class="text-caption text-medium-emphasis mb-1">Einladungscode</div>
            <div class="d-flex align-center gap-2">
              <code class="token-display flex-grow-1">{{ inviteCode || 'Laden...' }}</code>
              <v-btn icon size="small" variant="text" @click="copyInviteCode">
                <v-icon>mdi-content-copy</v-icon>
              </v-btn>
            </div>
          </div>

          <!-- My color for this space -->
          <div class="mb-4">
            <div class="text-caption text-medium-emphasis mb-2">Meine Farbe in diesem Space</div>
            <div class="d-flex flex-wrap gap-2">
              <div
                v-for="color in SPACE_COLORS"
                :key="color"
                class="color-swatch"
                :style="{
                  background: color,
                  outline: selectedSpace.my_color === color ? '3px solid white' : 'none',
                  boxShadow: selectedSpace.my_color === color ? '0 0 0 2px ' + color : 'none',
                }"
                @click="setSpaceColor(color)"
              />
            </div>
          </div>

          <!-- Members -->
          <div class="text-subtitle-2 mb-2">Mitglieder</div>
          <v-list density="compact">
            <v-list-item v-for="member in selectedSpace.members" :key="member.id">
              <v-list-item-title>{{ member.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ member.role === 'owner' ? 'Eigentümer' : 'Mitglied' }}</v-list-item-subtitle>
              <template v-if="selectedSpace.role === 'owner' && member.id !== auth.user?.id" #append>
                <v-btn icon size="small" variant="text" color="error" @click="removeMember(member.id)">
                  <v-icon size="16">mdi-close</v-icon>
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-btn v-if="selectedSpace.role === 'owner'" color="error" variant="text" @click="deleteSpace">Löschen</v-btn>
          <v-spacer />
          <v-btn @click="showSpaceDetail = false">Schließen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Create space dialog -->
    <v-dialog v-model="showCreateSpace" max-width="360">
      <v-card>
        <v-card-title>Neuer Space</v-card-title>
        <v-card-text>
          <v-text-field v-model="newSpaceName" label="Name" autofocus @keydown.enter="createSpace" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showCreateSpace = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="createSpace">Erstellen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Join space dialog -->
    <v-dialog v-model="showJoinSpace" max-width="360">
      <v-card>
        <v-card-title>Space beitreten</v-card-title>
        <v-card-text>
          <v-text-field v-model="joinCode" label="Einladungscode" autofocus class="mb-2" />
          <v-text-field v-model="joinSpaceId" label="Space-ID" type="number" hint="Die ID des Spaces, dem du beitreten möchtest" @keydown.enter="joinSpace" />
          <v-alert v-if="joinError" type="error" density="compact" class="mt-2">{{ joinError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showJoinSpace = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="joinSpace">Beitreten</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useTasksStore } from '../stores/tasks.js';
import { api } from '../services/api.js';

const auth = useAuthStore();
const tasksStore = useTasksStore();

const apiBase = import.meta.env.VITE_API_URL || window.location.origin;

// Profile
const profileForm = ref({
  name: auth.user?.name || '',
  inbox_reminder_time: auth.user?.inbox_reminder_time || '20:00',
});
const savingProfile = ref(false);

async function saveProfile() {
  savingProfile.value = true;
  try {
    const { user } = await api.updateSettings(profileForm.value);
    auth.updateUser(user);
  } finally {
    savingProfile.value = false;
  }
}

// Password
const showPwDialog = ref(false);
const pwForm = ref({ current: '', next: '' });
const savingPw = ref(false);
const pwError = ref(null);
const pwSuccess = ref(false);

async function savePassword() {
  pwError.value = null;
  pwSuccess.value = false;
  savingPw.value = true;
  try {
    await api.updatePassword(pwForm.value.current, pwForm.value.next);
    pwSuccess.value = true;
    pwForm.value = { current: '', next: '' };
  } catch (err) {
    pwError.value = err.message;
  } finally {
    savingPw.value = false;
    if (pwSuccess.value) setTimeout(() => { showPwDialog.value = false; pwSuccess.value = false; }, 1200);
  }
}

// Push
const pushConfigured = ref(false);
const pushSubscribed = ref(false);
const subscribingPush = ref(false);
let vapidPublicKey = null;

onMounted(async () => {
  const { configured, vapid_public_key } = await api.getPushConfig();
  pushConfigured.value = configured;
  vapidPublicKey = vapid_public_key;

  if ('serviceWorker' in navigator && 'PushManager' in window) {
    const sw = await navigator.serviceWorker.ready;
    const sub = await sw.pushManager.getSubscription();
    pushSubscribed.value = !!sub;
  }

  const { token } = await api.getWebhookToken();
  webhookToken.value = token;
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribePush() {
  if (!vapidPublicKey) return;
  subscribingPush.value = true;
  try {
    const sw = await navigator.serviceWorker.ready;
    const sub = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const json = sub.toJSON();
    await api.subscribePush({ endpoint: json.endpoint, keys: json.keys });
    pushSubscribed.value = true;
  } finally {
    subscribingPush.value = false;
  }
}

async function unsubscribePush() {
  const sw = await navigator.serviceWorker.ready;
  const sub = await sw.pushManager.getSubscription();
  if (sub) {
    await api.unsubscribePush(sub.endpoint);
    await sub.unsubscribe();
  }
  pushSubscribed.value = false;
}

// Spaces
const SPACE_COLORS = ['#7c6af7','#f06292','#26a69a','#ff9800','#42a5f5','#66bb6a','#ef5350','#ab47bc','#607D8B'];
const showSpaceDetail = ref(false);
const showCreateSpace = ref(false);
const showJoinSpace = ref(false);
const selectedSpace = ref(null);
const inviteCode = ref(null);
const newSpaceName = ref('');
const joinCode = ref('');
const joinSpaceId = ref('');
const joinError = ref(null);

async function openSpaceDetail(space) {
  selectedSpace.value = space;
  inviteCode.value = null;
  showSpaceDetail.value = true;
  if (space.role === 'owner') {
    const data = await api.getInviteCode(space.id);
    inviteCode.value = data.invite_code;
  }
}

async function copyInviteCode() {
  if (inviteCode.value) await navigator.clipboard.writeText(inviteCode.value);
}

async function removeMember(userId) {
  await api.removeMember(selectedSpace.value.id, userId);
  await tasksStore.loadSpaces();
  showSpaceDetail.value = false;
}

async function deleteSpace() {
  await api.deleteSpace(selectedSpace.value.id);
  await tasksStore.loadSpaces();
  showSpaceDetail.value = false;
}

async function setSpaceColor(color) {
  await api.setSpaceColor(selectedSpace.value.id, color);
  await tasksStore.loadSpaces();
  selectedSpace.value = tasksStore.spaces.find(s => s.id === selectedSpace.value.id) || selectedSpace.value;
}

async function createSpace() {
  if (!newSpaceName.value.trim()) return;
  await api.createSpace(newSpaceName.value.trim());
  await tasksStore.loadSpaces();
  newSpaceName.value = '';
  showCreateSpace.value = false;
}

async function joinSpace() {
  joinError.value = null;
  try {
    await api.joinSpace(Number(joinSpaceId.value), joinCode.value.trim());
    await tasksStore.loadSpaces();
    showJoinSpace.value = false;
  } catch (err) {
    joinError.value = err.message;
  }
}

// Webhook
const webhookToken = ref(null);

async function copyToken() {
  if (webhookToken.value) await navigator.clipboard.writeText(webhookToken.value);
}

async function regenToken() {
  const { token } = await api.regenerateWebhookToken();
  webhookToken.value = token;
  auth.updateUser({ webhook_token: token });
}

async function handleLogout() {
  await auth.logout();
  window.location.href = '/login';
}
</script>

<style scoped>
.settings-view {
  height: calc(100dvh - 56px);
  display: flex;
  flex-direction: column;
}
.settings-scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 40px;
}
.section-title {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0,0,0,0.4);
  margin-bottom: 8px;
  margin-top: 4px;
  padding-left: 2px;
}
.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}
.color-swatch:hover { transform: scale(1.15); }

.token-display {
  font-family: monospace;
  font-size: 0.8rem;
  background: rgba(255,255,255,0.06);
  padding: 4px 8px;
  border-radius: 6px;
  word-break: break-all;
}
</style>
