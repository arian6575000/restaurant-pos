# Restaurant POS (Android)

Expo (SDK 58) + React Native + TypeScript restaurant POS with a **Parent** device (authoritative) and **Child** devices
(waiter / kitchen / cashier / custom roles) that sync over **Google Nearby Connections** (P2P_STAR), offline-first.

Developed by RetailX Solution · 03286575000

## Architecture in one page
- `src/core/**` – pure logic, no Expo imports, fully unit-tested under Node: event envelope + signatures, permissions (RBAC), order/payment state machines, validation, projection, Parent/Child nodes, heartbeat lease.
- `src/transport/**` – `Transport` interface; `memory.ts` (tests), `nearby.ts` (framing + native bridge).
- `modules/nearby-connections` – Kotlin Expo module (advertise / discover / connect / send bytes). Moves opaque frames only.
- `src/runtime/**` – glue: SQLite, device identity (Keystore), Nearby permissions, session context.
- `src/app/**` + `src/ui/screens/**` – Expo Router screens.
- `src/license/**` – existing RetailX license system, unchanged in contract. **Parent only.**

### Rules enforced on the Parent (never only in the UI)
Every event (Child or Parent) goes through one pipeline: dedupe → network/device/signature → state validation → permission →
sequence (+ order number) → persist → apply → audit → broadcast. Children apply optimistically and roll back on rejection.

### Licensing (Option B)
Only the Parent is licensed. Children have no license: the Parent sends a signed heartbeat carrying its license validity;
a Child works while the heartbeat is fresh (`LEASE_GRACE_MS`, default 12 h) and locks on grace expiry, license expiry or clock rollback.

## Before the first build
1. `npm run license:project` – registers this project's code/keys; put the real **public key** in `src/license/config.ts` (`PUBLIC_KEY_HEX`). Until then the app fails closed.
2. Confirm app name / package (`app.json`) and `PROJECT_CODE` / `DEVICE_PREFIX` in `src/license/config.ts` (currently proposals).
3. Release signing: see `plugins/withReleaseSigning.js` and `eas.json` (same as DarziHub).
4. `npx eas-cli build -p android --profile preview`

## Commands
`npm test` (license, core, network, transport) · `npm run typecheck` · `npx expo start`

## Verified vs. not yet verified
Verified: Node tests for all core + sync behaviour (15 network scenarios), TypeScript strict, Android JS bundle (`expo export`), `expo prebuild` + autolinking of the Nearby module.
**Not verified (needs a device build):** Kotlin compile of the Nearby module (`play-services-nearby:19.3.0` version is an assumption), real Nearby behaviour (connection limits, payload size — frames are 16 KB to stay safe, background behaviour), all UI screens at runtime.
