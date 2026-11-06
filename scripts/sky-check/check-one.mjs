// One check, in its own process, for the measurement harness (measure.mjs):
// prints the verdict and the process's memory as one line of JSON. The
// baseline memory is read after the module is loaded and before the file
// is checked; `sharp` is loaded by the check itself, so its memory counts
// as added by the check.
import { checkCaptureFile } from "../../packages/portal/dist/sky-check/index.js";

const [path, originalName, settingsJson] = process.argv.slice(2);
const settings = settingsJson ? JSON.parse(settingsJson) : undefined;
const baselineRss = process.memoryUsage().rss;
let peakRss = baselineRss;
const sampler = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 5);
const started = performance.now();
const verdict = await checkCaptureFile({ path, originalName, settings });
const elapsed = performance.now() - started;
clearInterval(sampler);
// maxRSS (kilobytes) covers the whole life of the process, the sampler
// only what it saw: the larger is kept.
peakRss = Math.max(peakRss, process.resourceUsage().maxRSS * 1024);
process.stdout.write(
  `${JSON.stringify({
    verdict,
    elapsedMs: Math.round(elapsed),
    baselineRssMb: Math.round(baselineRss / 2 ** 20),
    peakRssMb: Math.round(peakRss / 2 ** 20),
  })}\n`,
);
