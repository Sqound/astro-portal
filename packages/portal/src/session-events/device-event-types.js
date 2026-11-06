/**
 * The events of the night's pointing devices, kept in the session: the night's mount (`mount_*`), a smart telescope in
 * mode expérimental (`device_*`) and the pointing helps (`pointing_help`).
 * See packages/astro-contracts/schemas/session-events.md, « The
 * pointing-device kinds ».
 *
 * Such an event is a fact about a device, never about the night's time: it
 * moves no window, opens no passage and is no report on a target. The pages
 * read them as lines of their own (`components/sessions/session-device-lines.js`).
 * SMART-SCOPE-INSTRUMENT-PANEL-01: `device_instrument` (a sample of what a smart
 * telescope says of itself) is read by `components/sessions/session-instrument-lines.js`,
 * never as a device line.
 */
export const DEVICE_EVENT_TYPES = Object.freeze([
  "mount_connected",
  "mount_goto",
  "mount_stop",
  "mount_link_lost",
  "mount_link_back",
  "mount_disconnected",
  "mount_parked",
  "mount_aligned",
  "pointing_help",
  "device_connected",
  "device_goto",
  "device_stop",
  "device_parked",
  "device_link_lost",
  "device_link_back",
  "device_instrument",
]);

const DEVICE_EVENT_SET = new Set(DEVICE_EVENT_TYPES);

/** Whether `type` (an event's wire type) is one of the pointing devices'. */
export const isDeviceEventType = (type) =>
  typeof type === "string" && DEVICE_EVENT_SET.has(type);
