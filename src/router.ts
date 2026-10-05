import { createRouter, createWebHistory } from "vue-router";
import { personas } from "./data/shipments";
import { PersonaRole } from "./domain/types";
import CustomerView from "./pages/CustomerView.vue";
import OperationsView from "./pages/OperationsView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/operations/ops-north" },
    { path: "/operations", redirect: "/operations/ops-north" },
    { path: "/customer", redirect: "/customer/atlas" },
    {
      path: "/operations/:accountId",
      component: OperationsView,
      meta: { title: "Operations | Waypoint" },
    },
    {
      path: "/customer/:accountId",
      component: CustomerView,
      meta: { title: "Your deliveries | Waypoint" },
    },
    { path: "/:pathMatch(.*)*", redirect: "/operations/ops-north" },
  ],
});

router.beforeEach((to) => {
  const role = to.path.startsWith("/operations/")
    ? PersonaRole.Operations
    : to.path.startsWith("/customer/")
      ? PersonaRole.Customer
      : undefined;
  if (
    role &&
    !personas.some(
      (person) => person.role === role && person.id === to.params.accountId,
    )
  )
    return role === PersonaRole.Operations
      ? "/operations/ops-north"
      : "/customer/atlas";
});
router.afterEach((to) => {
  document.title = String(to.meta.title ?? "Waypoint");
});
