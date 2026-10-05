<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Anchor,
  ArrowDown,
  Check,
  Clipboard,
  Clock3,
  Eye,
  FileText,
  Ship,
  Truck,
  TriangleAlert,
  X,
} from "lucide-vue-next";
import { NoticeComposer } from "../domain/notices";
import { formatDate, formatDateTime } from "../domain/dates";
import { acknowledge, advance, nextPhase, phases } from "../domain/store";
import { showToast } from "../domain/toasts";
import {
  AlertKind,
  MilestoneKind,
  Mode,
  PersonaRole,
  Provenance,
  ShipmentStatus,
  type ShipmentDocument,
  type ShipmentView,
} from "../domain/types";

const props = defineProps<{
  view: ShipmentView;
  role: PersonaRole;
}>();
const emit = defineEmits<{ close: [] }>();
const composer = new NoticeComposer();
const notice = computed(() => composer.compose(props.view));
const draft = ref("");
const preview = ref<ShipmentDocument>();
const dialog = ref<"acknowledge" | "phase">();
const note = ref("");
const updateTime = ref("");
const phase = computed(() => nextPhase(props.view.shipment));
const visibleMilestones = computed(() =>
  props.role === PersonaRole.Customer
    ? props.view.milestones.filter(
        (milestone) => milestone.kind !== MilestoneKind.Acknowledged,
      )
    : props.view.milestones,
);
const phaseProgress = computed(() =>
  phases(props.view.shipment).findIndex(
    (step) => step.code === phase.value?.code,
  ),
);
const deliveredAt = computed(
  () =>
    [...props.view.milestones]
      .reverse()
      .find((milestone) => milestone.kind === MilestoneKind.Delivered)
      ?.occurredAt,
);
const supportedEstimate = computed(() =>
  props.view.shipment.scenarioEstimate &&
  props.view.milestones.some(
    (milestone) =>
      milestone.id === props.view.shipment.scenarioEstimate?.sourceEventId &&
      milestone.provenance === Provenance.Confirmed,
  ) &&
  props.view.status !== ShipmentStatus.Delivered
    ? props.view.shipment.scenarioEstimate
    : undefined,
);
const midpoint = computed(() =>
  supportedEstimate.value?.expectedAt
    ? new Date(
        (Date.parse(supportedEstimate.value.expectedAt) +
          Date.parse(supportedEstimate.value.arrivalAt)) /
          2,
      ).toISOString()
    : undefined,
);
const date = formatDateTime;
const day = formatDate;
function openDialog(kind: "acknowledge" | "phase") {
  note.value = "";
  updateTime.value = new Date().toISOString().slice(0, 16);
  dialog.value = kind;
}
function submitDialog() {
  try {
    if (dialog.value === "acknowledge")
      acknowledge(
        props.view.shipment.id,
        note.value,
        `${updateTime.value}:00Z`,
      );
    else if (dialog.value === "phase")
      advance(props.view.shipment.id, `${updateTime.value}:00Z`);
    showToast(
      dialog.value === "acknowledge"
        ? "Next action acknowledged"
        : "Delivery phase confirmed",
    );
    dialog.value = undefined;
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : "Could not save update",
      true,
    );
  }
}
async function copyDraft() {
  try {
    await navigator.clipboard.writeText(draft.value);
    showToast("Draft copied to clipboard");
  } catch {
    showToast("Could not copy draft", true);
  }
}
watch(
  () => props.view.shipment.id,
  () => {
    draft.value = notice.value ?? "";
    preview.value = undefined;
    dialog.value = undefined;
  },
  { immediate: true },
);
</script>

