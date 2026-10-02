---
malleability: spec
---

# Understand Payload

PROVIDES the configured Outcome Engineering foundation as the Full body of the coding-agent-specific vendored understand core
SO THAT an agent beginning a session or recovering after compaction
CAN load the methodology foundation and requested product context through one deterministic `show --methodology` projection

## Assertions

### Scenarios

- Given an exact configured methodology version, when the methodology line is selected, then the line is that version's `MAJOR.MINOR`, and while `migratingFrom` is declared, the declared version's tree serves the migration ([test](tests/understand-payload.scenario.l1.test.ts))
- Given `--methodology`, when `show` runs, then it reads the selected bundle's schema-version-1 `skills/understand/manifest.json`, resolves its singular contained `core`, and emits the core body first as one Full document ([test](tests/understand-payload.scenario.l1.test.ts), [test](tests/understand-payload.scenario.l2.test.ts))
- Given `--methodology`, when `show` frames the methodology document, then its path is the package-root-relative bundle address followed by the manifest's core value, a resource identity and never a product target ([test](tests/understand-payload.scenario.l1.test.ts))

### Mappings

- `--coding-agent <name>` selects the coding agent; without it, Codex invocation markers precede Claude invocation markers, then the single coding agent shipped for the line is selected, and several remaining agents fail as ambiguous. ([test](tests/understand-payload.mapping.l1.test.ts), [test](tests/understand-payload.mapping.l2.test.ts))

### Compliance

- ALWAYS: the manifest, source record, reference catalog, templates, and examples remain absent from `show`; workflows resolve an explicitly needed core-relative resource against the framed bundle path ([test](tests/understand-payload.compliance.l1.test.ts))
- ALWAYS: SPX persists no context state between `show` invocations; each invocation projects from tracked and shipped content alone ([test](tests/understand-payload.compliance.l1.test.ts))
- ALWAYS: after compaction the agent requests `show --methodology` again ([audit])
