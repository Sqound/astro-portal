import { PublicCapturePage } from "portal/components/detail/PublicCapturePage.js";
import { privateCapturePageProps } from "portal/components/gallery/PrivateGallery.js";
import { captureKnowledgeOf } from "../../../../../lib/capture-knowledge.server.js";
import { galleryTeam } from "../../../../../lib/service-extensions.js";
import {
  galleryRefusalPage,
  galleryRequest,
  privateGalleryMetadata,
} from "../../../../../lib/private-gallery-pages.server.js";

/**
 * `/{locale}/p/{portalToken}/{captureId}` (`PrivatePortalCapture`): one
 * capture of the gallery, behind the same gate as the gallery; a capture
 * the gallery does not show (another space's, one the team refused) is the
 * gallery's `404` page. Never the place.
 *
 * The page is the public gallery's (`PublicCapturePage`, the
 * reference) fed with the capture in its shape, its files through the
 * gallery's gate; the ✕ leads back to this gallery. « Signaler » is drawn
 * only where the service takes reports (`gallery.report` of its team).
 */
export const generateMetadata = privateGalleryMetadata;

export default async function Page({ params }) {
  const { locale, portalToken, captureId } = await params;
  const { service, viewer } = await galleryRequest();
  const { access, view } = await service.capture({
    token: portalToken,
    captureId,
    viewer,
    locale,
  });
  if (access.outcome !== "open")
    return await galleryRefusalPage({ access, locale, token: portalToken });
  const page = privateCapturePageProps({ locale, token: portalToken, view });
  const report = galleryTeam()?.report ?? null;
  return (
    <PublicCapturePage
      {...page}
      reportable={Boolean(report) && page.reportable}
      ReportLink={report ? await report.loadReportLink() : null}
      reportPath={report?.galleryPath(portalToken, page.capture.id) ?? null}
      knowledge={await captureKnowledgeOf(page.capture, locale)}
    />
  );
}
