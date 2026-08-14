# Agent adapter continuation

Pi session coordination continues through independently governed consumers after native resume support:

1. Extend `spx/46-agent.enabler/32-search.enabler` with Pi session-store parsing and `--agent pi` filtering through the source-owned adapter vocabulary.
2. Extend `spx/36-session.enabler/32-session-identity.enabler` and `spx/37-compact.enabler` with Pi session identity supplied by Pi's session runtime or extension event context.
3. Extend `spx/38-worktree.enabler` controlling-process recognition and lifecycle binding so a live Pi process holds the worktree claim for its full lifetime.
4. Extend `spx/33-harness-environment.enabler` with Pi instruction, plugin, skill, hook, and runtime-configuration reconciliation.
5. Extend `spx/54-diagnose.enabler` with Pi installation and configured-environment readings.
6. Supply `spx/57-methodology-lifecycle.enabler` with the exact native session identity its migration resume, verification evidence, and closure bind to.

## Independent recent-session configuration and bounded branch search

### Observed failures

- `src/domains/agent/protocol.ts` declares one resume-owned seven-day constant, and `src/domains/agent/search/results.ts` reuses the resume predicate and its implicit default. The agent domain has no descriptor in `src/config/registry.ts`.
- The reported branch-associated transcript is about eleven days old. Default search excludes it under the implementation's seven-day value even though search requires an independent 15-day default.
- A Codex-only branch search took 50.49 seconds while inspecting the observed transcript store. This violates the product-level assertion in `spx/spx.product.md` that every command completes within 100 ms after process startup.
- Branch search gathers and structurally parses full-history command and subagent evidence before it evaluates recent direct metadata and same-product worktree associations. The observed Codex and Claude stores expose about 182 MB to that path.

### Settled configuration contract

Add one agent-domain descriptor at `src/domains/agent/config.ts`, registered by `src/config/registry.ts`, with this product configuration shape:

```yaml
agent:
  search:
    recentDays: 15
  resume:
    recentDays: 15
```

The module declares two source-owned defaults:

- `DEFAULT_AGENT_SEARCH_RECENT_DAYS = 15`
- `DEFAULT_AGENT_RESUME_RECENT_DAYS = 15`

The values are independent policy. Their equal initial values create no shared constant, alias, fallback chain, or derived relationship. Overriding either field leaves the other field unchanged. Each field accepts only positive safe integers.

### Durable-truth alignment

1. Extend `spx/46-agent.enabler/agent.md` with the finite mapping from the two agent config fields to their independent 15-day defaults and independent overrides.
2. Amend `spx/46-agent.enabler/21-resume.enabler/resume.md` so the default activity window resolves from `agent.resume.recentDays`, defaults to 15 days, and an explicit `--since` overrides only that invocation's resume window.
3. Amend `spx/46-agent.enabler/32-search.enabler/search.md` so the default result window resolves from `agent.search.recentDays`, defaults to 15 days, and `--all` removes only the search result-window bound.
4. Add search compliance assertions that full-history branch association is served from a persistent derived index in a shared product-state scope, while query-time maintenance examines only a source-owned bounded delta of new or changed transcripts. Unchanged historical transcripts are never reopened during a warm query, and incomplete index coverage is reported explicitly instead of producing a false no-match result.
5. Add a search scenario for an empty bounded result whose diagnostic states the resolved recent window and directs the user to `--all`.

### Red evidence before implementation

1. Add `spx/46-agent.enabler/tests/agent-config.mapping.l1.test.ts` for the complete two-field config mapping:
   - absent `agent` config resolves search to 15 and resume to 15;
   - overriding search preserves the resume default;
   - overriding resume preserves the search default;
   - invalid values identify the exact descriptor field.
