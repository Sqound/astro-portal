"use client";

import { useEffect, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { LoadingState } from "portal/components/LoadingState.js";
import { taxonomyLabel } from "astro-core/catalog-taxonomy.js";
import { formatDuration } from "portal/format.js";
import { PersonalSkyMap } from "./PersonalSkyMap.js";
import { localizedTag } from "./gallery-tags.js";
import {
  GalleryCaptureCard,
  GalleryFilterSummary,
  GalleryGrid,
  GalleryTools,
  mapTargetOf,
} from "./GalleryList.js";
import { EmptyState } from "../empty/EmptyState.js";
import { capturesCopyFor } from "../manage/captures-copy.js";
import {
  GALLERY_BATCH_SIZE,
  createGalleryState,
  galleryDisplay,
  galleryImportHref,
  galleryListPath,
  gallerySourceOf,
  latestFinishedNightId,
  publicCaptureHref,
  publicGalleryEmptyHref,
  galleryViewFromRoute,
  galleryRestoreTargetCount,
  galleryStateStorageKey,
  initialGalleryLoadLimit,
  parseGalleryState,
} from "portal/gallery-state.js";

const formatDate = (value, locale) => {
  const match = String(value || "").match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  return match
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])))
    : message(locale, "dateUnknown");
};
function tagsFor(target) {
  return target.tags || [];
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20V9M7 13l5-5 5 5M5 4h14" />
    </svg>
  );
}

function storedGalleryState(locale) {
  if (typeof window === "undefined") return null;
  try {
    const stored = parseGalleryState(
      sessionStorage.getItem(galleryStateStorageKey(locale)),
      locale,
    );
    if (stored) return stored;

    // Support a return to the gallery from a detail view that was opened just
    // before this version was deployed.
    const legacyScrollY = sessionStorage.getItem(
      "astro-portal:gallery-scroll-y",
    );
    if (!Number.isFinite(Number(legacyScrollY))) return null;
    return createGalleryState({
      locale,
      query: "",
      tag: "",
      newestFirst: true,
      scrollY: Number(legacyScrollY),
      loadedCount: GALLERY_BATCH_SIZE,
    });
  } catch {
    return null;
  }
}

