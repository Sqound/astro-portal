"use client";

import { useEffect, useState } from "react";
import { message } from "portal/i18n.js";
import { getPlannerExtensions } from "portal/planner/extensions.js";
import { SessionDetailPage } from "portal/components/sessions/SessionDetailPage.js";
import { takeNightFraming } from "../night-framing-client.js";
import { NightTargetsPicker } from "./NightTargetsPicker.js";
// The multi-night plans, the open core's.
import "../projects/components/register.js";

// The page of a night with the planner's search in its "Cibles" row: `portal` draws the page and does not
// import the planner, so the shell that does is here, as `PlannerSurface` is
// the planner's. It also says, once, what a framing made for the night did
// ("Créer un cadrage sur la carte…" of the row leads to the planner's
// framing editor and comes back here). And, where a shell registered the
// multi-night plans (`planner.projects`, every shell), the row
// "Plan multi-nuits" of its card "La nuit": `portal` does not know them either.
export function NightSessionSurface(props) {
  const { locale = "en", sessionId, capabilities = null } = props;
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    const note = takeNightFraming(sessionId);
    if (!note) return;
    const key = note.failed
      ? "nightPageFramingNotSaved"
      : note.target
        ? "nightPageFramingAdded"
        : "nightPageFramingNoTarget";
    setNotice(
      message(locale, key)
        .replace("{name}", note.name)
        .replace("{target}", note.target ?? ""),
    );
  }, [locale, sessionId]);
  const projects = getPlannerExtensions("planner.projects")[0] || null;
  const page = ({ row = null, status = null } = {}) => (
    <SessionDetailPage
      {...props}
      TargetsPicker={NightTargetsPicker}
      fieldsNotice={notice}
      planRow={row}
      planStatus={status}
    />
  );
  const Slot = projects?.NightPlanSlot;
  if (!Slot) return page();
  return (
    <Slot
      locale={locale}
      sessionId={sessionId}
      startedAt={props.session?.startedAt ?? null}
      planDate={props.plan?.date ?? null}
      targetIds={props.nightData?.night?.targetIds?.value ?? []}
      targetNames={props.targetNames ?? {}}
      capabilities={capabilities}
    >
      {page}
    </Slot>
  );
}
