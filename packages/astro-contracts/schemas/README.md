Versioned JSON Schemas belong in this directory.

## `widget-snapshot.schema.json`

The compact, non-sensitive snapshot the mobile app hands to its native
extensions (iOS widget, Live Activity, Apple Watch, Android widget). `additionalProperties: false` is the leak guard: an
extra field such as `location`, a coordinate, a tenant/device id, or a token
is structurally rejected at every level of the object, not merely absent by
convention. A widget or Watch complication only ever renders this shape; it
never calls the API, never holds a credential, and never contains the
planner.

`version` (currently `1`, `const`) lets a native reader compiled against an
older or newer shape recognize a mismatch and fall back to its placeholder
state instead of guessing at an incompatible layout.
