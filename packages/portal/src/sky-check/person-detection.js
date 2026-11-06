/**
 * People in an image, and the other things a photograph of the sky or of a
 * landscape does not hold (an animal, a plate, a room): a small object
 * detector run on the server, alone, with no service of anyone else.
 *
 * - **The model**: YOLOX-nano (Megvii, Apache-2.0 for the code and the
 *   weights), trained on the 80 classes of COCO, exported to ONNX by its
 *   authors (`yolox_nano.onnx` of the release 0.1.1rc0, 3.7 MB). It ships
 *   in this package (`models/yolox-nano.onnx`, its licence next to it) and
 *   is checked against `PERSON_DETECTOR.sha256` when it is loaded.
 * - **The runtime**: ONNX Runtime's WebAssembly build (`onnxruntime-web`,
 *   MIT), one thread: no native library, no install script, no telemetry,
 *   the same numbers on every machine.
 * - **Loaded on demand**, like `sharp`: the runtime and the model are read
 *   the first time an image is checked (`await import`), never at start,
 *   and the session is kept for the life of the process.
 *
 * The image is looked at whole (scaled into 416 × 416, padded like the
 * model was trained) and, while no person was found yet, in four tiles of
 * an 832-pixel copy, where a person far away is twice as large. The answer
 * is the best score of a person with the share of the image it covers,
 * and the best score of each other class found; never a box, never a face.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** The model this module runs, and how to check it is the one measured. */
export const PERSON_DETECTOR = Object.freeze({
  name: "yolox-nano",
  file: "yolox-nano.onnx",
  sha256: "c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d",
  inputSize: 416,
  licence: "Apache-2.0",
  source:
    "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx",
});

/** The default place of the model: `models/` of this package. */
export const DEFAULT_PERSON_MODEL_PATH = fileURLToPath(
  new URL(`../../models/${PERSON_DETECTOR.file}`, import.meta.url),
);

/** The 80 classes of COCO, in the order of the model's output. */
export const COCO_CLASSES = Object.freeze([
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "airplane",
  "bus",
  "train",
  "truck",
  "boat",
  "traffic light",
  "fire hydrant",
  "stop sign",
  "parking meter",
  "bench",
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
  "backpack",
  "umbrella",
  "handbag",
  "tie",
  "suitcase",
  "frisbee",
  "skis",
  "snowboard",
  "sports ball",
  "kite",
  "baseball bat",
  "baseball glove",
  "skateboard",
  "surfboard",
  "tennis racket",
  "bottle",
  "wine glass",
  "cup",
  "fork",
  "knife",
  "spoon",
  "bowl",
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "chair",
  "couch",
  "potted plant",
  "bed",
  "dining table",
  "toilet",
  "tv",
  "laptop",
  "mouse",
  "remote",
  "keyboard",
  "cell phone",
  "microwave",
  "oven",
  "toaster",
  "sink",
  "refrigerator",
  "book",
  "clock",
  "vase",
  "scissors",
  "teddy bear",
  "hair drier",
  "toothbrush",
]);

/** The score from which a class is kept in the answer (`classes`). */
const KEEP_SCORE = 0.05;

const CLASSES = 80;
const STRIDE_ROW = 5 + CLASSES;
const PAD = 114;
/** Objectness under which an anchor is not read (speed only). */
const MIN_OBJECTNESS = 0.02;
/** The score from which a person counts in `personCount`. */
const COUNT_SCORE = 0.3;

const STATE = Symbol.for("astro-portal.person-detector");

class DetectorUnavailable extends Error {}

/** The anchors of the model's three strides, in the order of its output. */
function gridOf(size) {
  const grid = [];
  for (const stride of [8, 16, 32]) {
    const cells = size / stride;
    for (let y = 0; y < cells; y += 1)
      for (let x = 0; x < cells; x += 1) grid.push([x, y, stride]);
  }
  return grid;
}

/**
 * The session of the process, created once (shared by every copy of this
 * module, like the processing queue). Rejects with `DetectorUnavailable`
 * when the runtime or the model cannot be had.
 */
