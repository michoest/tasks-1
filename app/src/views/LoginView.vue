<template>
  <v-app>
    <v-main class="d-flex align-center justify-center" style="min-height: 100dvh;">
      <v-container style="max-width: 420px;">
        <div class="text-center mb-8">
          <v-icon size="56" color="primary">mdi-check-circle-outline</v-icon>
          <div class="text-h5 font-weight-bold mt-3">Tasks</div>
        </div>

        <v-card class="pa-6">
          <v-tabs v-model="tab" grow class="mb-6">
            <v-tab value="login">Anmelden</v-tab>
            <v-tab value="register">Registrieren</v-tab>
          </v-tabs>

          <v-alert v-if="auth.error" type="error" class="mb-4" density="compact" closable @click:close="auth.error = null">
            {{ auth.error }}
          </v-alert>

          <!-- Login -->
          <v-form v-if="tab === 'login'" @submit.prevent="handleLogin">
            <v-text-field
              v-model="loginForm.email"
              label="E-Mail"
              type="email"
              autocomplete="email"
              class="mb-2"
            />
            <v-text-field
              v-model="loginForm.password"
              label="Passwort"
              type="password"
              autocomplete="current-password"
              class="mb-4"
            />
            <v-btn type="submit" color="primary" block size="large" :loading="auth.loading">
              Anmelden
            </v-btn>
          </v-form>

          <!-- Register -->
          <v-form v-else @submit.prevent="handleRegister">
            <v-text-field
              v-model="registerForm.name"
              label="Name"
              autocomplete="name"
              class="mb-2"
            />
            <v-text-field
              v-model="registerForm.email"
              label="E-Mail"
              type="email"
              autocomplete="email"
              class="mb-2"
            />
            <v-text-field
              v-model="registerForm.password"
              label="Passwort (min. 8 Zeichen)"
              type="password"
              autocomplete="new-password"
              class="mb-4"
            />
            <v-btn type="submit" color="primary" block size="large" :loading="auth.loading">
              Registrieren
            </v-btn>
          </v-form>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const router = useRouter();
const auth = useAuthStore();
const tab = ref('login');

const loginForm = ref({ email: '', password: '' });
const registerForm = ref({ name: '', email: '', password: '' });

async function handleLogin() {
  try {
    await auth.login(loginForm.value.email, loginForm.value.password);
    router.push('/today');
  } catch { /* error displayed via auth.error */ }
}

async function handleRegister() {
  try {
    await auth.register(registerForm.value.name, registerForm.value.email, registerForm.value.password);
    router.push('/today');
  } catch { /* error displayed via auth.error */ }
}
</script>
