import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicCapturePage } from "portal/components/detail/PublicCapturePage.js";
import { capturesCopyFor } from "portal/components/manage/captures-copy.js";
import { pageMetadata } from "../../../../lib/page-title.server.js";
import { captureKnowledgeOf } from "../../../../lib/capture-knowledge.server.js";
import { galleryTeam } from "../../../../lib/service-extensions.js";
import { galleryViewer } from "../../../../lib/v1/private-gallery-service.js";
import { requirePublicGalleryService } from "../../../../lib/v1/public-gallery-service.js";

// A public capture of the home gallery: read on the server from the public
// gallery's view model, so that a capture that is not public — private,
// unknown, removed, refused, of a closed space, unfinished — answers the
// ordinary 404 of the application. Indexable, like a public page of the
// site. « Signaler » is drawn for anyone but the capture's owner, where the
// service takes reports (the `report` of its team); never on a private server.

const title = pageMetadata("pageTitleTarget");

export async function generateMetadata(context) {
  return { ...(await title(context)), robots: { index: true, follow: true } };
}

/** Whether the viewer may report the capture: anyone but its owner. */
async function reportableBy(report, captureId) {
  if (!report) return false;
  try {
    return await report.canReportPublic({
      captureId,
      viewer: await galleryViewer(await headers()),
    });
  } catch {
    return false;
  }
}

export default async function Page({ params }) {
  const { locale, captureId } = await params;
  let id = "";
  try {
    id = decodeURIComponent(captureId || "");
  } catch {
    notFound();
  }
  const capture = await (
    await requirePublicGalleryService()
  ).get({ captureId: id, locale });
  if (!capture) notFound();
  const report = galleryTeam()?.report ?? null;
  return (
    <PublicCapturePage
      capture={capture}
      knowledge={await captureKnowledgeOf(capture, locale)}
      noTarget={capturesCopyFor(locale).noTarget}
      locale={locale}
      reportable={await reportableBy(report, capture.id)}
      ReportLink={report ? await report.loadReportLink() : null}
      reportPath={report?.publicPath(capture.id) ?? null}
    />
  );
}
