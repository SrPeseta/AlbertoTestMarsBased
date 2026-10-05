import { createApp, h } from "vue";
import { RouterView } from "vue-router";
import { router } from "./router";
import { pinia, useShipmentStore } from "./domain/store";
import "./styles/global.css";

useShipmentStore(pinia).initialize();
createApp({ render: () => h(RouterView) })
  .use(pinia)
  .use(router)
  .mount("#app");
