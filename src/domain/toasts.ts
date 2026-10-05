import { ref } from "vue";

export const toasts = ref<{ id: number; message: string; error: boolean }[]>(
  [],
);
let nextId = 0;

export function showToast(message: string, error = false) {
  const id = ++nextId;
  toasts.value.push({ id, message, error });
  setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }, 3500);
}
