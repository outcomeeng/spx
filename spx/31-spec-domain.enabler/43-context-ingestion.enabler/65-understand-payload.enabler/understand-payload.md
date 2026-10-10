---
malleability: spec
---

# Understand Payload

PROVIDES the configured Outcome Engineering foundation as the Full body of the coding-agent-specific vendored understand core
SO THAT an agent beginning a session or recovering after compaction
CAN load the methodology foundation and requested product context through one deterministic `show --methodology` projection

## Assertions

- Given the packaged executable and `--methodology`, when `spx spec context show` runs, then its stdout carries the selected bundle's core body first as one Full document
- Given `--methodology`, when the `show` projection is computed, then it reads the selected bundle's schema-version-1 `skills/understand/manifest.json`, resolves its singular contained `core`, and places the core body first as one Full document
- Given `--methodology`, when `show` frames the methodology document, then its path is the package-root-relative bundle address followed by the manifest's core value, a resource identity and never a product target
- ALWAYS: the manifest, source record, reference catalog, templates, and examples remain absent from `show`
- ALWAYS: every reference path the delivered core body names addresses a resource the selected bundle ships, through a path an agent resolves against the framed bundle path, so no `${CLAUDE_SKILL_DIR}` placeholder reaches the agent and the agent can open each reference the core names and fill the Template root its marker records
- ALWAYS: SPX persists no context state between `show` invocations
- ALWAYS: each `show` invocation projects from tracked product content, shipped methodology content, options, accepted canonical targets, and the selected coding agent alone

### Scenarios

- Given an exact configured methodology version, when the methodology line is selected, then the line is that version's `MAJOR.MINOR` ([test](tests/understand-payload.scenario.l1.test.ts))
- Given a declared `migratingFrom`, when the methodology line is selected, then the declared version's tree serves the migration ([test](tests/understand-payload.scenario.l1.test.ts))

### Mappings

- `--coding-agent <name>` selects the coding agent; without it, an established `CODEX_THREAD_ID` marker selects Codex, and otherwise an established `CLAUDE_SESSION_ID` or `CLAUDE_ENV_FILE` marker selects Claude, in the precedence [spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler/21-methodology-source.adr.md](spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler/21-methodology-source.adr.md) declares; with no marker established, the single coding agent shipped for the line is selected, and several remaining agents fail as ambiguous. ([test](tests/understand-payload.mapping.l1.test.ts))
- The packaged executable reads the `CODEX_THREAD_ID`, `CLAUDE_SESSION_ID`, and `CLAUDE_ENV_FILE` markers from its invoking process environment and maps them, with `--coding-agent <name>`, to the coding agent that precedence selects. ([test](tests/understand-payload.mapping.l2.test.ts))

### Compliance

- ALWAYS: a workflow resolves an explicitly needed core-relative resource against the framed bundle path ([audit])
- ALWAYS: after compaction the agent requests `show --methodology` again ([audit])
