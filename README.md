# Waypoint: Shipment Visibility Prototype

A clickable, frontend-only shipment tracking demonstration for the [MarsBased technical brief](MarsBased%20Technical%20Test_%20Shipment%20Tracking%20App.md). All companies, events, documents and recommendations are synthetic. Nothing is sent to an operator or customer.

## Run locally

Requires Node.js 22+ and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173/`). The root path opens North logistics. Use **Accounts** in the avatar menu to switch between North logistics, South logistics, Atlas Components and Meridian Assembly. Each account has its own URL. Run `npm run test`, `npm run check`, `npm run format:check`, and `npm run build` for validation; `npm run format` applies Prettier. `npm run preview` serves the production build locally. A static host must return `index.html` for all account paths to support direct links and reloads.

## Demo walkthrough

1. Open **North logistics**. Select **SH-1042** to see road, sea and customs evidence, the delayed scenario midpoint, a suggested action and a customer notice draft. Acknowledge the next action with a note and update time; the customs hold remains visible while the action gains an acknowledgment badge. Alerts cannot be manually deleted or dismissed; they are recalculated from shipment evidence and the demo clock. Copying the draft is local; no notice is sent.
2. Search for “shipments to France this week running late” or “what's going on with order 85012?”; results are deterministic and account-scoped. Switch to **South logistics** for Valencia shipments. **SH-1047** is overdue; **SH-1048** has an unknown operator code that remains under review.
3. Add a delivery from an operations account, choosing its customer, route and promised date. Confirm each phase in order from its detail panel. Switch to the chosen customer account to see the same updates. **SH-1046** under Atlas shows a confirmed delivery date instead of a predicted arrival.

The switcher simulates role and site/account scope; it is **not access control**. Any user can inspect bundled fixtures and saved data in browser developer tools. The starting clock is pinned to **2 October 2026, 12:00 UTC**; after a locally recorded event, the clock advances to the real receipt time. Pinia persists changes in browser `localStorage` across reloads on the same device. Use the reset icon beside Accounts to remove saved shipment data and reload the original fixtures; this control is for testing only. If storage is unavailable, the demo continues in memory only. The estimated date is a fixture scenario tied to a confirmed source event, not a live prediction. Dates use Spanish day/month/year format with UTC times. External Google Fonts require a network connection; local fallbacks are provided.

See [the approach and production path](docs/approach.md) for scope, architecture, AI boundaries and next steps.