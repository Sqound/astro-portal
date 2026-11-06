"use client";

import { useState } from "react";
import {
  loadProjects,
  openMultiNightRoute,
  useMultiNightRoute,
} from "./client.js";
import { say } from "./copy.js";
import { MultiNightCalendarView } from "./MultiNightCalendarView.js";
import { MultiNightDetail } from "./MultiNightDetail.js";
import { CreateDialog } from "./MultiNightDialogs.js";
import {
  MultiNightCard,
  MultiNightHeading,
  MultiNightNotice,
  useMultiNightData,
} from "./MultiNightParts.js";
import { MultiNightProgress } from "./MultiNightProgress.js";
import { multiNightHasBegun } from "./model.js";

// The multi-night side of the plans library ("Une nuit | Multi-nuits"): two
// sections, "En cours" (a night has passed or begun) and "À venir" (before the
// first night), each with its cards or its one-line empty message — "En cours"
// after "À venir" when it is empty and "À venir" is not —, "Nuits à venir" and
// "Nouveau plan multi-nuits"; and, from a card, the detail, the calendar and
// the progress of one. Registered at `planner.projects` as `LibraryView`.
//
// A visitor (no space) reads why a multi-night plan needs one, and how to
// sign in — a state with no dedicated drawing. Held back (signed in, without
// the capability), the core draws the tag in its switch (or, where nothing is
// sold, the neutral words above), and this view lists what the space already
// holds, in the same two sections.

function VisitorPanel({ host }) {
  const { locale } = host;
  return (
    <section
      className="multi-night-visitor"
      aria-labelledby="multi-night-visitor-title"
      data-multi-night-access="visitor"
    >
      <MultiNightHeading
        locale={locale}
        id="multi-night-in-progress"
        title={say(locale, "inProgress")}
      />
      <h3 id="multi-night-visitor-title">{say(locale, "visitorTitle")}</h3>
      <p>{say(locale, "visitorBody")}</p>
      <a className="btn-primary" href={host.signInHref}>
        {say(locale, "signIn")}
      </a>
    </section>
  );
}

export function MultiNightLibraryView({ host }) {
  const { locale } = host;
  const route = useMultiNightRoute();
  const data = useMultiNightData(host);
  // The page of a night leads
  // here (`?new=existing`) to create a multi-night plan "à partir de plans
  // déjà existants".
  const [creating, setCreating] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("new") === "existing"
      ? "existing"
      : false,
  );
  const stopCreating = () => {
    setCreating(false);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("new")) {
      url.searchParams.delete("new");
      window.history.replaceState({}, "", url);
    }
  };
  if (host.access === "visitor")
    return (
      <main className="planner-library multi-night-library">
        {host.kindSwitch}
        <VisitorPanel host={host} />
      </main>
    );
  const { store, views, seasons, targetOf } = data;
  const heldBack = host.access === "heldBack";
  const view = route.projectId
    ? views.find((entry) => entry.project.id === route.projectId) || null
    : null;
  if (route.screen !== "list" && store.status === "ready") {
    if (route.screen === "calendar")
      return (
        <MultiNightCalendarView
          host={host}
          data={data}
          projectId={route.projectId}
        />
      );
    if (!view)
      return (
        <main className="multi-night-screen">
          <p className="multi-night-help">{say(locale, "unavailable")}</p>
          <button
            className="btn-link"
            type="button"
            onClick={() => openMultiNightRoute({ screen: "list" })}
          >
            {say(locale, "back")}
          </button>
        </main>
      );
    const props = {
      host,
      view,
      season: seasons[view.project.id] ?? null,
      target: targetOf(view.project),
      data,
    };
    return route.screen === "progress" ? (
      <MultiNightProgress {...props} night={route.night} />
    ) : (
      <MultiNightDetail {...props} />
    );
  }
  const active = views.filter((entry) => entry.project.status === "active");
  const now = Date.now();
  const inProgress = active.filter((entry) => multiNightHasBegun(entry, now));
  const upcoming = active.filter((entry) => !multiNightHasBegun(entry, now));
  const ready = store.status === "ready";
  const cards = (entries) => (
    <div className="multi-night-cards">
      {entries.map((entry) => (
        <MultiNightCard
          key={entry.project.id}
          locale={locale}
          view={entry}
          season={seasons[entry.project.id] ?? null}
          onOpen={() =>
            openMultiNightRoute({
              screen: "detail",
              projectId: entry.project.id,
            })
          }
        />
      ))}
    </div>
  );
  const section = (id, title, entries, empty, extra = null) => (
    <section
      className="multi-night-section"
      aria-labelledby={id}
      data-section={id}
      key={id}
    >
      <MultiNightHeading locale={locale} id={id} title={title}>
        {extra}
      </MultiNightHeading>
      {entries.length ? (
        cards(entries)
      ) : (
        <p className="multi-night-empty-line">{empty}</p>
      )}
    </section>
  );
  const inProgressSection = section(
    "multi-night-in-progress",
    say(locale, "inProgress"),
    inProgress,
    say(locale, "noneInProgress"),
    !heldBack && active.length > 0 ? (
      <button
        className="btn-link"
        type="button"
        onClick={() => openMultiNightRoute({ screen: "calendar" })}
      >
        {say(locale, "calendarTitle")}
      </button>
    ) : null,
  );
  const upcomingSection = section(
    "multi-night-upcoming",
    say(locale, "upcoming"),
    upcoming,
    say(locale, "noneUpcoming"),
  );
  const inProgressFirst = inProgress.length > 0 || upcoming.length === 0;
  const list = (
    <section className="multi-night-list" data-multi-night-access={host.access}>
      <MultiNightNotice locale={locale} />
      {store.status === "loading" || store.status === "idle" ? (
        <p className="multi-night-help">{say(locale, "loading")}</p>
      ) : store.status === "error" ? (
        <p className="multi-night-help" role="alert">
          {say(locale, "loadFailed")}{" "}
          <button
            className="btn-link"
            type="button"
            onClick={() => loadProjects({ force: true })}
          >
            {say(locale, "retry")}
          </button>
        </p>
      ) : ready && inProgressFirst ? (
        [inProgressSection, upcomingSection]
      ) : (
        [upcomingSection, inProgressSection]
      )}
      {!heldBack && (
        <button
          className="btn-primary multi-night-new"
          type="button"
          onClick={() => setCreating(true)}
        >
          + {say(locale, "newPlan")}
        </button>
      )}
      {creating && !heldBack && (
        <CreateDialog
          host={host}
          onClose={stopCreating}
          initialStep={creating === "existing" ? "existing" : "choose"}
        />
      )}
    </section>
  );
  return heldBack ? (
    list
  ) : (
    <main className="planner-library multi-night-library">
      {host.kindSwitch}
      {list}
    </main>
  );
}