export function GalleryPage({
  locale = "en",
  initialView = "gallery",
  // `captures` (the public captures of every space,
  // `ASTRO_PORTAL_GALLERY_SOURCE`'s default) or `files` (the operator's
  // file gallery, unchanged).
  source = "files",
}) {
  const fromCaptures = gallerySourceOf(source) === "captures";
  const noTarget = capturesCopyFor(locale).noTarget;
  const restoreRef = useRef(storedGalleryState(locale));
  const [restore, setRestore] = useState(restoreRef.current);
  const [targets, setTargets] = useState([]);
  const [total, setTotal] = useState(0);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [tags, setTags] = useState([]);
  const [query, setQuery] = useState(restoreRef.current?.query || "");
  const [tag, setTag] = useState(restoreRef.current?.tag || "");
  const [newestFirst, setNewestFirst] = useState(
    restoreRef.current?.newestFirst !== false,
  );
  const [view, setView] = useState(() => galleryViewFromRoute(initialView));
  const [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(true);
  // A read that failed is an error, never an empty gallery.
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [lastNightId, setLastNightId] = useState(null);
  // Who reads the empty public gallery: « Publier une capture » for a
  // signed-in person, « Créer mon espace » for a visitor.
  const [authentication, setAuthentication] = useState(null);
  const sentinel = useRef(null);
  const loadingRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    setView(galleryViewFromRoute(initialView));
  }, [initialView]);

  useEffect(() => {
    const sync = () =>
      setView(
        galleryViewFromRoute(
          new URL(window.location.href).searchParams.get("view"),
        ),
      );
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);

  const load = async ({
    offset = 0,
    append = false,
    limit = GALLERY_BATCH_SIZE,
    generation = generationRef.current,
    isFilterLoad = false,
  } = {}) => {
    if (append && loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    if (isFilterLoad) setFilterLoading(true);
    try {
      const params = new URLSearchParams({
        locale,
        offset: String(offset),
        limit: String(limit),
        query,
        ...(tag ? { tag } : {}),
        ...(newestFirst ? {} : { order: "oldest" }),
        ...(view === "map" ? { all: "1" } : {}),
        summary: "1",
      });
      const response = await fetch(`${galleryListPath(source)}?${params}`);
      if (!response.ok) throw new Error(`catalog ${response.status}`);
      const data = await response.json();
      if (generation === generationRef.current) {
        const page = (fromCaptures ? data.captures : data.targets) || [];
        setLoadError(false);
        setTargets((current) => (append ? [...current, ...page] : page));
        setTags(data.tags || []);
        setTotal(data.total || 0);
        setCatalogTotal(
          fromCaptures
            ? data.publicTotal || 0
            : data.catalogTotal || data.total || 0,
        );
        setNextOffset(data.nextOffset);
      }
    } catch {
      // A page of an endless list that fails keeps the list as it is; the
      // first read of a view that fails says so (and offers « Réessayer »).
      if (generation === generationRef.current && !append) setLoadError(true);
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false;
        setLoading(false);
        if (isFilterLoad) setFilterLoading(false);
      }
    }
  };

  useEffect(() => {
    const generation = ++generationRef.current;
    setFilterLoading(true);
    const timer = setTimeout(
      () => {
        load({
          generation,
          limit: initialGalleryLoadLimit(restoreRef.current),
          isFilterLoad: true,
        });
      },
      query ? 180 : 0,
    );
    return () => clearTimeout(timer);
  }, [locale, query, tag, newestFirst, view, reloadToken]);

  const display = galleryDisplay({
    loading,
    filterLoading,
    loadError,
    total,
    catalogTotal,
    query,
    tag,
  });

  // « Importer une première image » leads to the most recent finished
  // night. Read only when the gallery is empty; unreadable or none, the
  // button leads to the journal.
  useEffect(() => {
    if (display !== "empty" || !fromCaptures) return undefined;
    let active = true;
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then((status) => active && setAuthentication(status))
      .catch(() => active && setAuthentication({ authenticated: false }));
    return () => {
      active = false;
    };
  }, [display, fromCaptures]);

  useEffect(() => {
    if (display !== "empty" || fromCaptures) return;
    let cancelled = false;
    (async () => {
      let since = null;
      const sessions = [];
      for (let page = 0; page < 5; page += 1) {
        const response = await fetch(
          `/api/v1/sessions?limit=200${since ? `&since=${encodeURIComponent(since)}` : ""}`,
        );
        if (!response.ok) return;
        const body = await response.json();
        sessions.push(...(body.sessions || []));
        if (!body.hasMore || !body.nextSince) break;
        since = body.nextSince;
      }
      if (!cancelled) setLastNightId(latestFinishedNightId(sessions));
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [display]);

  const restoredCount = galleryRestoreTargetCount(restore, total);
  const needsMoreForRestore =
    restore && targets.length < restoredCount && nextOffset !== null;

  useEffect(() => {
    if (!needsMoreForRestore || loadingRef.current) return;
    load({
      offset: nextOffset,
      append: true,
      limit: Math.min(GALLERY_BATCH_SIZE, restoredCount - targets.length),
      generation: generationRef.current,
    });
  }, [needsMoreForRestore, nextOffset, restoredCount, targets.length]);

  useEffect(() => {
    const element = sentinel.current;
    if (
      !element ||
      view === "map" ||
      nextOffset === null ||
      needsMoreForRestore
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        entry.isIntersecting &&
        load({
          offset: nextOffset,
          append: true,
          generation: generationRef.current,
        }),
      { rootMargin: "480px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nextOffset, locale, query, tag, newestFirst, needsMoreForRestore, view]);
  useEffect(() => {
    if (
      !restore ||
      !targets.length ||
      loading ||
      targets.length < restoredCount
    )
      return;
    let cancelled = false;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        window.scrollTo(0, restore.scrollY);
        try {
          sessionStorage.removeItem(galleryStateStorageKey(locale));
          sessionStorage.removeItem("astro-portal:gallery-scroll-y");
        } catch {
          // Storage can be unavailable in a private browsing context.
        }
        restoreRef.current = null;
        setRestore(null);
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [locale, loading, restore, restoredCount, targets.length]);

  const cancelRestore = () => {
    if (!restoreRef.current) return;
    try {
      sessionStorage.removeItem(galleryStateStorageKey(locale));
      sessionStorage.removeItem("astro-portal:gallery-scroll-y");
    } catch {
      // Storage can be unavailable in a private browsing context.
    }
    restoreRef.current = null;
    setRestore(null);
  };

  const saveGalleryState = (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    try {
      sessionStorage.setItem(
        galleryStateStorageKey(locale),
        JSON.stringify(
          createGalleryState({
            locale,
            query,
            tag,
            newestFirst,
            scrollY: window.scrollY,
            loadedCount: targets.length,
          }),
        ),
      );
    } catch {
      // The gallery remains usable when session storage is unavailable.
    }
  };

  const selectView = (nextView) => {
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    history.pushState({}, "", url);
  };

  return (
    <>
      <h1 className="visually-hidden">{message(locale, "galleryTitle")}</h1>
      <div className="page-navigation gallery-page-navigation">
        <GalleryTools
          locale={locale}
          filters={tags.map((candidate) => ({
            value: candidate,
            label: localizedTag(candidate, locale),
          }))}
          activeFilter={tag}
          onFilter={(candidate) => {
            cancelRestore();
            setTag(candidate);
          }}
          query={query}
          onQuery={(value) => {
            cancelRestore();
            setQuery(value);
          }}
          newestFirst={newestFirst}
          onSort={() => {
            cancelRestore();
            setNewestFirst((value) => !value);
          }}
          view={view}
          onView={selectView}
        />
        <GalleryFilterSummary
          locale={locale}
          updating={filterLoading && !loadError}
          count={display === "results" ? total : null}
          total={catalogTotal}
          noun={message(locale, fromCaptures ? "publicCaptures" : "targets")}
        />
      </div>
      <main>
        {display === "error" ? (
          <div
            className="gallery-error"
            role="alert"
            data-testid="gallery-error"
          >
            <p>{message(locale, "galleryLoadFailed")}</p>
            <button
              type="button"
              className="btn-secondary"
              data-testid="gallery-retry"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              {message(locale, "galleryRetry")}
            </button>
          </div>
        ) : display === "empty" && fromCaptures ? (
          <EmptyState
            className="gallery-empty"
            sentence={message(locale, "publicGalleryEmptySentence")}
            actionLabel={message(
              locale,
              authentication?.authenticated
                ? "publicGalleryPublishCapture"
                : "publicGalleryCreateSpace",
            )}
            actionIcon={authentication?.authenticated ? <UploadIcon /> : null}
            actionHref={publicGalleryEmptyHref(locale, {
              signedIn: Boolean(authentication?.authenticated),
              authentication,
            })}
            actionTestId="gallery-empty-action"
          />
        ) : display === "empty" ? (
          <EmptyState
            className="gallery-empty"
            sentence={message(locale, "galleryEmptySentence")}
            detail={message(locale, "galleryEmptyDetail")}
            actionLabel={message(locale, "galleryEmptyAction")}
            actionIcon={
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20V9M7 13l5-5 5 5M5 4h14" />
              </svg>
            }
            actionHref={galleryImportHref(locale, lastNightId)}
            actionTestId="gallery-empty-action"
          />
        ) : view === "map" ? (
          <PersonalSkyMap
            locale={locale}
            targets={
              fromCaptures
                ? targets.map((capture) =>
                    mapTargetOf(capture, {
                      href: publicCaptureHref(locale, capture.id),
                      noTarget,
                    }),
                  )
                : targets
            }
            onOpenTarget={saveGalleryState}
          />
        ) : (
          <GalleryGrid busy={filterLoading}>
            {fromCaptures &&
              targets.map((capture) => (
                <GalleryCaptureCard
                  key={capture.id}
                  capture={capture}
                  locale={locale}
                  noTarget={noTarget}
                  href={publicCaptureHref(locale, capture.id)}
                  onOpen={saveGalleryState}
                />
              ))}
            {!fromCaptures &&
              targets.map((target) => {
                const asset = target.featured || target.reference;
                const location =
                  target.latest?.location ||
                  target.location ||
                  target.acquisition?.Lieu ||
                  asset.acquisition?.Lieu;
                return (
                  <article className="card" key={target.id}>
                    <a
                      href={`/${locale}/image/${encodeURIComponent(target.id)}/${encodeURIComponent(asset.assetId)}`}
                      onClick={saveGalleryState}
                    >
                      <span className="card-image">
                        <img src={asset.imageUrl} alt="" loading="lazy" />
                        <span className="capture-count">
                          {target.captureCount}
                        </span>
                      </span>
                      <span className="card-copy">
                        <span className="card-kicker">
                          {[
                            taxonomyLabel(
                              target.categoryKey || target.category,
                              locale,
                            ),
                            target.equipment?.Télescope?.split(" - ")[0] ||
                              target.equipment?.Instrument,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <strong>{target.title}</strong>
                        <small>
                          {(target.localizedAliases?.length
                            ? target.localizedAliases
                            : target.objects
                          )?.join(" · ")}
                        </small>
                        <span className="card-meta">
                          {asset.integration}
                          {asset.totalSeconds
                            ? ` (${formatDuration(asset.totalSeconds, locale)})`
                            : ""}
                          <br />
                          {formatDate(
                            target.latest?.date || asset.date,
                            locale,
                          )}
                          {location ? ` · ${location}` : ""}
                        </span>
                        <span className="card-tags">
                          {tagsFor(target).map((item) => (
                            <span key={item}>{localizedTag(item, locale)}</span>
                          ))}
                        </span>
                      </span>
                    </a>
                  </article>
                );
              })}
            {loading && (
              <LoadingState
                className="gallery-loading"
                layout={targets.length ? "inline" : "block"}
              >
                {message(locale, "loading")}
              </LoadingState>
            )}
            <div
              className="gallery-sentinel"
              ref={sentinel}
              aria-hidden="true"
            />
          </GalleryGrid>
        )}
      </main>
    </>
  );
}
