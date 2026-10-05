<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  Activity,
  CircleCheck,
  ClockAlert,
  Package,
  Plus,
  Search,
  TriangleAlert,
  X,
} from "lucide-vue-next";
import { useRoute } from "vue-router";
import DemoHeader from "../components/DemoHeader.vue";
import ShipmentDetail from "../components/ShipmentDetail.vue";
import { personas } from "../data/shipments";
import { formatDate } from "../domain/dates";
import { searchShipments } from "../domain/search";
import {
  addDelivery,
  asOf,
  deliveryDraft,
  deliveryPhases,
  service,
  shipmentList,
} from "../domain/store";
import { showToast } from "../domain/toasts";
import {
  AlertKind,
  DeliveryRoute,
  PersonaRole,
  ShipmentStatus,
  type Delivery,
} from "../domain/types";
import { visibleTo } from "../domain/visibility";

type Filter = "all" | "acknowledged" | ShipmentStatus;
const route = useRoute();
const selectedId = ref<string>();
const activeFilter = ref<Filter>("all");
const query = ref("");
const creating = ref(false);
const newDelivery = ref<Delivery>(deliveryDraft("", ""));
const persona = computed(
  () =>
    personas.find(
      (entry) =>
        entry.id === route.params.accountId &&
        entry.role === PersonaRole.Operations,
    ) ?? personas[0],
);
const portfolio = computed(() =>
  shipmentList.value
    .filter((shipment) => visibleTo(shipment, persona.value))
    .map((shipment) => service.view(shipment, asOf.value))
    .sort(
      (a, b) =>
        Number(b.status === ShipmentStatus.Attention) -
          Number(a.status === ShipmentStatus.Attention) ||
        (b.alerts[0]?.priority ?? 0) - (a.alerts[0]?.priority ?? 0) ||
        a.shipment.id.localeCompare(b.shipment.id),
    ),
);
const nextAttention = computed(() =>
  portfolio.value.find((view) => view.status === ShipmentStatus.Attention),
);
const rows = computed(() =>
  searchShipments(portfolio.value, query.value, asOf.value).filter(
    (view) =>
      activeFilter.value === "all" ||
      (activeFilter.value === "acknowledged"
        ? !!view.acknowledgedAction
        : view.status === activeFilter.value),
  ),
);
const selected = computed(() =>
  portfolio.value.find((view) => view.shipment.id === selectedId.value),
);
const newPhases = computed(() => deliveryPhases(newDelivery.value.route));
const count = (status: Filter) =>
  status === "all"
    ? portfolio.value.length
    : portfolio.value.filter((view) =>
        status === "acknowledged"
          ? !!view.acknowledgedAction
          : view.status === status,
      ).length;
const day = formatDate;
const statusLabel = (status: Filter) =>
  ({
    all: "All shipments",
    attention: "Needs attention",
    acknowledged: "Acknowledged",
    pending: "Awaiting update",
    on_track: "On track",
    delivered: "Delivered",
  })[status];
async function openShipment(id: string) {
  selectedId.value = id;
  await nextTick();
  if (window.matchMedia("(max-width: 1050px)").matches)
    document
      .getElementById("shipment-detail")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function openCreation() {
  newDelivery.value = deliveryDraft(
    persona.value.accounts[0],
    persona.value.sites[0],
  );
  creating.value = true;
}
function createDelivery() {
  try {
    addDelivery({
      ...newDelivery.value,
      promisedAt: `${newDelivery.value.promisedAt}:00Z`,
    });
    selectedId.value = newDelivery.value.id.trim();
    activeFilter.value = "all";
    query.value = "";
    creating.value = false;
    showToast("Delivery created. Confirm each phase as updates arrive.");
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : "Could not add delivery",
      true,
    );
  }
}
watch(persona, () => {
  selectedId.value = undefined;
  activeFilter.value = "all";
  query.value = "";
});
</script>

