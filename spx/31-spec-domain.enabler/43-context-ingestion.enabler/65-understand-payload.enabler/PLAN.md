# Plan: committed methodology plugin adoption

> Reconcile against `spx/31-spec-domain.enabler/43-context-ingestion.enabler/PLAN.md`
> and `spx/PLAN.md` before acting. Governing artifacts are
> `spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler/21-methodology-source.adr.md`
> and `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler/methodology-plugin.md`.

## Pending steps

1. Accept `methodology.migratingFrom` in the `methodology` config descriptor in
   `src/config/methodology.ts`, and remove `packageDir`. Remove the `installed` sentinel
   and the version-intent classification with it: the sentinel names an installed
   methodology, and no methodology is installed once the foundation is committed. Its only
   production consumer is the diagnose methodology-context check.
2. Materialize the committed trees under the governance of
   `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler`, addressed
   `methodology/{methodology-version}/{coding-agent}/{plugin}/`. One tree per declared
   methodology version — the target and, while open, the migration source — per coding
   agent the marketplace builds. Each tree is rooted at the plugin root and holds the
   resources its `skills/understand/manifest.json` names, so every manifest-declared path
   resolves unchanged. Materialization copies from a revision of the capability source
   repository's built per-coding-agent output; no plugin cache is read.
3. Replace `packageDir` resolution in the payload reader with the address formed from the
   declared methodology version and the coding agent in scope. Manifest parsing, schema
   validation, provenance comparison, and catalog mapping stay pure over supplied bytes
   with the tree read behind the injected reader.
4. Move the diagnose methodology-context probe off the plugin cache. Delete the
   version-directory walk in `src/commands/diagnose/probes.ts` — `PLUGIN_CACHE_SEGMENTS`,
   `VERSION_DIRECTORY_PATTERN`, `versionDirectories`, `isVersionDirectoryName`,
   `selectConfiguredVersion`, `configuredVersionDirectory` — and observe the committed
   trees under the product directory instead. The check's verdict vocabulary loses
   `version-mismatch` and `bootstrap-identity`.
5. Rename the `methodology-package` fixture directory in `testing/harnesses/spec/context.ts`
   with the reader rewrite, and drop the cache-fixture construction in
   `testing/harnesses/diagnose/methodology-context.ts`.

## Prototype tier

Every spec and decision artifact in this changeset declares `tier: prototype`. No test or
eval evidence is established for the assertions this tier introduces; the existing
evidence links in `understand-payload.md` remain and their tests follow the reader
rewrite.

## Verification route

- `tsx src/cli.ts validation markdown` over the touched node directories
- `pnpm run validate`
- `tsx src/cli.ts spec context show <node> --understand` against a materialized tree
- `/merge`
