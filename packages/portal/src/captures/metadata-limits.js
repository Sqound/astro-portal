/**
 * The limits of a capture's metadata: a capture's title 80 characters,
 * description 2 000, notes 4 000, calibration 120; an acquisition line's
 * filter 40; the processing's software 120 and steps 500; an image's title
 * 90 and description 280. Counted in characters (code points), as
 * the database counts them. Shared by the service and the screens.
 */
export const METADATA_LIMITS = Object.freeze({
  title: 80,
  description: 2000,
  notes: 4000,
  calibration: 120,
  filter: 40,
  software: 120,
  steps: 500,
  variantTitle: 90,
  variantDescription: 280,
});