<template>
  <aside id="shipment-detail" class="detail" aria-label="Shipment detail">
    <div class="detail-head">
      <div>
        <span class="eyebrow">SHIPMENT / {{ view.shipment.order }}</span>
        <h2>{{ view.shipment.id }}</h2>
      </div>
      <button
        class="icon-btn"
        title="Close detail"
        aria-label="Close detail"
        @click="emit('close')"
      >
        <X :size="19" />
      </button>
    </div>
    <div class="detail-scroll">
      <div class="route-summary">
        <div>
          <span class="eyebrow">ORIGIN</span
          ><strong>{{ view.shipment.origin }}</strong>
        </div>
        <ArrowDown :size="19" />
        <div>
          <span class="eyebrow">DESTINATION</span
          ><strong>{{ view.shipment.destination }}</strong>
        </div>
      </div>
      <div class="eta-grid">
        <div v-if="view.status !== ShipmentStatus.Delivered">
          <span class="eyebrow">PROMISED ARRIVAL</span
          ><strong>{{ day(view.shipment.promisedAt) }}</strong>
        </div>
        <div :class="{ 'estimate-delay': supportedEstimate }">
          <span class="eyebrow">{{
            view.status === ShipmentStatus.Delivered
              ? "LATEST ARRIVAL"
              : supportedEstimate
                ? "SCENARIO ESTIMATE"
                : "LATEST ARRIVAL"
          }}</span
          ><strong>{{
            view.status === ShipmentStatus.Delivered && deliveredAt
              ? day(deliveredAt)
              : supportedEstimate
                ? day(supportedEstimate.arrivalAt)
                : day(view.shipment.promisedAt)
          }}</strong
          ><small v-if="supportedEstimate"
            >Starting prediction
            {{ day(supportedEstimate.startingAt ?? view.shipment.promisedAt) }}
            · simulated, not confirmed</small
          ><small v-else-if="view.status !== ShipmentStatus.Delivered"
            >Promised date, no prediction</small
          ><small v-else>Confirmed delivery</small>
        </div>
      </div>
      <div v-if="view.alerts.length" class="detail-alert" role="status">
        <TriangleAlert :size="18" />
        <div>
          <strong>{{
            role === PersonaRole.Customer &&
            view.alerts[0].kind === AlertKind.Review
              ? "Update under review"
              : view.alerts[0].label
          }}</strong>
          <p>
            {{
              role === PersonaRole.Customer &&
              view.alerts[0].kind === AlertKind.Review
                ? "We received an operator update that we cannot yet verify. The last confirmed status remains unchanged."
                : view.alerts[0].explanation
            }}
          </p>
        </div>
      </div>
      <div v-if="notice && role === PersonaRole.Customer" class="notice">
        <span class="eyebrow">ARRIVAL ADVISORY · SIMULATED</span>
        <p>{{ notice }}</p>
      </div>
      <section class="detail-section">
        <div class="section-heading">
          <h3>Journey</h3>
          <span>{{ view.shipment.legs.length }} legs</span>
        </div>
        <div class="leg-strip" aria-label="Journey legs">
          <div
            v-for="(leg, index) in view.shipment.legs"
            :key="index"
            class="leg"
            :title="`${leg.from} to ${leg.to} via ${leg.operator}`"
          >
            <component
              :is="
                leg.mode === Mode.Road
                  ? Truck
                  : leg.mode === Mode.Sea
                    ? Ship
                    : Anchor
              "
              :size="17"
            /><span>{{ leg.mode }}</span>
          </div>
        </div>
        <div class="timeline">
          <div
            v-for="milestone in visibleMilestones"
            :key="milestone.id"
            class="timeline-item"
            :class="{
              'is-unmapped': milestone.provenance === Provenance.Unmapped,
              'is-delayed': supportedEstimate?.sourceEventId === milestone.id,
            }"
          >
            <span class="timeline-dot"></span>
            <div class="timeline-content">
              <strong>{{
                milestone.provenance === Provenance.Unmapped &&
                role === PersonaRole.Customer
                  ? "Operator update under review"
                  : milestone.label
              }}</strong
              ><span
                >{{ view.shipment.legs[milestone.leg]?.from }} ·
                {{ milestone.operator }}</span
              ><small
                >{{ date(milestone.occurredAt) }} · received
                {{ date(milestone.receivedAt) }}</small
              ><small
                v-if="
                  milestone.kind === MilestoneKind.Acknowledged &&
                  role === PersonaRole.Operations
                "
                >{{
                  view.shipment.events.find(
                    (event) => event.id === milestone.id,
                  )?.description
                }}</small
              ><small v-if="milestone.provenance === Provenance.Unmapped">{{
                role === PersonaRole.Operations
                  ? `Code ${milestone.rawCode} · status not inferred`
                  : "Last confirmed status unchanged"
              }}</small>
            </div>
          </div>
          <div v-if="midpoint" class="timeline-item is-projected">
            <span class="timeline-dot"></span>
            <div class="timeline-content">
              <strong>Projected delay midpoint</strong
              ><span
                >Between expected {{ day(supportedEstimate!.expectedAt!) }} and
                scenario arrival {{ day(supportedEstimate!.arrivalAt) }}</span
              ><small
                >{{ date(midpoint) }} · simulated, not an operator
                confirmation</small
              >
            </div>
          </div>
        </div>
        <p class="data-note">
          <Clock3 :size="14" /> Last confirmed
          {{
            view.lastConfirmed
              ? date(view.lastConfirmed.receivedAt)
              : "not available"
          }}. Times shown in UTC.
        </p>
      </section>
      <section
        v-if="role === PersonaRole.Operations && view.alerts.length"
        class="detail-section action-section"
      >
        <span class="eyebrow">RECOMMENDED NEXT ACTION · SIMULATED</span>
        <p>{{ view.alerts[0].action }}</p>
        <button
          v-if="!view.acknowledgedAction"
          class="secondary-btn"
          @click="openDialog('acknowledge')"
        >
          <Check :size="16" /> Acknowledge next action
        </button>
        <div v-else class="action-receipt">
          <span class="status acknowledged">Action acknowledged</span>
          <small
            >{{ view.acknowledgedAction.description }} ·
            {{ date(view.acknowledgedAction.receivedAt) }}</small
          >
        </div>
      </section>
      <section
        v-if="role === PersonaRole.Operations && phase"
        class="detail-section"
      >
        <div class="section-heading">
          <h3>Delivery phases</h3>
          <span
            >{{ phaseProgress }} /
            {{ phases(view.shipment).length }} confirmed</span
          >
        </div>
        <p class="data-note">
          Next: {{ phase.label }}. Phases are confirmed one at a time; future
          steps remain unconfirmed.
        </p>
        <button class="secondary-btn" @click="openDialog('phase')">
          <Check :size="16" /> Confirm next phase
        </button>
      </section>
      <section
        v-if="role === PersonaRole.Operations && notice"
        class="detail-section"
      >
        <div class="section-heading">
          <h3>Customer notice draft</h3>
          <span>Review before use</span>
        </div>
        <label class="sr-only" for="draft">Customer notice draft</label
        ><textarea id="draft" :value="draft" rows="5" readonly></textarea
        ><button class="secondary-btn" :disabled="!draft" @click="copyDraft">
          <Clipboard :size="16" /> Copy draft
        </button>
        <p class="data-note">No message is sent from this prototype.</p>
      </section>
      <section class="detail-section">
        <div class="section-heading">
          <h3>Documents</h3>
          <span>{{ view.shipment.documents.length }} available previews</span>
        </div>
        <button
          v-for="doc in view.shipment.documents"
          :key="doc.reference"
          class="document"
          @click="preview = doc"
        >
          <FileText :size="18" /><span
            ><strong>{{ doc.name }}</strong
            ><small>{{ doc.reference }} · synthetic preview</small></span
          ><Eye :size="15" />
        </button>
      </section>
    </div>
    <div v-if="dialog" class="modal-backdrop" @click.self="dialog = undefined">
      <form
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        @submit.prevent="submitDialog"
      >
        <button
          type="button"
          class="icon-btn modal-close"
          title="Close dialog"
          aria-label="Close dialog"
          @click="dialog = undefined"
        >
          <X :size="18" /></button
        ><span class="eyebrow">OPERATOR UPDATE</span>
        <h3 id="update-title">
          {{
            dialog === "acknowledge"
              ? "Acknowledge next action"
              : `Confirm ${phase?.label}`
          }}
        </h3>
        <label for="update-time">Operator update time (UTC)</label
        ><input
          id="update-time"
          v-model="updateTime"
          type="datetime-local"
          required
        /><template v-if="dialog === 'acknowledge'"
          ><label for="update-note">Update details</label
          ><textarea
            id="update-note"
            v-model="note"
            rows="4"
            required
            placeholder="What did the operator report?"
          ></textarea>
        </template>
        <p class="data-note">
          Receipt time is captured automatically when you save.
        </p>
        <button type="submit" class="secondary-btn">
          <Check :size="16" /> Save update
        </button>
      </form>
    </div>
    <div
      v-if="preview"
      class="modal-backdrop"
      @click.self="preview = undefined"
    >
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
      >
        <button
          class="icon-btn modal-close"
          title="Close preview"
          aria-label="Close preview"
          @click="preview = undefined"
        >
          <X :size="18" /></button
        ><span class="eyebrow">SYNTHETIC DOCUMENT PREVIEW</span>
        <h3 id="preview-title">{{ preview.name }}</h3>
        <p class="mono">{{ preview.reference }}</p>
        <p>{{ preview.preview }}</p>
        <p class="data-note">No file is downloaded or uploaded.</p>
      </div>
    </div>
  </aside>
</template>
