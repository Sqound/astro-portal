// The sticky bar of the planner: the titles of the section the person is in
// become sticky and stick right below the header. Its rule avoids a bar half
// hidden under the header, or missing over the blocks between stages:
//
// once the title of a numbered stage has passed the anchor line -- the bottom
// of what is stuck at the top of the page: the site header, and under it the
// plan tabs once they are stuck too -- there is always exactly one bar, whole,
// its top edge on that line, naming the last stage whose title has passed
// it. The blocks without a number that follow a stage (the forecast, the plan
// tabs, the eligibility summary) belong to that stage. Before the first title
// has passed, there is no bar.
//
// One bar per stage is rendered once, all of them in a single fixed container
// (`StageCrumbs` in PlannerPage.js, `.planner-stage-crumbs` in globals.css).
// This module reads where the titles are and sets, on that container alone,
// which bar shows (`data-step`), whether it shows (`data-visible`, faded in
// and out over 150 ms by CSS), and where the line is (its `top`). They are
// written only when they change, on the DOM node directly: the (very large)
// planner component never renders for it.
//
// The bar used to be a sticky wrapper inside each stage: it came down as the
// stage's heading left, and the end of the stage pushed it away -- both
// through intermediate positions a scroll can stop on -- and there was no bar
// at all between two stages.
//
// A click on the bar scrolls the page to the start of its stage, smoothly, and
// does nothing else (`scrollToStageTitle`, below). It used to fold or unfold
// the stage too; it made the page move around for no
// visible reason, and it was not clear what happened. The fold stays on the
// stage's own heading.

const CRUMBS_SELECTOR = ".planner-stage-crumbs";
const TITLE_SELECTOR = "[data-stage-crumb-step]";
const HEADER_SELECTOR = ".portal-header";
const TABS_SELECTOR = ".planner-night-tabs-row";
// The element whose width the bar takes: the first stage, as wide as every
// stage of the page.
const WIDTH_SELECTOR = ".planner-flow > .planner-flow-stage";
const FLOW_SELECTOR = ".planner-flow";

// A hundredth of a pixel: a title that close to the line is on it.
const SUB_PIXEL = 0.01;
// A stuck sticky element sits on its offset, to within the browser's layout
// unit (a 64th of a pixel).
const STUCK_TOLERANCE = 0.05;

const finite = (value) => typeof value === "number" && Number.isFinite(value);

// The bar's height when the page does not say (3 rem at the default size).
export const DEFAULT_CRUMB_HEIGHT = 48;

// The anchor line, in px from the top of the viewport: the bottom of the site
// header, or of the plan tabs once they are stuck under it -- or as soon as
// they come up into the bar's band, [crumbHeight] under the header: nothing
// ever slides under the bar (the tabs used to
// pass under it on their way up). [tabs] is the tabs row's rectangle and
// sticky offset, or null on a page without it.
export function crumbLine({
  headerBottom,
  tabs,
  crumbHeight = DEFAULT_CRUMB_HEIGHT,
}) {
  const header = finite(headerBottom) ? Math.max(0, headerBottom) : 0;
  if (
    !tabs ||
    !finite(tabs.top) ||
    !finite(tabs.bottom) ||
    !finite(tabs.stickyTop)
  )
    return header;
  const stuck = tabs.top <= tabs.stickyTop + STUCK_TOLERANCE;
  const band = finite(crumbHeight) ? Math.max(0, crumbHeight) : 0;
  const inBand = tabs.top < header + band && tabs.bottom > header;
  return stuck || inBand ? Math.max(header, tabs.bottom) : header;
}

// The stage the bar names: the last one, in the page's order, whose title's
// top edge is on or above the line; null while none is.
export function currentCrumbStep({ titles, line }) {
  let step = null;
  for (const title of titles)
    if (finite(title.top) && title.top <= line + SUB_PIXEL) step = title.step;
  return step;
}

// Everything the bar needs from one measure of the page.
export function stageCrumbState({ headerBottom, tabs, titles, crumbHeight }) {
  const line = crumbLine({ headerBottom, tabs, crumbHeight });
  return { line, step: currentCrumbStep({ titles, line }) };
}