<template>
  <DemoHeader />
  <main class="workspace">
    <div class="page-heading">
      <div>
        <span class="eyebrow"
          >OPERATIONS / {{ persona.name.toUpperCase() }}</span
        >
        <h1>Shipment overview</h1>
        <p>Exceptions first. Every status traced to an operator update.</p>
      </div>
      <button class="secondary-btn" @click="openCreation">
        <Plus :size="16" /> Add delivery
      </button>
    </div>
    <div class="summary" aria-label="Portfolio summary">
      <div class="metric">
        <div>
          <span class="metric-label">VISIBLE SHIPMENTS</span
          ><strong>{{ count("all") }}</strong>
        </div>
        <Package :size="21" />
      </div>
      <div class="metric is-warning">
        <div>
          <span class="metric-label">NEEDS ATTENTION</span
          ><strong>{{ count(ShipmentStatus.Attention) }}</strong>
        </div>
        <TriangleAlert :size="21" />
      </div>
      <div class="metric">
        <div>
          <span class="metric-label">ON TRACK</span
          ><strong>{{ count(ShipmentStatus.OnTrack) }}</strong>
        </div>
        <Activity :size="21" />
      </div>
      <div class="metric">
        <div>
          <span class="metric-label">DELIVERED</span
          ><strong>{{ count(ShipmentStatus.Delivered) }}</strong>
        </div>
        <CircleCheck :size="21" />
      </div>
    </div>
    <p class="data-note">
      SIMULATED INTELLIGENCE · {{ count(ShipmentStatus.Attention) }} need
      attention, {{ count(ShipmentStatus.Delivered) }} delivered. Highest
      priority:
      {{ nextAttention?.shipment.id ?? "none" }}
      ·
      {{ nextAttention?.alerts[0]?.action ?? "No action needed" }}.
    </p>
    <div class="workgrid" :class="{ 'has-detail': selected }">
      <section class="list-panel" aria-label="Shipment portfolio">
        <div class="panel-heading">
          <h2>Portfolio</h2>
          <small>As of {{ day(asOf) }} UTC</small>
        </div>
        <label class="search-field" for="shipment-search"
          ><Search :size="17" /><input
            id="shipment-search"
            v-model="query"
            type="search"
            placeholder="Shipments to France this week running late"
            aria-label="Search shipments using natural language" /></label
        ><small class="data-note"
          >Simulated search: destination, date, delay, shipment or order
          reference.</small
        >
        <div class="filters" aria-label="Filter shipments">
          <button
            v-for="filter in [
              'all',
              ShipmentStatus.Attention,
              'acknowledged',
              ShipmentStatus.Pending,
              ShipmentStatus.OnTrack,
              ShipmentStatus.Delivered,
            ] as Filter[]"
            :key="filter"
            :aria-pressed="activeFilter === filter"
            @click="
              activeFilter = filter;
              selectedId = undefined;
            "
          >
            {{ statusLabel(filter) }} · {{ count(filter) }}
          </button>
        </div>
        <div class="shipment-table">
          <div class="table-head">
            <span>SHIPMENT</span><span>ROUTE</span><span>ACCOUNT</span
            ><span>PROMISED</span><span>STATUS</span>
          </div>
          <button
            v-for="view in rows"
            :key="view.shipment.id"
            class="shipment-row"
            :aria-current="selectedId === view.shipment.id ? true : undefined"
            :aria-label="`Open ${view.shipment.id}, ${view.alerts[0]?.label ?? statusLabel(view.status)}${view.acknowledgedAction ? ', action acknowledged' : ''}`"
            @click="openShipment(view.shipment.id)"
          >
            <span
              ><strong>{{ view.shipment.id }}</strong
              ><small>{{ view.shipment.order }}</small></span
            ><span class="route"
              ><strong
                >{{ view.shipment.origin }} →
                {{ view.shipment.destination }}</strong
              ><small>{{
                view.shipment.legs.map((leg) => leg.mode).join(" / ")
              }}</small></span
            ><span class="date-cell"
              ><strong>{{ view.shipment.account }}</strong
              ><small>{{ view.shipment.site }}</small></span
            ><span class="date-cell"
              ><strong>{{ day(view.shipment.promisedAt) }}</strong
              ><small>{{
                view.shipment.scenarioEstimate &&
                view.alerts.some((alert) => alert.kind === AlertKind.Risk)
                  ? "Estimate " + day(view.shipment.scenarioEstimate.arrivalAt)
                  : "No revised estimate"
              }}</small></span
            ><span class="status-cell"
              ><span class="status" :class="view.status"
                ><ClockAlert
                  v-if="view.status === ShipmentStatus.Attention"
                  :size="13"
                /><CircleCheck v-else :size="13" />{{
                  view.alerts[0]?.label ?? statusLabel(view.status)
                }}</span
              ><small v-if="view.acknowledgedAction"
                >Action acknowledged</small
              ></span
            >
          </button>
          <div v-if="!rows.length" class="empty">
            No shipments in this category.
          </div>
        </div>
        <p class="scope-note">
          Access scope: {{ persona.sites.join(", ") }} ·
          {{ persona.accounts.join(", ") }}.
        </p>
      </section>
      <ShipmentDetail
        v-if="selected"
        :view="selected"
        :role="PersonaRole.Operations"
        @close="selectedId = undefined"
      />
      <div v-else class="empty-state">
        <Package :size="26" />
        <h3>Select a shipment</h3>
        <p>Inspect the journey, source evidence, and suggested next action.</p>
      </div>
    </div>
    <div v-if="creating" class="modal-backdrop" @click.self="creating = false">
      <form
        class="modal delivery-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-delivery-title"
        @submit.prevent="createDelivery"
      >
        <button
          type="button"
          class="icon-btn modal-close"
          title="Close dialog"
          aria-label="Close dialog"
          @click="creating = false"
        >
          <X :size="18" /></button
        ><span class="eyebrow">OPERATIONS</span>
        <h3 id="new-delivery-title">Add delivery</h3>
        <label for="new-id">Shipment ID</label
        ><input
          id="new-id"
          v-model="newDelivery.id"
          required
          placeholder="SH-1050"
        /><label for="new-order">Order</label
        ><input
          id="new-order"
          v-model="newDelivery.order"
          required
          placeholder="ORD-85020"
        /><label for="new-account">Customer account</label
        ><select id="new-account" v-model="newDelivery.account">
          <option v-for="account in persona.accounts" :key="account">
            {{ account }}
          </option></select
        ><label for="new-site">Origin site</label
        ><input id="new-site" :value="newDelivery.site" readonly /><label
          for="new-destination"
          >Destination</label
        ><input
          id="new-destination"
          v-model="newDelivery.destination"
          required
          placeholder="Paris, FR"
        /><label for="new-country">Destination country</label
        ><input
          id="new-country"
          v-model="newDelivery.destinationCountry"
          required
          placeholder="France"
        /><label for="new-promise">Promised arrival (UTC)</label
        ><input
          id="new-promise"
          v-model="newDelivery.promisedAt"
          type="datetime-local"
          required
        /><label for="new-route">Journey</label
        ><select id="new-route" v-model="newDelivery.route">
          <option :value="DeliveryRoute.Road">Road</option>
          <option :value="DeliveryRoute.Multimodal">
            Road → sea → customs → road
          </option>
        </select>
        <p class="data-note">
          Confirmation flow:
          {{ newPhases.map((step) => step.label).join(" → ") }}. No phases are
          confirmed until an operator records them.
        </p>
        <button class="secondary-btn" type="submit">
          <Plus :size="16" /> Create delivery
        </button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.empty-state {
  min-height: 270px;
  border: 1px dashed #bfcbc0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
  color: #61716c;
  padding: 30px;
}
.empty-state h3 {
  margin: 15px 0 5px;
  color: #1b2826;
}
.empty-state p {
  font-size: 0.8rem;
  line-height: 1.5;
}
.empty-state svg {
  color: #176b54;
}
@media (max-width: 1050px) {
  .empty-state {
    display: none;
  }
}
</style>
