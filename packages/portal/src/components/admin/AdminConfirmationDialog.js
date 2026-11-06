"use client";
import { WebConfirmDialog } from "../dialog/WebDialog.js";

// The shared web confirmation (`WebConfirmDialog`): cross at the top right,
// Annuler + the action at the bottom, focus on Annuler first and handed
// back to the button that asked on close. Its buttons are the shared ones:
// Annuler is a link and the action is the primary in the destructive tint
//.
export function AdminConfirmationDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}) {
  return (
    <WebConfirmDialog
      cancelLabel="Annuler"
      className="admin-confirmation"
      closeLabel="Fermer"
      confirmLabel={confirmLabel}
      description={message}
      eyebrow="CONFIRMATION"
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={title}
    />
  );
}
