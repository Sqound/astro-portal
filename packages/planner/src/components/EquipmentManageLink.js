"use client";

import { message } from "portal/i18n.js";

/**
 * "Gérer mon matériel": a permanent link at the end of the planner's stage 2 to
 * "Mon espace" → "Matériel", for a person signed in to a space — going to see
 * elsewhere, a link, on the right (rule 9) with a
 * small wrench (nothing full-width above it).
 */
export function EquipmentManageLink({ locale, href }) {
  return (
    <p className="planner-equipment-manage">
      <a className="btn-link planner-equipment-manage-link" href={href}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5.5a4.2 4.2 0 0 0-4.6 5.6L4.6 17a2.1 2.1 0 0 0 3 3l5.9-5.8A4.2 4.2 0 0 0 19 9.6L16.2 12.4 13.6 10.4 15.6 7.6z" />
        </svg>
        {message(locale, "plannerEquipmentManage")}
      </a>
    </p>
  );
}