// The line under the stuck plan tabs, in px from the top of the viewport:
// what the stylesheet reserves above the bar for everything else that sticks
// (the timeline's column beside the stages) and for the jumps inside the
// page (`--planner-stuck-line` on `.planner-flow`); null without the tabs.
export function stuckLine({ stickyTop, tabsHeight }) {
  if (!finite(stickyTop) || !finite(tabsHeight)) return null;
  return Math.max(0, stickyTop) + Math.max(0, tabsHeight);
}

// A CSS length in px: `48px`, `3rem` (of [rootFontSize]); NaN otherwise.
export function cssLengthPx(value, rootFontSize = 16) {
  const text = String(value ?? "").trim();
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return Number.NaN;
  if (text.endsWith("rem")) return number * rootFontSize;
  if (text.endsWith("px")) return number;
  return Number.NaN;
}

// The scroll offset that puts a stage's title exactly on the line, where the
// bar takes over from it -- and still names the stage: where a click on the
// bar takes the page. A title after the plan tabs is read with the tabs stuck
// above it; the first stage's title, above the tabs, under the site header
// alone.
export function crumbTitleLanding({
  scrollY,
  titleTop,
  headerBottom,
  tabs,
  titleAfterTabs,
}) {
  const header = finite(headerBottom) ? Math.max(0, headerBottom) : 0;
  const line =
    titleAfterTabs && tabs && finite(tabs.stickyTop) && finite(tabs.height)
      ? Math.max(header, tabs.stickyTop + tabs.height)
      : header;
  return Math.max(0, scrollY + titleTop - line);
}

const stickyTopOf = (environment, element) => {
  if (!element || typeof environment.getComputedStyle !== "function")
    return Number.NaN;
  return Number.parseFloat(environment.getComputedStyle(element).top);
};

// The bar's height, from the stylesheet's `--planner-crumb-height`.
const crumbHeightOf = (environment, element) => {
  if (!element || typeof environment.getComputedStyle !== "function")
    return DEFAULT_CRUMB_HEIGHT;
  const value = environment
    .getComputedStyle(element)
    .getPropertyValue?.("--planner-crumb-height");
  const root = environment.document?.documentElement;
  const rootFontSize = root
    ? Number.parseFloat(environment.getComputedStyle(root).fontSize)
    : Number.NaN;
  const height = cssLengthPx(
    value,
    Number.isFinite(rootFontSize) ? rootFontSize : 16,
  );
  return Number.isFinite(height) && height > 0 ? height : DEFAULT_CRUMB_HEIGHT;
};

