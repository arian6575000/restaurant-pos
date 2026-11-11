// ====== PER-APP LICENSE SETTINGS ======
// PROJECT_CODE: same code as in the License Generator "Projects" list (register it there first).
// PUBLIC_KEY_HEX: the Ed25519 PUBLIC key (64 hex chars) of this project. Generate with `npm run license:project`.
// Never put a private key here. Until a real key is set the app fails closed (license screen shows a config error).
export const PROJECT_CODE = "restaurant-pos";
export const PUBLIC_KEY_HEX = "4c007b95bd6001179541ba20190570f282804629bcef97a386663d9d439409e2";
// =======================================
// DEVICE_PREFIX: app name at the start of the Device ID ("RestaurantPOS-87A9-F285-E2DF"); unique per app.
export const DEVICE_PREFIX = "RestaurantPOS";
// New app: no legacy licenses exist.
export const ACCEPT_LEGACY_DEVICE_ID = false;
export const KEY_CONFIGURED = /^[0-9a-fA-F]{64}$/.test(PUBLIC_KEY_HEX);
