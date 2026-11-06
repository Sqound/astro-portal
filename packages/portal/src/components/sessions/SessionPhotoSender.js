"use client";

import { CaptureAddDialog } from "../manage/CaptureAddDialog.js";
import { uploadRefusalWords } from "../manage/CapturesTab.js";
import { capturesCopyFor } from "../manage/captures-copy.js";
import { csrfToken } from "./portal-fetch.js";

// The send button's dialog: the existing add box of « Mon espace › Captures »,
// opened at its step « Quelle image ? » with the session and the target of the
// card already known — the image becomes the capture of that session and
// target (one per session and target; the service replaces or keeps a variant,
// and answers which: `onSent` hands it back so the card says it).

export function SessionPhotoSender({
  locale = "en",
  night,
  card,
  onClose,
  onSent,
}) {
  const copy = capturesCopyFor(locale);
  return (
    <CaptureAddDialog
      copy={copy}
      locale={locale}
      nights={night ? [night] : []}
      fetcher={(...args) => fetch(...args)}
      csrf={csrfToken}
      refusalWords={(outcome, file) => uploadRefusalWords(outcome, copy, file)}
      onClose={onClose}
      onAdded={(outcome) => onSent(outcome)}
      initial={{
        night,
        target: {
          id: card.key,
          designation: card.label,
          name: null,
          outcome: card.outcome ?? null,
          integrationMinutes: null,
          captureCount: card.capture ? 1 : 0,
        },
      }}
    />
  );
}