// Starts following the page's scroll. Returns the function that stops it.
// [environment] is `globalThis` in the browser (the window: its document,
// its events, its scroll); the tests hand in a stand-in.
export function observeStageCrumbs(environment = globalThis) {
  const { document, ResizeObserver } = environment;
  if (
    !document ||
    typeof document.querySelector !== "function" ||
    typeof environment.addEventListener !== "function"
  )
    return () => {};
  // What was last written, and on which container, so that nothing is
  // written again unchanged.
  const written = new Map();
  let node = null;
  const write = (name, value, set) => {
    if (written.get(name) === value) return;
    written.set(name, value);
    set(value);
  };
  let tabsStickyTop = Number.NaN;
  let tabsNode = null;
  let resize = null;
  let crumbHeight = DEFAULT_CRUMB_HEIGHT;
  let lastStep = null;

  const update = () => {
    const crumbs = document.querySelector(CRUMBS_SELECTOR);
    if (!crumbs) return;
    if (crumbs !== node) {
      // A new container (React mounted the page again): write everything.
      written.clear();
      node = crumbs;
    }
    const tabs = document.querySelector(TABS_SELECTOR);
    // The plan tabs can arrive after the observer started (the planner
    // loads, a plan is added): their sticky offset is read when they do, and
    // they are watched for their size from then on.
    if (tabs && tabs !== tabsNode) {
      tabsNode = tabs;
      tabsStickyTop = stickyTopOf(environment, tabs);
      resize?.observe(tabs);
    }
    const tabsRect = tabs?.getBoundingClientRect();
    const { line, step } = stageCrumbState({
      headerBottom: document
        .querySelector(HEADER_SELECTOR)
        ?.getBoundingClientRect().bottom,
      tabs: tabsRect
        ? {
            top: tabsRect.top,
            bottom: tabsRect.bottom,
            stickyTop: tabsStickyTop,
          }
        : null,
      crumbHeight,
      titles: [...document.querySelectorAll(TITLE_SELECTOR)].map((title) => ({
        step: Number(title.getAttribute("data-stage-crumb-step")),
        top: title.getBoundingClientRect().top,
      })),
    });
    // What sticks beside the stages and the jumps inside the page keep
    // clear of the stuck tabs and of the bar under them.
    const flow = document.querySelector(FLOW_SELECTOR);
    const stuck = stuckLine({
      stickyTop: tabsStickyTop,
      tabsHeight: tabsRect?.height,
    });
    write("stuckLine", stuck === null ? "" : `${stuck}px`, (value) => {
      if (value) flow?.style?.setProperty?.("--planner-stuck-line", value);
      else flow?.style?.removeProperty?.("--planner-stuck-line");
    });
    const reference = document
      .querySelector(WIDTH_SELECTOR)
      ?.getBoundingClientRect();
    if (step !== null) lastStep = step;
    write("top", `${line}px`, (value) => {
      crumbs.style.top = value;
      // The line the bar is on, for what sticks under it (the timeline's
      // column beside the stages): it follows the bar, even while the plan
      // tabs come up to stick.
      flow?.style?.setProperty?.("--planner-crumb-line", value);
    });
    if (reference) {
      write("left", `${reference.left}px`, (value) => {
        crumbs.style.left = value;
      });
      write("width", `${reference.width}px`, (value) => {
        crumbs.style.width = value;
      });
    }
    // While it fades out, the bar keeps naming the stage it named last.
    write("step", lastStep === null ? "" : String(lastStep), (value) =>
      crumbs.setAttribute("data-step", value),
    );
    write("visible", step === null ? "false" : "true", (value) =>
      crumbs.setAttribute("data-visible", value),
    );
  };

  const remeasure = () => {
    const tabs = document.querySelector(TABS_SELECTOR);
    tabsStickyTop = stickyTopOf(environment, tabs);
    crumbHeight = crumbHeightOf(
      environment,
      document.querySelector(FLOW_SELECTOR),
    );
    update();
  };
  remeasure();
  // A scroll event comes once per frame, before the frame is drawn: the bar
  // is set for the very frame the page moved in.
  environment.addEventListener("scroll", update, { passive: true });
  environment.addEventListener("resize", remeasure);
  // The headers change height with the window and the text size; the page
  // grows and shrinks as stages fold and lists fill.
  resize =
    typeof ResizeObserver === "function" ? new ResizeObserver(remeasure) : null;
  for (const selector of [HEADER_SELECTOR, TABS_SELECTOR, ".planner-flow"]) {
    const element = document.querySelector(selector);
    if (resize && element) resize.observe(element);
  }
  return () => {
    environment.removeEventListener?.("scroll", update);
    environment.removeEventListener?.("resize", remeasure);
    resize?.disconnect();
  };
}

// How long the page takes to reach the start of a stage, in milliseconds: 250
// for a hop of a few pixels, growing with the distance up to 450 from 2000 px
// on -- never a blink, never a wait.
export const CRUMB_SCROLL_MIN_MS = 250;
export const CRUMB_SCROLL_MAX_MS = 450;
export const CRUMB_SCROLL_LONG_DISTANCE = 2000;

export function crumbScrollDuration(distance) {
  const share = finite(distance)
    ? Math.min(1, Math.abs(distance) / CRUMB_SCROLL_LONG_DISTANCE)
    : 0;
  return Math.round(
    CRUMB_SCROLL_MIN_MS + (CRUMB_SCROLL_MAX_MS - CRUMB_SCROLL_MIN_MS) * share,
  );
}