async function sessionFor(modelPath) {
  globalThis[STATE] ??= new Map();
  const sessions = globalThis[STATE];
  if (!sessions.has(modelPath))
    sessions.set(
      modelPath,
      (async () => {
        let ort;
        try {
          ort = await import("onnxruntime-web");
        } catch (error) {
          throw new DetectorUnavailable(`runtime: ${error?.message || error}`);
        }
        let bytes;
        try {
          bytes = await readFile(modelPath);
        } catch (error) {
          throw new DetectorUnavailable(`model: ${error?.code || error}`);
        }
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== PERSON_DETECTOR.sha256)
          throw new DetectorUnavailable("model: unexpected digest");
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        ort.env.logLevel = "error";
        const session = await ort.InferenceSession.create(
          new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length),
          { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
        );
        return { ort, session, grid: gridOf(PERSON_DETECTOR.inputSize) };
      })().catch((error) => {
        sessions.delete(modelPath);
        throw error;
      }),
    );
  return sessions.get(modelPath);
}

/**
 * One view of the image (an RGB buffer, `width` × `height`) as the model's
 * input: scaled to fit 416 × 416, placed top-left on grey, in BGR planes of
 * 0–255 (the export of YOLOX takes them so). Answers the tensor's data and
 * the scale.
 */
async function inputOf(sharp, rgb, width, height) {
  const size = PERSON_DETECTOR.inputSize;
  const ratio = Math.min(size / width, size / height);
  const scaledWidth = Math.max(1, Math.round(width * ratio));
  const scaledHeight = Math.max(1, Math.round(height * ratio));
  const scaled =
    scaledWidth === width && scaledHeight === height
      ? rgb
      : await sharp(rgb, { raw: { width, height, channels: 3 } })
          .resize(scaledWidth, scaledHeight, { fit: "fill" })
          .raw()
          .toBuffer();
  const plane = size * size;
  const data = new Float32Array(3 * plane).fill(PAD);
  for (let y = 0; y < scaledHeight; y += 1)
    for (let x = 0; x < scaledWidth; x += 1) {
      const from = (y * scaledWidth + x) * 3;
      const to = y * size + x;
      data[to] = scaled[from + 2];
      data[plane + to] = scaled[from + 1];
      data[2 * plane + to] = scaled[from];
    }
  return { data, ratio };
}

/** A region of an RGB buffer, copied out. */
function cropOf(rgb, width, left, top, cropWidth, cropHeight) {
  const out = Buffer.alloc(cropWidth * cropHeight * 3);
  for (let y = 0; y < cropHeight; y += 1)
    rgb.copy(
      out,
      y * cropWidth * 3,
      ((top + y) * width + left) * 3,
      ((top + y) * width + left + cropWidth) * 3,
    );
  return out;
}

/** The tiles of an image larger than the model's input: two per long axis. */
export function tilesOf(width, height, size = PERSON_DETECTOR.inputSize) {
  const starts = (length) =>
    length <= size ? [0] : [0, Math.max(0, length - size)];
  const tiles = [];
  for (const top of starts(height))
    for (const left of starts(width))
      tiles.push({
        left,
        top,
        width: Math.min(size, width - left),
        height: Math.min(size, height - top),
      });
  return tiles.length > 1 ? tiles : [];
}

/**
 * Reads the model's output for one view into `found`: the best score per
 * class, and the best person's box as a share of the whole image.
 */
function readOutput(output, grid, view, found) {
  const people = [];
  for (let anchor = 0; anchor < grid.length; anchor += 1) {
    const at = anchor * STRIDE_ROW;
    const objectness = output[at + 4];
    if (objectness < MIN_OBJECTNESS) continue;
    for (let id = 0; id < CLASSES; id += 1) {
      const score = objectness * output[at + 5 + id];
      if (score > found.classes[id]) found.classes[id] = score;
    }
    const person = objectness * output[at + 5];
    if (person >= COUNT_SCORE || person > found.personScore) {
      const [gx, gy, stride] = grid[anchor];
      const boxWidth = (Math.exp(output[at + 2]) * stride) / view.ratio;
      const boxHeight = (Math.exp(output[at + 3]) * stride) / view.ratio;
      const centreX = ((output[at] + gx) * stride) / view.ratio + view.left;
      const centreY = ((output[at + 1] + gy) * stride) / view.ratio + view.top;
      const box = {
        score: person,
        x0: centreX - boxWidth / 2,
        y0: centreY - boxHeight / 2,
        x1: centreX + boxWidth / 2,
        y1: centreY + boxHeight / 2,
      };
      if (person > found.personScore) {
        found.personScore = person;
        found.personAreaFraction =
          (Math.min(boxWidth, view.imageWidth) *
            Math.min(boxHeight, view.imageHeight)) /
          (view.imageWidth * view.imageHeight);
      }
      if (person >= COUNT_SCORE) people.push(box);
    }
  }
  found.boxes.push(...people);
}

