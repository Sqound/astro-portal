import { skyTileMirror } from "../sky-tiles/mirror.js";
import { lowOrderArchiveAddress } from "../sky-tiles/geometry.js";
import { skyBackdropTierFit } from "../sky-tiles/tier-fit.js";
import {
  healpixCumulativeTileCount,
  skyBackdropArchiveChunkDelta,
  skyBackdropTierDefinitions,
  skyBackdropTiers,
  skyBackdropTopUp,
  skyBackdropWeightedMeanTileBytes,
} from "../sky-tiles/surveys.js";

/**
 * Every sky-backdrop tier's real state, as the HiPS mirror (`../sky-tiles/mirror.js`)
 * reports it: a tier is `ready` once every archive it is made of already exists in
 * the mirror's disk cache — in which case `exactBytes` is the REAL combined size of
 * those archive files, not an estimate — `on-demand` otherwise. This always *asks*
 * the mirror rather than declaring a fixed answer (a portal's manifest must
 * interrogate what it can actually serve, never hard-code it), and never touches the
 * network: `mirror.tierState` only stats the mirror's own disk cache. Shared between
 * `GET /v1/offline-pack` (`portal-app/lib/offline-pack.server.js`, pointed at the
 * running mirror) and a static pack (pointed at a mirror snapshot via
 * `ASTRO_PORTAL_SKY_TILE_MIRROR_DIR`) — neither ever downloads a tile to
 * answer this.
 *
 * Given `meanTileBytesByOrder` (a value or a promise of the tile sizes the
 * service judges by — only the live manifest gives it, since only a live
 * service prepares tiers), a tier that is not built yet and could not fit in
 * the mirror's byte budget is marked `unavailable: true`: the very rule that
 * makes `POST .../prepare` answer `409` `sky_backdrop_tier_exceeds_mirror_limit`
 * (`../sky-tiles/tier-fit.js`), said beforehand. The mark is only ever
 * `true`; without the option, no tier is marked.
 */
export async function skyBackdropTierStates(
  survey,
  {
    archiveChunkDelta = skyBackdropArchiveChunkDelta,
    meanTileBytesByOrder = null,
  } = {},
) {
  const mirror = skyTileMirror();
  const means = Promise.resolve(meanTileBytesByOrder);
  return Promise.all(
    skyBackdropTierDefinitions.map(async (tier) => {
      const state = await mirror.tierState({
        survey,
        maxOrder: tier.maxOrder,
        archiveChunkDelta,
      });
      // How many of the tier's archives exist: from the mirror's archive
      // index alone, so this stays a cheap read on every manifest request.
      // Asked after `tierState`, which may have just repaired that index.
      const progress = await mirror.tierArchiveProgress({
        survey,
        maxOrder: tier.maxOrder,
        archiveChunkDelta,
      });
      const judgedBy = await means;
      const unavailable =
        judgedBy !== null &&
        progress.ready < progress.total &&
        !skyBackdropTierFit({
          tier,
          meanTileBytesByOrder: judgedBy,
          archiveChunkDelta,
          maxBytes: mirror.maxBytes,
          evictionTargetRatio: mirror.evictionTargetRatio,
        }).fits;
      return {
        ...state,
        archives: { ready: progress.ready, total: progress.total },
        ...(unavailable ? { unavailable: true } : {}),
      };
    }),
  );
}

/** The live API's route for `POST|GET` the background preparation of one
 * tier (`portal-app/routes/api/v1/offline-pack/sky-backdrop/tiers/[tier]/prepare`),
 * named in the manifest so that a client learns from it, rather than from a
 * `404`, whether this portal offers it. A static pack has no such route and
 * does not name it. */
export const skyBackdropPrepareUrlTemplate =
  "/v1/offline-pack/sky-backdrop/tiers/{tier}/prepare";

