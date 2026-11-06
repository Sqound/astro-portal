import { message } from "portal/i18n.js";

/**
 * « Détecté par Astro Sync »: a state pastille, never a button,
 * beside what Astro Sync found or wrote (the service says so in
 * `source`).
 */
export function DetectedMention({ locale }) {
  return (
    <span className="session-report-detected" data-testid="report-detected">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
      {message(locale, "sessionReportDetected")}
    </span>
  );
}
