<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import {
  Boxes,
  BriefcaseBusiness,
  Check,
  RotateCcw,
  UserRound,
} from "lucide-vue-next";
import { useRoute } from "vue-router";
import { personas } from "../data/shipments";
import { clearSavedState } from "../domain/store";
import { PersonaRole } from "../domain/types";
import { showToast, toasts } from "../domain/toasts";

const route = useRoute();
const isOpen = ref(false);
const switcher = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);

function closeOnOutsideClick(event: PointerEvent) {
  if (event.target instanceof Node && !switcher.value?.contains(event.target))
    isOpen.value = false;
}

function closeOnEscape() {
  isOpen.value = false;
  trigger.value?.focus();
}

function resetTestData() {
  try {
    clearSavedState();
    window.location.reload();
  } catch {
    showToast("Could not reset saved testing data", true);
  }
}

onMounted(() => document.addEventListener("pointerdown", closeOnOutsideClick));
onUnmounted(() =>
  document.removeEventListener("pointerdown", closeOnOutsideClick),
);
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark"><Boxes :size="20" /></span
      ><span>WAYPOINT <small>/ shipment intelligence</small></span>
    </div>
    <div class="header-actions">
      <button
        class="reset-data-btn"
        type="button"
        aria-label="Reset testing data"
        title="Reset saved shipment data (testing purposes only)"
        @click="resetTestData"
      >
        <RotateCcw :size="19" />
      </button>
      <div ref="switcher" class="profile-switcher" @keydown.esc="closeOnEscape">
        <button
          ref="trigger"
          class="profile-avatar"
          type="button"
          :aria-expanded="isOpen"
          aria-controls="role-switcher"
          :aria-label="`Accounts, current: ${personas.find((person) => person.id === route.params.accountId)?.name ?? 'North logistics'}`"
          title="Accounts"
          @click="isOpen = !isOpen"
        >
          <UserRound :size="21" />
        </button>
        <nav
          v-if="isOpen"
          id="role-switcher"
          class="profile-menu"
          aria-label="Accounts"
        >
          <div class="profile-menu-heading"><strong>Accounts</strong></div>
          <RouterLink
            v-for="person in personas"
            :key="person.id"
            :to="`/${person.role}/${person.id}`"
            :aria-current="
              route.params.accountId === person.id ? 'page' : undefined
            "
            @click="isOpen = false"
            ><BriefcaseBusiness
              v-if="person.role === PersonaRole.Operations"
              :size="18" /><UserRound v-else :size="18" /> {{ person.name }}
            <Check
              v-if="route.params.accountId === person.id"
              :size="16"
              class="profile-check"
          /></RouterLink>
        </nav>
      </div>
    </div>
  </header>
  <div
    v-if="toasts.length"
    class="action-toasts"
    role="status"
    aria-live="polite"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="action-toast"
      :class="{ 'is-error': toast.error }"
    >
      {{ toast.message }}
    </div>
  </div>
</template>
