/**
 * « What is online for a night »: what Astro Sync's resume and its
 * « Nuits » list read before they decide what to send, and what the phone
 * reads later — per target of the night, its captures with their source,
 * stage and visibility, the main image (its SHA-256, size, name and date)
 * and every image of the capture (the main one first, then the variants),
 * each with its digest and whether a sky solution exists for it (the
 * solution belongs to each image); and for the night, the analysis in
 * place (sent when, by which device, report version, the steps it
 * proposed and how many were corrected by hand).
 *
 * Pure: `nightOnline({ session, targetIds, rows, names, analysis, steps })`
 * builds the answer from the rows `night-repository.js#onlineRows` reads.
 */

const solved = (row) => (Number(row.solved) ? "present" : "missing");

function imageOf(row) {
  return {
    id: row.id,
    main: Boolean(Number(row.is_main)),
    sha256: row.sha256,
    byteSize: Number(row.byte_size),
    originalName: row.original_name,
    source: row.source ?? null,
    createdAt: row.created_at,
    skySolution: solved(row),
  };
}

function captureOf(capture, images, targetIds) {
  const own = images.filter((row) => row.capture_id === capture.id);
  const main = own.find((row) => Number(row.is_main)) ?? own[0] ?? null;
  return {
    id: capture.id,
    targetIds,
    // The source of the capture is its main image's (`phone`, `web`,
    // `astro-sync`, `stacking`; null for an image stored before images carried
    // a source).
    source: main?.source ?? null,
    stage: capture.stage ?? "draft",
    visibility: capture.visibility ?? "private",
    uploaded: capture.status === "uploaded",
    createdAt: capture.created_at,
    mainImage: main ? imageOf(main) : null,
    imageCount: own.length,
    images: own.map(imageOf),
  };
}

export function nightOnline({
  sessionId,
  targetIds = [],
  rows,
  names = new Map(),
  analysis = null,
  steps = [],
}) {
  const targetsByCapture = new Map();
  for (const row of rows.targets) {
    if (!targetsByCapture.has(row.capture_id))
      targetsByCapture.set(row.capture_id, []);
    targetsByCapture.get(row.capture_id).push(row.target_id);
  }
  const captures = rows.captures.map((capture) =>
    captureOf(capture, rows.images, targetsByCapture.get(capture.id) ?? []),
  );
  // The night's targets first, in their order, then the targets only a
  // capture names; a capture showing several targets is listed under
  // each; a capture with no target goes under `targetId: null`, last.
  const order = [...targetIds];
  for (const capture of captures)
    for (const id of capture.targetIds) if (!order.includes(id)) order.push(id);
  const targets = order.map((targetId) => ({
    targetId,
    name: names.get(targetId) ?? null,
    planned: targetIds.includes(targetId),
    captures: captures.filter((capture) =>
      capture.targetIds.includes(targetId),
    ),
  }));
  const loose = captures.filter((capture) => !capture.targetIds.length);
  if (loose.length)
    targets.push({
      targetId: null,
      name: null,
      planned: false,
      captures: loose,
    });
  const proposed = steps.filter(
    (step) => step.origin === "analysis" || step.origin === "import",
  );
  return {
    sessionId,
    targets,
    analysis: analysis
      ? {
          present: true,
          sentAt: analysis.created_at,
          originDeviceId: analysis.origin_device_id ?? null,
          deviceName: analysis.device_name ?? null,
          reportVersion: Number(analysis.report_version),
          producer: analysis.report?.producer ?? null,
          stepCount: proposed.length,
          editedStepCount: proposed.filter((step) => step.edited).length,
        }
      : {
          present: false,
          sentAt: null,
          originDeviceId: null,
          deviceName: null,
          reportVersion: null,
          producer: null,
          stepCount: 0,
          editedStepCount: 0,
        },
  };
}