/** How many separate people the boxes hold (overlapping boxes are one). */
function countPeople(boxes) {
  const kept = [];
  for (const box of [...boxes].sort((a, b) => b.score - a.score)) {
    const overlaps = kept.some((other) => {
      const width = Math.min(box.x1, other.x1) - Math.max(box.x0, other.x0);
      const height = Math.min(box.y1, other.y1) - Math.max(box.y0, other.y0);
      if (width <= 0 || height <= 0) return false;
      const inter = width * height;
      const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);
      return inter / Math.min(area(box), area(other)) > 0.5;
    });
    if (!overlaps) kept.push(box);
  }
  return kept.length;
}

/**
 * Looks for people (and animals, plates, rooms) in a raster image.
 * `sharp` is the loaded module; `options` the decoding bounds of the check.
 * Answers `{ available, personScore, personAreaFraction, personCount,
 * classes, views, milliseconds }`, or `{ available: false, reason }` when
 * the runtime or the model cannot be had. Throws on an unreadable image
 * (the caller has decoded it already).
 */
export async function detectPeople(
  path,
  {
    sharp,
    maxPixels,
    timeoutSeconds = 15,
    modelPath,
    tiles = true,
    stopAt = 0.5,
    deadline = Infinity,
  } = {},
) {
  const started = performance.now();
  let detector;
  try {
    detector = await sessionFor(modelPath || DEFAULT_PERSON_MODEL_PATH);
  } catch (error) {
    if (error instanceof DetectorUnavailable)
      return { available: false, reason: error.message };
    throw error;
  }
  const { ort, session, grid } = detector;
  const size = PERSON_DETECTOR.inputSize;
  const { data: rgb, info } = await sharp(path, {
    limitInputPixels: maxPixels,
    failOn: "none",
    pages: 1,
  })
    .timeout({ seconds: timeoutSeconds })
    .rotate()
    .resize({
      width: 2 * size,
      height: 2 * size,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const found = {
    personScore: 0,
    personAreaFraction: 0,
    classes: new Float32Array(CLASSES),
    boxes: [],
  };
  const views = [{ left: 0, top: 0, width, height }];
  if (tiles) views.push(...tilesOf(width, height, size));
  let ran = 0;
  for (const view of views) {
    if (ran > 0 && found.personScore >= stopAt) break;
    if (ran > 0 && performance.now() > deadline) break;
    const pixels =
      view.width === width && view.height === height
        ? rgb
        : cropOf(rgb, width, view.left, view.top, view.width, view.height);
    const input = await inputOf(sharp, pixels, view.width, view.height);
    const result = await session.run({
      [session.inputNames[0]]: new ort.Tensor("float32", input.data, [
        1,
        3,
        size,
        size,
      ]),
    });
    readOutput(
      result[session.outputNames[0]].data,
      grid,
      {
        ratio: input.ratio,
        left: view.left,
        top: view.top,
        imageWidth: width,
        imageHeight: height,
      },
      found,
    );
    ran += 1;
  }
  return {
    available: true,
    personScore: found.personScore,
    personAreaFraction: found.personAreaFraction,
    personCount: countPeople(found.boxes),
    // The best score of each class found at `KEEP_SCORE` or more, by name.
    classes: Object.fromEntries(
      [...found.classes]
        .map((score, id) => [COCO_CLASSES[id], score])
        .filter(([name, score]) => name !== "person" && score >= KEEP_SCORE),
    ),
    views: ran,
    milliseconds: Math.round(performance.now() - started),
  };
}
