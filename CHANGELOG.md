# Changelog

All notable changes to Astro Portal are documented in this file. The project
follows [Semantic Versioning](https://semver.org/).

## 1.0.0

First public release of the repository: the portal application
(`apps/portal-oss`) and the packages it needs.

- The gallery, with originals served without recompression, stacking
  progressions, plate-solving overlays and a personal sky map.
- The night planner: forecast, sky quality, equipment recommendations, the
  schedule of the night, an interactive sky map, several plans at once, and
  multi-night plans.
- Sessions: the journal of each night, its captures, the debriefing of a plan
  against what was shot, and statistics over the nights.
- A private server for the PlanAstro application and for Astro Sync, with
  sign-in by password or by a code received by e-mail.
- Self-hosting: a Docker installer (`deploy/install.sh`), a distroless image,
  launchd and systemd examples, backups and restore, updates by releases with
  automatic rollback, and the tools of a sample night
  (`npm run sample:install`), whose data is not published yet.
- Ten languages: French, English, German, Spanish, Italian, Japanese, Brazilian
  Portuguese, Russian, Simplified and Traditional Chinese.
