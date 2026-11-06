const recent = new Map();

function cleanText(value, fallback, maximum) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maximum);
  return text || fallback;
}

function cleanContext(value, depth = 0) {
  if (depth > 2 || value === null || value === undefined) return undefined;
  if (typeof value === "string") return cleanText(value, "", 240);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value))
    return value.slice(0, 8).map((entry) => cleanContext(entry, depth + 1));
  if (typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 12)
      .map(([key, entry]) => [key.slice(0, 60), cleanContext(entry, depth + 1)])
      .filter(([, entry]) => entry !== undefined),
  );
}

export function reportClientLog({
  level = "warning",
  event,
  message,
  context,
}) {
  if (typeof window === "undefined") return;
  const entry = {
    level: level === "error" ? "error" : "warning",
    event: cleanText(event, "client.event", 120),
    message: cleanText(message, "Client event", 1000),
    context: cleanContext({
      path: window.location.pathname,
      ...context,
    }),
  };
  const signature = `${entry.level}:${entry.event}:${entry.message}`;
  const timestamp = Date.now();
  if ((recent.get(signature) || 0) > timestamp - 60_000) return;
  recent.set(signature, timestamp);
  const body = JSON.stringify(entry);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/logs",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    fetch("/api/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Logging must never alter the user-facing workflow.
  }
}
