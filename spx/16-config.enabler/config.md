# Config

PROVIDES typed, registry-composed configuration for the whole spx harness — spec-tree kinds, session paths, validation rules, language markers, and any other registered concern
SO THAT every spx command and module with configurable behavior
CAN read its configuration through a uniform, type-checked API without inline yaml parsing or hardcoded vocabulary

## Assertions

### Scenarios

- Given no `spx.config.yaml` exists at the repo root, when the config loads, then every registered descriptor resolves to its declared defaults ([test](tests/defaults-only.unit.test.ts))
- Given `spx.config.yaml` exists with a subset of sections, when the config loads, then sections mentioned in yaml merge with their descriptor's defaults and unmentioned sections resolve entirely to defaults ([test](tests/partial-yaml.unit.test.ts))
- Given a descriptor's validator rejects its yaml section, when the config loads, then the load returns an error naming the descriptor and the offending fields and the returned config is not partially usable ([test](tests/validation-failure.unit.test.ts))
- Given a new descriptor is added to the registry, when the config loads, then its section becomes available alongside existing descriptors without any change to other descriptor modules or consumer code ([test](tests/registry-extension.unit.test.ts))

### Properties

- Defaults are type-complete: every registered descriptor's declared defaults satisfy the descriptor's declared shape ([test](tests/defaults.unit.test.ts))
- Resolution is deterministic: the same `projectRoot` yaml produces the same typed `Config` across repeated loads ([test](tests/determinism.unit.test.ts))
- Load is side-effect-free: resolving the config leaves the filesystem and process environment unchanged ([test](tests/invariants.unit.test.ts))

### Compliance

- ALWAYS: resolution reads `spx.config.yaml` at `projectRoot` and descriptor defaults only — no parent-directory search, no `--config` flag, no layered overlay ([test](tests/resolution-scope.unit.test.ts))
- ALWAYS: each descriptor's validator receives only its own yaml section — validators cannot read other descriptors' values or the raw yaml ([test](tests/validation-isolation.unit.test.ts))
- ALWAYS: tests for the config module and descriptors construct fixtures programmatically through the shared spec-tree harness — directory trees and yaml content are generated, never hand-written ([review](21-descriptor-registration.adr.md))
- NEVER: return a partial or untyped config when any descriptor's validator rejects its section — the load either returns a fully-typed `Config` or an error ([test](tests/invariants.unit.test.ts))
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests construct real spec-tree fixtures under temp directories passed as `projectRoot` ([review](21-descriptor-registration.adr.md))
