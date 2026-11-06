"use client";

import { useRouter } from "next/navigation";
import { WebDialog } from "../dialog/WebDialog.js";
import { message } from "portal/i18n.js";

/**
 * The dialog of the statistics of one target or of one instrument (`D3`, `D5`):
 * the shell of every web modal — the cross at the right, the body that scrolls,
 * nothing at the foot (read only) — whose address is the page's (`?statsTarget=` /
 * `?statsInstrument=`): the cross, Escape and the back button leave through
 * `closeHref`. At 390 px the shell is the sheet that rises from the bottom, as the
 * other modals of the portal.
 */
export function JournalStatisticsDialog({
  locale,
  title,
  subtitle = null,
  closeHref,
  testId,
  children,
}) {
  const router = useRouter();
  return (
    <WebDialog
      title={title}
      className="journal-statistics-dialog"
      bodyClassName="journal-statistics-dialog-body"
      closeLabel={message(locale, "infoClose")}
      onClose={() => router.push(closeHref, { scroll: false })}
      closeOnBackdrop
      focusTitle
    >
      <div data-testid={testId}>
        {subtitle ? (
          <p className="journal-statistics-subtitle">{subtitle}</p>
        ) : null}
        {children}
      </div>
    </WebDialog>
  );
}