// Slow, quick, slow (an "ease in out cubic"): the page leaves its place
// gently and comes to rest on the title without a jolt. [progress] runs from
// 0 to 1, and so does the result.
export function crumbScrollEase(progress) {
  const t = Math.min(1, Math.max(0, progress));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// Rounds a scroll offset up to a whole device pixel. A browser puts the page
// on a device pixel whatever it is asked for, and a title left a fraction of a
// pixel *under* the line would not have reached it: the bar would still name
// the stage before. Landing up to a device pixel *past* the line is on it.
export function crumbOnDevicePixel(top, ratio = 1) {
  const scale = finite(ratio) && ratio > 0 ? ratio : 1;
  return Math.ceil(top * scale - SUB_PIXEL) / scale;
}

// Where [step]'s title is, as a scroll offset that puts it on the line; null
// when the stage has no title on the page.
export function stageTitleLanding(step, environment = globalThis) {
  const { document } = environment;
  const title = document?.querySelector?.(`[data-stage-crumb-step="${step}"]`);
  if (!title) return null;
  const tabs = document.querySelector(TABS_SELECTOR);
  const tabsRect = tabs?.getBoundingClientRect();
  const following = 4; // Node.DOCUMENT_POSITION_FOLLOWING
  const top = crumbTitleLanding({
    scrollY: environment.scrollY,
    titleTop: title.getBoundingClientRect().top,
    headerBottom: document
      .querySelector(HEADER_SELECTOR)
      ?.getBoundingClientRect().bottom,
    tabs: tabsRect
      ? {
          stickyTop: stickyTopOf(environment, tabs),
          height: tabsRect.height,
        }
      : null,
    titleAfterTabs: Boolean(
      tabs && tabs.compareDocumentPosition(title) & following,
    ),
  });
  return crumbOnDevicePixel(top, environment.devicePixelRatio);
}

// The scroll to a stage's start that is under way, if one is: which stage it
// is heading for, and how to stop it.
let travel = null;

// What the reader does that takes the page out of the animation's hands.
const TAKEOVER_EVENTS = ["wheel", "touchmove", "keydown", "pointerdown"];

// Scrolls the page to the start of [step]'s stage -- its title on the line
// under the sticky headers, where the bar takes over from it -- and does
// nothing else: no stage is folded or unfolded, whatever its state. Smoothly,
// over [crumbScrollDuration] along [crumbScrollEase]; at once when the reader
// asks for reduced motion.
//
// A second click for the same stage while the page is on its way changes
// nothing: it neither restarts the motion nor makes it stutter. The reader
// taking the page (wheel, touch, keys, a press anywhere but on the bar) ends
// the motion where it stands. The line is measured again at every frame, so
// the page comes to rest on the title even if the page above it changed size
// on the way.
export function scrollToStageTitle(step, environment = globalThis) {
  if (typeof environment.scrollTo !== "function") return;
  if (travel && travel.step === step && travel.environment === environment)
    return;
  const landing = stageTitleLanding(step, environment);
  if (landing === null) return;
  const from = environment.scrollY;
  const distance = Math.abs(landing - from);
  if (!(distance > SUB_PIXEL)) return;
  travel?.stop();
  const scrollTop = (top) =>
    environment.scrollTo({
      top,
      left: environment.scrollX,
      behavior: "instant",
    });
  const reduced =
    environment.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ===
    true;
  if (
    reduced ||
    typeof environment.requestAnimationFrame !== "function" ||
    typeof environment.addEventListener !== "function"
  ) {
    scrollTop(landing);
    return;
  }
  const duration = crumbScrollDuration(distance);
  let frame = null;
  let began = null;
  const current = { step, environment, stop: () => {} };
  const stop = () => {
    if (
      frame !== null &&
      typeof environment.cancelAnimationFrame === "function"
    )
      environment.cancelAnimationFrame(frame);
    frame = null;
    for (const type of TAKEOVER_EVENTS)
      environment.removeEventListener?.(type, takeOver);
    if (travel === current) travel = null;
  };
  current.stop = stop;
  function takeOver(event) {
    // A press on the bar itself is the reader asking again, not taking over.
    if (event?.target?.closest?.(CRUMBS_SELECTOR)) return;
    stop();
  }
  const tick = (now) => {
    if (began === null) began = now;
    const progress = Math.min(1, (now - began) / duration);
    const target = stageTitleLanding(step, environment) ?? landing;
    scrollTop(
      progress >= 1
        ? target
        : from + (target - from) * crumbScrollEase(progress),
    );
    if (progress < 1) frame = environment.requestAnimationFrame(tick);
    else stop();
  };
  travel = current;
  for (const type of TAKEOVER_EVENTS)
    environment.addEventListener(type, takeOver, { passive: true });
  frame = environment.requestAnimationFrame(tick);
}
