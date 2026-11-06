export function horizonTimeIndex(startIndex, deltaX, width, sampleCount) {
  const last = Math.max(0, sampleCount - 1);
  return Math.round(
    Math.max(
      0,
      Math.min(last, startIndex + (deltaX / Math.max(1, width)) * last),
    ),
  );
}
