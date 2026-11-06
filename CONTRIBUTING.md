# Contributing to Astro Portal

Thank you for helping. Please keep changes focused, and keep `npm run check`
green:

```bash
npm ci
npm run check   # build, tests, formatting
```

- **Interface changes**: look at the result on a desktop and at 390 × 844 px,
  in English, French and Japanese: the gallery, an image with several
  variants, the planner and its sky map, the sessions, the account page and
  the administration. The words of the interface address the person politely
  (_vous_ in French); buttons come in four levels, one
  primary button per zone.
- **Data**: never commit personal data — your images, catalogues, sessions,
  coordinates of a real site, Astrometry.net indexes, WCS results, databases.
  New sample metadata is synthetic or under a compatible license; document
  every new field in [docs/DATA_MODEL.md](docs/DATA_MODEL.md).
- **The API** is described by `packages/astro-contracts` (its schemas and
  fixtures are shared with the applications): change the contract and its
  tests with the code.
- **Documentation** is maintained in English under `docs/`; when a change
  affects a page that has a French version under `docs/fr/`, update both.

By contributing you agree that your contribution is licensed under the
project's license, AGPL-3.0-only.
