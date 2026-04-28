# Config

PROVIDES typed, registry-composed configuration for the whole spx harness — spec-tree kinds, session paths, validation rules, language markers, and any other registered concern
SO THAT every spx command and module with configurable behavior
CAN read its configuration through a uniform, type-checked API without inline config parsing or hardcoded vocabulary

## Assertions

### Scenarios

- Given no config file exists at the project root, when the config loads, then every registered descriptor resolves to its declared defaults ([test](tests/defaults-only.scenario.l1.test.ts))
- Given a config file exists with a subset of sections, when the config loads, then sections present in the file merge with their descriptor's defaults and unmentioned sections resolve entirely to defaults ([test](tests/partial-yaml.scenario.l1.test.ts))
- Given both `spx.config.json` and `spx.config.yaml` are present at the project root, when the config loads, then it returns an error naming both files and no config is returned ([test](tests/config-ambiguity.scenario.l1.test.ts))
- Given a descriptor's validator rejects its section in the config file, when the config loads, then the load returns an error naming the descriptor and the offending fields and the returned config is not partially usable ([test](tests/validation-failure.scenario.l1.test.ts))
- Given a new descriptor is added to the registry, when the config loads, then its section becomes available alongside existing descriptors without any change to other descriptor modules or consumer code ([test](tests/registry-extension.scenario.l1.test.ts))

### Properties

- Defaults are type-complete: every registered descriptor's declared defaults satisfy the descriptor's declared shape ([test](tests/defaults.property.l1.test.ts))
- Resolution is deterministic: the same `projectRoot` config file produces the same typed `Config` across repeated loads ([test](tests/determinism.property.l1.test.ts))
- Load is side-effect-free: resolving the config leaves the filesystem and process environment unchanged ([test](tests/invariants.property.l1.test.ts))

### Mappings

- `spx.config.json`, `spx.config.yaml`, and `spx.config.toml` each produce an equivalent typed `Config` when they contain the same key-value structure ([test](tests/config-format.mapping.l1.test.ts))

### Compliance

- ALWAYS: resolution reads exactly one config file from the supplied `projectRoot`; parent directories, nested directories, CLI flags, and overlay files are not resolution inputs ([test](tests/resolution-scope.compliance.l1.test.ts), [review](21-descriptor-registration.adr.md))
- ALWAYS: config file format probing, raw parsing, and serialization are owned by `src/config/`; downstream modules consume config-file and section APIs instead of importing format parsers ([test](tests/resolution-scope.compliance.l1.test.ts), [review](21-config-file-formats.adr.md))
- ALWAYS: each descriptor's validator receives only its own section from the config file — validators cannot read other descriptors' values or the raw file content ([test](tests/validation-isolation.compliance.l1.test.ts))
- ALWAYS: tests for the config module and descriptors construct fixtures programmatically through the shared spec-tree harness — directory trees and config file content are generated, never hand-written ([review](21-descriptor-registration.adr.md))
- NEVER: return a partial or untyped config when any descriptor's validator rejects its section — the load either returns a fully-typed `Config` or an error ([test](tests/invariants.property.l1.test.ts))
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests construct real spec-tree fixtures under temp directories passed as `projectRoot` ([review](21-descriptor-registration.adr.md))
