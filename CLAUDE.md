@AGENTS.md

## One-off seed: remove in the next PR

`scripts/seed.ts` loads Mom's cookbook (264 recipes, filed under `savta`) after every build.
It is temporary. Once a build log says `Seed: done`, or no matter what in the PR after the
one that added it, delete all of it:

- `scripts/seed.ts` and `scripts/seed/`
- `&& npm run seed` at the end of `build`, and the `seed` script, in `package.json`
- the "One-off seed" section in `README.md`
- the `export` on `processSource` in `src/lib/ingest/index.ts` (only the seed uses it)
- this section
