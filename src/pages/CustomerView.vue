<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { CircleCheck, TriangleAlert } from "lucide-vue-next";
import { useRoute } from "vue-router";
import DemoHeader from "../components/DemoHeader.vue";
import ShipmentDetail from "../components/ShipmentDetail.vue";
import { personas } from "../data/shipments";
import { formatDate } from "../domain/dates";
import { asOf, service, shipmentList } from "../domain/store";
import {
  AlertKind,
  MilestoneKind,
  PersonaRole,
  ShipmentStatus,
} from "../domain/types";
import { visibleTo } from "../domain/visibility";

const route = useRoute();
const selectedId = ref<string>();
const persona = computed(
  () =>
    personas.find(
      (entry) =>
        entry.id === route.params.accountId &&
        entry.role === PersonaRole.Customer,
    ) ?? personas[2],
);
const visible = computed(() =>
  shipmentList.value
    .filter((shipment) => visibleTo(shipment, persona.value))
    .map((shipment) => service.view(shipment, asOf.value))
    .sort(
      (a, b) => (b.alerts[0]?.priority ?? 0) - (a.alerts[0]?.priority ?? 0),
    ),
);
const selected = computed(() =>
  visible.value.find((view) => view.shipment.id === selectedId.value),
);
const date = formatDate;
const customerStatus = (view: (typeof visible.value)[number]) =>
  view.status === ShipmentStatus.Pending
    ? "Awaiting update"
    : view.alerts[0]?.kind === AlertKind.Review
      ? "Update under review"
      : (view.alerts[0]?.label ??
        (view.status === ShipmentStatus.Delivered ? "Delivered" : "On track"));
async function openShipment(id: string) {
  selectedId.value = id;
  await nextTick();
  if (window.matchMedia("(max-width: 1050px)").matches)
    document
      .getElementById("shipment-detail")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
}
watch(persona, () => {
  selectedId.value = undefined;
});
</script>

<template>
  <DemoHeader />
  <main class="workspace">
    <div class="page-heading">
      <div>
        <span class="eyebrow">CUSTOMER / SHIPMENT TRACKING</span>
        <h1>Your deliveries</h1>
        <p>One view from dispatch through arrival.</p>
      </div>
    </div>
    <section class="customer-intro" aria-label="Account summary">
      <div>
        <span class="eyebrow">ACCOUNT VIEW</span
        ><strong>{{ persona.name }}</strong>
        <p>
          {{ visible.length }} shipments ·
          {{
            visible.filter((view) => view.status === ShipmentStatus.Attention)
              .length
          }}
          needing an update
        </p>
      </div>
      <span class="eyebrow">AS OF / {{ date(asOf).toUpperCase() }}</span>
    </section>
    <div class="workgrid">
      <section class="list-panel">
        <div class="panel-heading">
          <h2>Shipments</h2>
          <small>Latest confirmed operator events</small>
        </div>
        <div class="customer-list">
          <button
            v-for="view in visible"
            :key="view.shipment.id"
            class="customer-item"
            :aria-current="selectedId === view.shipment.id ? true : undefined"
            @click="openShipment(view.shipment.id)"
          >
            <div class="customer-item-top">
              <div>
                <h3>
                  {{ view.shipment.id }}
                  <small>· {{ view.shipment.order }}</small>
                </h3>
                <span class="eyebrow"
                  >{{ view.shipment.origin }} →
                  {{ view.shipment.destination }}</span
                >
              </div>
              <span class="status" :class="view.status"
                ><TriangleAlert
                  v-if="view.status === ShipmentStatus.Attention"
                  :size="13"
                /><CircleCheck v-else :size="13" />{{
                  customerStatus(view)
                }}</span
              >
            </div>
            <p>
              {{
                view.status === ShipmentStatus.Delivered
                  ? "Delivered " +
                    date(
                      view.milestones.find(
                        (milestone) =>
                          milestone.kind === MilestoneKind.Delivered,
                      )!.occurredAt,
                    )
                  : "Promised " + date(view.shipment.promisedAt)
              }}
              ·
              {{
                view.lastConfirmed
                  ? view.lastConfirmed.label
                  : "No confirmed update"
              }}
            </p>
          </button>
        </div>
        <p class="scope-note">Only {{ persona.name }} shipments are shown.</p>
      </section>
      <ShipmentDetail
        v-if="selected"
        :view="selected"
        :role="PersonaRole.Customer"
        @close="selectedId = undefined"
      />
      <div v-else class="customer-empty">
        <h3>Choose a shipment</h3>
        <p>
          Open a delivery to see its route, latest confirmed update, arrival
          date, and documents.
        </p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.customer-empty {
  padding: 52px 35px;
  border: 1px dashed #bfcbc0;
  text-align: center;
  color: #61716c;
}
.customer-empty h3 {
  color: #1b2826;
}
.customer-empty p {
  font-size: 0.8rem;
  line-height: 1.6;
}
.customer-item h3 small {
  font-family: "DM Sans";
  font-weight: 400;
  color: #61716c;
  font-size: 0.7rem;
}
@media (max-width: 1050px) {
  .customer-empty {
    display: none;
  }
}
</style>