2. Strengthen `spx/46-agent.enabler/32-search.enabler/tests/search.compliance.l1.test.ts` with source-independent boundary cases supplied by the agent test generator: a transcript just inside 15 days is included, one just outside is excluded, a search override changes only search eligibility, and `--all` removes the bound.
3. Strengthen `spx/46-agent.enabler/21-resume.enabler/tests/resume.compliance.l1.test.ts` with the corresponding source-independent 15-day boundary and a resume-only override. Remove recency expectations derived from `AGENT_RESUME_RECENT_WINDOW_MS`; that coupling lets an incorrect production value update its own oracle.
4. Extend the search filesystem/scanner evidence with observations for index hits, delta files and bytes examined, raw-prefilter candidates, full transcript reads, and structurally parsed rows. On a generated high-volume indexed history, assert that a warm branch query reads no unchanged historical transcript content. After adding literal-negative and JSON-escaped positive evidence, assert that maintenance stays within its source-owned file, byte, and deadline budgets, parses only prefilter-positive files, and indexes the escaped branch correctly. A cold history larger than one maintenance budget reports incomplete coverage without returning a definitive empty result, and repeated bounded maintenance advances to complete coverage.
5. Keep `spx/16-config.enabler/tests/defaults-only.scenario.l1.test.ts` as registry-composition evidence after registering the descriptor. Do not rely on it to prove descriptor presence: it derives both its actual and expected section sets from `productionRegistry`, so the parent agent mapping test owns that requirement.

### Implementation sequence

1. Create `src/domains/agent/config.ts` with the `agent` descriptor, nested field vocabulary, two default constants, partial-section default composition, and field-qualified validation errors. Export the descriptor and resolved types through `src/domains/agent/index.ts`.
2. Register the descriptor through an explicit import in `src/config/registry.ts`. Extend the config test generator so JSON, YAML, and TOML fixtures can carry the agent section without hand-authored config payloads.
3. Resolve the agent descriptor once from the invocation product directory in `src/interfaces/cli/agent.ts`. Pass `agent.resume.recentDays` and `agent.search.recentDays` through separate command inputs.
4. Convert each resolved day value to milliseconds at its command/domain boundary. Make the recency predicate require an explicit window argument. Remove `AGENT_RESUME_LIMITS.RECENT_DAYS` and `AGENT_RESUME_RECENT_WINDOW_MS` so search cannot inherit resume policy through an omitted argument.
5. Preserve resume semantics: explicit `--since` replaces the configured resume window for both modification-time read bounds and transcript-activity eligibility; default resume uses only the configured resume field.
6. Preserve search semantics: default output candidates use only the configured search window; `--all` admits non-future candidates outside it; result limits remain independent of time bounds.
7. Build a persistent branch-evidence index behind injected boundaries and address it through the shared state API:
   - each entry records the adapter, canonical transcript identity, observed size and modification time, attributed top-level session identity, structurally verified branches, and coverage state;
   - bounded maintenance processes only new or changed transcript identities, derives serialization-aware raw needles, prefilters within source-owned file, byte, and deadline budgets, structurally validates only positive files, and atomically advances coverage without reopening unchanged historical content;
   - branch queries gather direct metadata and same-product worktree matches for eligible output candidates, then join verified index associations without scanning the full transcript store;
   - old indexed evidence may associate a recent top-level result, while old top-level sessions remain excluded unless `--all` is present.
8. Distinguish complete empty results from incomplete index coverage. A complete bounded text search with no rows states the resolved search window and names the existing source-owned `--all` flag; incomplete coverage names the bounded maintenance state and never claims no matching session exists. JSON output remains machine data and carries structured coverage state with no presentation-only prose.

### Acceptance evidence

- The reported eleven-day transcript is returned by default branch search under the 15-day search setting.
- Search and resume each default to 15 days and can be overridden independently through `spx.config.{json,yaml,toml}`.
- Changing the search default or override cannot change resume eligibility, and changing the resume default or override cannot change search eligibility.
- A warm default branch search preserves indexed full-history command and Codex subagent association without reading unchanged historical transcript content.
- Bounded index maintenance never exceeds its source-owned file, byte, or deadline budgets; incomplete coverage is explicit and repeated maintenance reaches complete coverage.
- Valid branch names whose transcript representation contains JSON escapes survive bounded prefiltering and reach structured command validation.
- An empty bounded text search explains the active recent window and names `--all`; `--all` finds otherwise matching older sessions.
- The focused config, agent-parent, resume, and search evidence passes, followed by `pnpm run validate`.
- The exact committed changeset receives test-evidence audit, implementation audit, and changes review before `/merge`.

### Verification commands

Run through the repository's load gate and current-source entrypoint:

```bash
tsx src/cli.ts validation markdown spx/46-agent.enabler/agent.md spx/46-agent.enabler/21-resume.enabler/resume.md spx/46-agent.enabler/32-search.enabler/search.md spx/46-agent.enabler/PLAN.md
spx test spx/16-config.enabler spx/46-agent.enabler spx/46-agent.enabler/21-resume.enabler spx/46-agent.enabler/32-search.enabler
pnpm run validate
```
