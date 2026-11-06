// The hourly weather strip scrolls horizontally once its cells stop
// fitting the available width — that can happen at any viewport width,
// not only under the CSS breakpoint that shrinks the mobile cell size. No
// scrollbar is shown, and a touch swipe already pans sideways on its own,
// but a plain mouse wheel only moves the page vertically by default. This
// decides whether a wheel event should be redirected into the track's own
// horizontal scroll instead.
export function horizontalWheelScrollDelta({
  scrollWidth,
  clientWidth,
  deltaX,
  deltaY,
}) {
  if (!(scrollWidth > clientWidth)) return null;
  if (Math.abs(deltaY) <= Math.abs(deltaX)) return null;
  return deltaY;
}

// How much lead time the observer has before the astronomical night
// actually starts decides how much to trust the forecast for it: a night
// more than four days out draws mostly on the model's own longer- range
// guess, so the confidence badge/note reads "Low" past 96 hours, "Medium"
// out to 96, and "High" inside the 36-hour window most numerical weather
// models are still confident in. `now` is a parameter (defaulting to the
// real clock) purely so this stays testable without mocking `Date.now`.
export function hourlyForecastConfidence(night, now = Date.now()) {
  const hours = (new Date(night.start).getTime() - now) / 3600000;
  return hours <= 36 ? "High" : hours <= 96 ? "Medium" : "Low";
}