/**
 * The whole-sky HiPS tile backdrop component — a pure, synchronous
 * projection of an already-probed `survey`, `meanTileBytesByOrder`
 * (`../sky-tiles/mirror.js`'s `observedMeanTileBytesByOrder`, the documented
 * per-order constant until enough real tiles have been observed) and
 * `tierStates` (`skyBackdropTierStates` above): no filesystem access happens
 * here. Shared between the live route and a static pack;
 * only `archiveUrlTemplate`/`tileUrlTemplate` differ between a live API
 * (`/v1/sky-tiles/...`) and a self-hosted static pack (`sky-tiles/...`,
 * relative to the pack root), so both are left to the caller.
 */
export function skyBackdropPackComponent(
  {
    survey,
    meanTileBytesByOrder,
    tierStates,
    archiveChunkDelta = skyBackdropArchiveChunkDelta,
  },
  {
    archiveUrlTemplate = "/v1/sky-tiles/{survey}/Norder{order}/Chunk{chunkOrder}/{chunkPix}.tar",
    tileUrlTemplate = "/v1/sky-tiles/{survey}/Norder{order}/Dir{dir}/Npix{pix}.{format}",
    prepareUrlTemplate = null,
  } = {},
) {
  const lowOrderArchive = lowOrderArchiveAddress(archiveChunkDelta);
  const tiers = skyBackdropTiers(meanTileBytesByOrder, archiveChunkDelta);
  return {
    id: "sky-backdrop",
    kind: "hips-tiles",
    required: false,
    survey: { ...survey },
    // Kept for a reader that predates `meanTileBytesByOrder` below: the
    // tile-count-weighted mean over the LOWEST tier's own orders
    // (`essential`, 0..3) — never a flat average across every order, which
    // would overweight the numerically huge deeper orders relative to what
    // `essential` alone actually downloads.
    meanTileBytes: skyBackdropWeightedMeanTileBytes(
      meanTileBytesByOrder,
      skyBackdropTierDefinitions[0].maxOrder,
    ),
    // Additive: mean bytes/tile PER HEALPix order.
    meanTileBytesByOrder: { ...meanTileBytesByOrder },
    archiveChunkDelta,
    archiveUrlTemplate,
    tileUrlTemplate,
    // Additive: where a client asks this portal to prepare a tier itself, in
    // the background. Absent from a static pack.
    ...(prepareUrlTemplate ? { prepareUrlTemplate } : {}),
    tiers: tiers.map((tier, index) => {
      const { state, exactBytes, archives, unavailable } = tierStates[index];
      return {
        ...tier,
        state,
        // Additive: this service cannot provide the tier — it is not built
        // and would not fit in the mirror's byte budget, so preparing it is
        // refused (`409` `sky_backdrop_tier_exceeds_mirror_limit`). Only
        // ever `true`; a tier that says nothing is one the service can
        // provide.
        ...(unavailable === true ? { unavailable: true } : {}),
        // Additive: how many of the archives this tier is made of the mirror
        // already has, and how many it needs — `{ ready, total }`.
        ...(archives
          ? { archives: { ready: archives.ready, total: archives.total } }
          : {}),
        // Once every archive a tier needs is actually built, its
        // `estimatedBytes` becomes the EXACT combined size of those real
        // archive files — never `tiles * meanTileBytes` — flagged
        // additively so a client knows it is no longer an estimate.
        ...(state === "ready" && Number.isFinite(exactBytes)
          ? { estimatedBytes: exactBytes, exactBytes: true }
          : {}),
      };
    }),
    topUp: { ...skyBackdropTopUp },
    // Additive: the orders 0..archiveChunkDelta-1 archive is a single,
    // fixed cumulative unit rather than the general per-order
    // aggregation, spelled out here so a client does not have to
    // special-case it out of `archiveUrlTemplate`'s general
    // `{order}`/`{chunkOrder}`/`{chunkPix}` placeholders on its own.
    lowOrderArchive: {
      ...lowOrderArchive,
      tiles: healpixCumulativeTileCount(lowOrderArchive.order),
    },
  };
}
