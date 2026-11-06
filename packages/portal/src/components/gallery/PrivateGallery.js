import { capturesCopyFor } from "../manage/captures-copy.js";
import { privateGalleryCopyFor } from "./private-gallery-copy.js";
import { PrivateGalleryGrid } from "./PrivateGalleryGrid.js";
import { EmptyState } from "../empty/EmptyState.js";
import { Icon } from "./gallery-icons.js";
import { galleryPath } from "../../private-gallery/gallery-paths.js";
import { privateCaptureAsPublic } from "../../private-gallery/public-shape.js";

export {
  galleryMediaPath,
  galleryPath,
  itemMonth,
  itemTitle,
} from "../../private-gallery/gallery-paths.js";

/**
 * The private gallery as its viewer sees it (`PrivatePortalCapture`,
 * `PrivatePortalGate`): drawn on the server from what
 * `portal/private-gallery/private-gallery.js` answers, never more. The title is
 * the gallery's name (« Galerie privée » when it has none), « par » and the
 * owner's public name when there is one; every capture, private and public
 * mixed, without a mark of visibility, with its target's designation (or its
 * file name) and its month; one capture with its detail for a visitor — never
 * the place. The images are the files without metadata the media route serves
 * (the thumbnail in the grid, the shared copy opened), a neutral placeholder
 * where a capture has none yet.
 *
 * « Signaler » is drawn under a capture's detail where the gate says
 * `canReport`: any visitor of a gallery « accessible à tous »; never the
 * owner.
 */

const QuestionIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4" />
    <path d="M12 16.8h.01" />
  </Icon>
);
function GalleryHeader({ copy, portalName, publicName }) {
  return (
    <header className="account-header private-gallery-header">
      <h1>{portalName || copy.defaultTitle}</h1>
      {publicName ? (
        <p className="private-gallery-signature">{copy.by(publicName)}</p>
      ) : null}
    </header>
  );
}

/**
 * `PrivatePortal`. `arrival` is what the composition says above the gallery
 * at the first visit of a person whose space it created for the visit (a
 * node drawn as it is: `view.arrival === "created"` says it is time).
 */
export function PrivateGalleryView({
  locale = "en",
  token,
  view,
  arrival = null,
}) {
  const copy = privateGalleryCopyFor(locale);
  const captures = view.captures ?? [];
  return (
    <main
      className={`account-page private-gallery-page${captures.length ? " has-list" : ""}`}
    >
      {view.arrival === "created" ? arrival : null}
      <GalleryHeader
        copy={copy}
        portalName={view.portalName}
        publicName={view.publicName}
      />
      {captures.length ? (
        <PrivateGalleryGrid locale={locale} token={token} view={view} />
      ) : (
        <EmptyState className="gallery-empty" sentence={copy.empty} />
      )}
    </main>
  );
}

/**
 * `PrivatePortalCapture`: one capture, never the place — and the page of the
 * public gallery's capture (`PublicCapturePage`), the reference, fed with this
 * capture in its shape (`private-gallery/ public-shape.js`): the props the
 * private route gives it. `knowledge` is what the public page tells of the
 * target (« À propos de la cible »), read on the server as for the public page.
 * The ✕ leads back to the gallery, « Signaler » goes through the gallery's gate
 * (`canReport`), and a capture without a target is named by its file, as the
 * gallery's list does.
 */
export function privateCapturePageProps({
  locale = "en",
  token,
  view,
  knowledge = null,
}) {
  const copy = privateGalleryCopyFor(locale);
  const { capture } = view;
  return {
    capture: privateCaptureAsPublic({ token, view }),
    knowledge,
    noTarget: capture.fileName || capturesCopyFor(locale).noTarget,
    locale,
    reportable: Boolean(view.canReport),
    backHref: galleryPath(locale, token),
    galleryLabel: view.portalName || copy.defaultTitle,
  };
}

/**
 * The gate of `PrivatePortalGate` a private server has: `not_found` (unknown
 * or replaced address, or shared with nobody — one page, which does not say
 * which).
 */
export function PrivateGalleryGate({ locale = "en" }) {
  const copy = privateGalleryCopyFor(locale);
  return (
    <main className="account-page private-gallery-page">
      <section
        className="account-panel private-gallery-gate"
        aria-labelledby="private-gallery-gate-title"
        data-gate="not_found"
      >
        <QuestionIcon size={30} className="private-gallery-gate-icon" />
        <h1 id="private-gallery-gate-title">{copy.notFoundTitle}</h1>
      </section>
    </main>
  );
}
