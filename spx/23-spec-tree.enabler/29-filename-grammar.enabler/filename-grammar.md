---
id: 01a20495-778c-700f-a58d-dc3cd04b3e36
---

# Filename Grammar

PROVIDES the single-sourced, versioned Spec-Tree filename grammar: the complete token vocabulary declared once in the grammar registry, the spec-tree config descriptor that carries no kind field, the dedicated naming-schema version, and the ordered naming-schema versions from which a methodology declaration selects its valid versions
SO THAT every reader, writer, and renderer of Spec-Tree filenames
CAN classify and render filenames against one authoritative grammar, without re-declaring tokens, configuring a kind vocabulary, or knowing prior naming-schema versions themselves

## Assertions

### Test.Scenario: spec-tree config descriptor

- [config-without-kinds](tests/spec-tree-config.scenario.l1.test.ts):
  - Given the spec-tree descriptor is registered with the config module and the product configuration holds no `specTree` section
  - When `resolveConfig(productDir)` runs
  - Then resolution succeeds and the resolved spec-tree section carries no `kinds` field
- [kinds-list-rejected](tests/spec-tree-config.scenario.l1.test.ts):
  - Given product configuration whose `specTree` section carries a `kinds` field listing the kind names `enabler` and `adr`
  - When the config resolves with the spec-tree descriptor
  - Then resolution fails with an error naming `specTree.kinds`
- [kinds-map-rejected](tests/spec-tree-config.scenario.l1.test.ts):
  - Given product configuration whose `specTree` section carries a `kinds` field mapping every registered kind name to its registry definition
  - When the config resolves with the spec-tree descriptor
  - Then resolution fails with an error naming `specTree.kinds`

### Test.Mapping: [declaration-selection](tests/declaration-selection.mapping.l1.test.ts)

A methodology declaration maps to the naming-schema versions it selects by the major of its `methodology.version`, and of its `methodology.migratingFrom` when declared, whether the version names a line or an exact release on that line, and a `.capability` node directory reads valid under a declaration on the 4.0 line and superseded under one on a 3.x line.

| Case               | `methodology.version` | `methodology.migratingFrom` | Selected versions | A `.capability` node directory |
| ------------------ | --------------------- | --------------------------- | ----------------- | ------------------------------ |
| line-3-0           | `3.0`                 | none                        | 3.x               | superseded                     |
| release-3-0        | `3.0.<patch>`         | none                        | 3.x               | superseded                     |
| line-3-1           | `3.1`                 | none                        | 3.x               | superseded                     |
| release-3-1        | `3.1.<patch>`         | none                        | 3.x               | superseded                     |
| line-3-2           | `3.2`                 | none                        | 3.x               | superseded                     |
| release-3-2        | `3.2.<patch>`         | none                        | 3.x               | superseded                     |
| line-4-0           | `4.0`                 | none                        | 4.0               | valid                          |
| release-4-0        | `4.0.<patch>`         | none                        | 4.0               | valid                          |
| migrating-from-3-0 | `4.0`                 | `3.0`                       | 4.0 and 3.x       | valid                          |
| migrating-from-3-1 | `4.0`                 | `3.1`                       | 4.0 and 3.x       | valid                          |
| migrating-from-3-2 | `4.0`                 | `3.2`                       | 4.0 and 3.x       | valid                          |

### Test.Mapping: [version-lines](tests/declaration-selection.mapping.l1.test.ts)

Each known naming-schema version maps to the methodology lines it serves.

| Case          | Naming-schema version | Methodology lines served |
| ------------- | --------------------- | ------------------------ |
| first-version | the first version     | none                     |
| three-x       | the 3.x version       | `3.0`, `3.1`, `3.2`      |
| four-zero     | the 4.0 version       | `4.0`                    |

### Test.Mapping: [knowledge-root-4-0](tests/knowledge-root.mapping.l1.test.ts)

The 4.0 naming-schema version maps each entry, named relative to the directory that holds a knowledge root, a node directory or `spx/` of the root product alike, to accepted or not accepted, with `<slug>` any slug.

| Case                       | Entry                     | Type      | 4.0 version  |
| -------------------------- | ------------------------- | --------- | ------------ |
| knowledge-directory        | `knowledge`               | directory | accepted     |
| index-file                 | `knowledge/index.md`      | file      | accepted     |
| log-file                   | `knowledge/log.md`        | file      | accepted     |
| bundle-file                | `knowledge/<slug>`        | file      | accepted     |
| bundle-directory           | `knowledge/<slug>`        | directory | accepted     |
| bundle-nested-file         | `knowledge/<slug>/<slug>` | file      | accepted     |
| knowledge-as-file          | `knowledge`               | file      | not accepted |
| nested-knowledge-directory | `<slug>/knowledge`        | directory | not accepted |

### Test.Mapping: [lane-directories-3x](tests/lane-directories-3x.mapping.l1.test.ts)

The 3.x naming-schema version maps each knowledge-root and probe-lane entry, named relative to a node directory or `spx/` of the root product, to not accepted, both as knowledge-root content and as probe-lane content, with `<slug>` any slug.

| Case                | Entry                    | Type      | 3.x version  |
| ------------------- | ------------------------ | --------- | ------------ |
| knowledge-directory | `knowledge`              | directory | not accepted |
| index-file          | `knowledge/index.md`     | file      | not accepted |
| log-file            | `knowledge/log.md`       | file      | not accepted |
| probes-directory    | `probes`                 | directory | not accepted |
| probe-directory     | `probes/<slug>`          | directory | not accepted |
| probe-protocol      | `probes/<slug>/probe.md` | file      | not accepted |
| probe-runs          | `probes/<slug>/runs`     | directory | not accepted |

### Test.Mapping: [first-version-node-directories](tests/filename-grammar.mapping.l1.test.ts)

The first naming-schema version, selected alone, maps a node directory of each of its node suffixes to a node entry, and neither `.feature` nor `.story` is a suffix of the live kind registry or of the newest naming-schema version.

| Case       | Node directory suffix | Entry |
| ---------- | --------------------- | ----- |
| capability | `.capability`         | node  |
| feature    | `.feature`            | node  |
| story      | `.story`              | node  |

### Test.Mapping: [eval-lane](tests/filename-grammar.mapping.l1.test.ts)

Both the 4.0 and the 3.x naming-schema version map each entry under a node directory to accepted or not accepted, with `<rule>` and `<slug>` any slugs and `<listed>` each of `eval.toml`, `cases.jsonl`, `prompt.md`, `prompt.template.md`, and `history.jsonl`.

| Case                     | Entry                             | Type      | Both versions |
| ------------------------ | --------------------------------- | --------- | ------------- |
| eval-toml                | `evals/<rule>/eval.toml`          | file      | accepted      |
| cases-jsonl              | `evals/<rule>/cases.jsonl`        | file      | accepted      |
| prompt-md                | `evals/<rule>/prompt.md`          | file      | accepted      |
| prompt-template-md       | `evals/<rule>/prompt.template.md` | file      | accepted      |
| history-jsonl            | `evals/<rule>/history.jsonl`      | file      | accepted      |
| runs-directory           | `evals/<rule>/runs`               | directory | accepted      |
| runs-as-file             | `evals/<rule>/runs`               | file      | not accepted  |
| listed-as-directory      | `evals/<rule>/<listed>`           | directory | not accepted  |
| listed-directly-in-evals | `evals/<listed>`                  | file      | not accepted  |
| listed-outside-evals     | `<slug>/<rule>/<listed>`          | file      | not accepted  |

### Test.Mapping: [grammar-tokens](tests/filename-grammar.mapping.l1.test.ts)

For each methodology line SPX reads sources on, every naming-schema version the line selects maps each token group, through the grammar registry surface, to the tokens below; the evidence-file grammar the library exposes is the grammar registry's own object, and the newest version's node and decision suffix sets are those of the kind registry.

| Case               | Token group             | 3.2 line                                                                                        | 4.0 line                                                                                        |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| kind-suffixes      | node suffixes           | `.enabler`, `.outcome`                                                                          | `.product`, `.substrate`, `.capability`, `.domain`, `.interface`, `.surface`, `.variant`        |
| decision-suffixes  | decision suffixes       | `.adr.md`, `.pdr.md`                                                                            | `.adr.md`, `.pdr.md`                                                                            |
| product-suffix     | product suffix          | `.product.md`                                                                                   | `.spec.md`                                                                                      |
| evidence-modes     | evidence modes          | `scenario`, `mapping`, `conformance`, `property`, `compliance`                                  | `scenario`, `mapping`, `conformance`, `property`, `compliance`                                  |
| execution-levels   | execution levels        | `l1`, `l2`, `l3`                                                                                | `l1`, `l2`, `l3`                                                                                |
| language-tails     | language tails          | the language tails the grammar registry declares                                                | the language tails the grammar registry declares                                                |
| runner-tokens      | runner tokens           | the runner tokens the grammar registry declares                                                 | the runner tokens the grammar registry declares                                                 |
| segment-separator  | segment separator       | `.`                                                                                             | `.`                                                                                             |
| order-separator    | order separator         | `-`                                                                                             | `-`                                                                                             |
| path-separator     | path separator          | `/`                                                                                             | `/`                                                                                             |
| order-pattern      | order pattern           | matches every index the 3.x index form accepts                                                  | matches every index the 4.0 index form accepts                                                  |
| coordination-notes | coordination-note names | `PLAN.md`, `ISSUES.md`                                                                          | `ISSUES.md`                                                                                     |
| eval-lane-names    | eval-lane names         | `evals`, `eval.toml`, `cases.jsonl`, `prompt.md`, `prompt.template.md`, `history.jsonl`, `runs` | `evals`, `eval.toml`, `cases.jsonl`, `prompt.md`, `prompt.template.md`, `history.jsonl`, `runs` |
| spec-file-suffix   | spec-file suffix        | `.md`                                                                                           | `.spec.md`                                                                                      |

### Test.Mapping: [kind-registry](tests/kind-registry.mapping.l1.test.ts)

`KIND_REGISTRY` is the object `SPEC_TREE_CONFIG.KINDS` itself, and each registered kind maps by its category to the entry a record named by its registered suffix reads as, under each methodology line that reads that category.

| Case     | Category   | Record named by the suffix | Entry    | Methodology lines |
| -------- | ---------- | -------------------------- | -------- | ----------------- |
| node     | `node`     | a node directory           | node     | `3.2`             |
| output   | `output`   | a node directory           | node     | `4.0`             |
| decision | `decision` | a decision file in a node  | decision | `3.2`, `4.0`      |

### Test.Mapping: [kind-subregistries](tests/kind-registry-subsets.mapping.l1.test.ts)

Filtering `KIND_REGISTRY` by a category maps to the exported sub-registry of that category, and the sub-registry's suffixes are the registered suffixes of its members.

| Case     | Category   | Kinds            | Suffixes            |
| -------- | ---------- | ---------------- | ------------------- |
| node     | `node`     | `NODE_KINDS`     | `NODE_SUFFIXES`     |
| output   | `output`   | `OUTPUT_KINDS`   | `OUTPUT_SUFFIXES`   |
| decision | `decision` | `DECISION_KINDS` | `DECISION_SUFFIXES` |

### Test.Mapping: [kind-partition](tests/kind-registry-types.mapping.l1.test.ts)

Each kind that `keyof typeof KIND_REGISTRY` enumerates maps to exactly one of the exported kind lists, and the three lists together hold exactly the registered kinds.

| Case       | Kind         | Kind list        |
| ---------- | ------------ | ---------------- |
| enabler    | `enabler`    | `NODE_KINDS`     |
| outcome    | `outcome`    | `NODE_KINDS`     |
| substrate  | `substrate`  | `OUTPUT_KINDS`   |
| capability | `capability` | `OUTPUT_KINDS`   |
| domain     | `domain`     | `OUTPUT_KINDS`   |
| interface  | `interface`  | `OUTPUT_KINDS`   |
| surface    | `surface`    | `OUTPUT_KINDS`   |
| variant    | `variant`    | `OUTPUT_KINDS`   |
| adr        | `adr`        | `DECISION_KINDS` |
| pdr        | `pdr`        | `DECISION_KINDS` |

### Test.Mapping: [suffix-uniqueness](tests/kind-registry-suffixes.mapping.l1.test.ts)

Each group of registered kinds maps to registered suffixes that are pairwise distinct.

| Case                       | Group                                   | Suffixes          |
| -------------------------- | --------------------------------------- | ----------------- |
| node-directory-suffixes    | every registered kind but the decisions | pairwise distinct |
| decision-filename-suffixes | every registered decision kind          | pairwise distinct |
| all-registered-suffixes    | every registered kind                   | pairwise distinct |

### Test.Mapping: [kind-opening](tests/kind-opening.mapping.l1.test.ts)

Each node kind maps to its opening keyword, and a variant under each 4.0 output kind maps to the opening keyword of that parent kind.

| Case                     | Kind                         | Opening keyword   |
| ------------------------ | ---------------------------- | ----------------- |
| substrate                | `substrate`                  | `SUPPLIES`        |
| capability               | `capability`                 | `PROVIDES`        |
| domain                   | `domain`                     | `OWNS`            |
| interface                | `interface`                  | `ADAPTS`          |
| surface                  | `surface`                    | `EXPOSES`         |
| enabler                  | `enabler`                    | `PROVIDES`        |
| outcome                  | `outcome`                    | `WE BELIEVE THAT` |
| variant-under-substrate  | `variant` under `substrate`  | `SUPPLIES`        |
| variant-under-capability | `variant` under `capability` | `PROVIDES`        |
| variant-under-domain     | `variant` under `domain`     | `OWNS`            |
| variant-under-interface  | `variant` under `interface`  | `ADAPTS`          |
| variant-under-surface    | `variant` under `surface`    | `EXPOSES`         |

### Test.Mapping: [kind-containment](tests/kind-containment.mapping.l1.test.ts)

Each node kind maps to the child kinds it admits, and a variant maps through the kind it sits under.

| Case                     | Kind                         | Admitted child kinds                                                                         |
| ------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------- |
| substrate                | `substrate`                  | `substrate`, `variant`                                                                       |
| capability               | `capability`                 | `substrate`, `capability`, `variant`                                                         |
| domain                   | `domain`                     | `substrate`, `capability`, `domain`, `variant`                                               |
| interface                | `interface`                  | `substrate`, `capability`, `domain`, `interface`, `variant`                                  |
| surface                  | `surface`                    | `substrate`, `capability`, `domain`, `interface`, `surface`, `variant`                       |
| variant-under-substrate  | `variant` under `substrate`  | `substrate`                                                                                  |
| variant-under-capability | `variant` under `capability` | `substrate`, `capability`                                                                    |
| variant-under-domain     | `variant` under `domain`     | `substrate`, `capability`, `domain`                                                          |
| variant-under-interface  | `variant` under `interface`  | `substrate`, `capability`, `domain`, `interface`                                             |
| variant-under-surface    | `variant` under `surface`    | `substrate`, `capability`, `domain`, `interface`, `surface`                                  |
| enabler                  | `enabler`                    | `enabler`                                                                                    |
| outcome                  | `outcome`                    | `enabler`, `outcome`                                                                         |
| product                  | `product`                    | `substrate`, `capability`, `domain`, `interface`, `surface`, `product`, `enabler`, `outcome` |

### Test.Mapping: [spec-file-forms](tests/spec-file-form.mapping.l1.test.ts)

The naming-schema version a methodology line selects maps each filesystem form it accepts to the entry it reads, with `<index>` any index that version accepts, `<slug>`, `<name>`, and `<parent>` any slugs, and `<node>` a node directory of that version.

| Case                     | Line  | Record                                                                 | Entry                                                |
| ------------------------ | ----- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| enabler-directory-3x     | `3.2` | directory `<index>-<slug>.enabler`                                     | node of kind `enabler` with spec `<slug>.md`         |
| outcome-directory-3x     | `3.2` | directory `<index>-<slug>.outcome`                                     | node of kind `outcome` with spec `<slug>.md`         |
| product-root-3x          | `3.2` | file `<name>.product.md` directly under `spx/`                         | product titled `<name>`                              |
| adr-3x                   | `3.2` | file `<node>/<index>-<slug>.adr.md`                                    | decision of kind `adr` in `<node>`                   |
| pdr-3x                   | `3.2` | file `<node>/<index>-<slug>.pdr.md`                                    | decision of kind `pdr` in `<node>`                   |
| substrate-directory-4-0  | `4.0` | directory `<index>-<slug>.substrate`                                   | node of kind `substrate` with spec `<slug>.spec.md`  |
| capability-directory-4-0 | `4.0` | directory `<index>-<slug>.capability`                                  | node of kind `capability` with spec `<slug>.spec.md` |
| domain-directory-4-0     | `4.0` | directory `<index>-<slug>.domain`                                      | node of kind `domain` with spec `<slug>.spec.md`     |
| interface-directory-4-0  | `4.0` | directory `<index>-<slug>.interface`                                   | node of kind `interface` with spec `<slug>.spec.md`  |
| surface-directory-4-0    | `4.0` | directory `<index>-<slug>.surface`                                     | node of kind `surface` with spec `<slug>.spec.md`    |
| variant-directory-4-0    | `4.0` | directory `<index>-<slug>.variant`                                     | node of kind `variant` with spec `<slug>.spec.md`    |
| product-directory-4-0    | `4.0` | directory `<index>-<slug>.product`                                     | node of kind `product` with spec `<slug>.spec.md`    |
| product-root-4-0         | `4.0` | file `<name>.spec.md` directly under `spx/`, declaring `kind: product` | product titled `<name>`                              |
| adr-4-0                  | `4.0` | file `<node>/<index>-<slug>.adr.md`                                    | decision of kind `adr` in `<node>`                   |
| pdr-4-0                  | `4.0` | file `<node>/<index>-<slug>.pdr.md`                                    | decision of kind `pdr` in `<node>`                   |

### Test.Mapping: [node-local-notes](tests/spec-file-form.mapping.l1.test.ts)

The naming-schema version a methodology line selects maps each node-local note name to accepted or not accepted.

| Case       | Line  | Note name   | Version      |
| ---------- | ----- | ----------- | ------------ |
| plan-3x    | `3.2` | `PLAN.md`   | accepted     |
| issues-3x  | `3.2` | `ISSUES.md` | accepted     |
| issues-4-0 | `4.0` | `ISSUES.md` | accepted     |
| plan-4-0   | `4.0` | `PLAN.md`   | not accepted |

### Test.Property: naming-schema forms

- [knowledge-bundle-paths](tests/knowledge-root.property.l1.test.ts): For every path whose first segment is `knowledge` and whose one or more later segments are non-empty names holding no `/`, as a file or as a directory, under a node directory or under `spx/` of the root product, the 4.0 naming-schema version accepts the path, reserving only the root name and leaving the structure beneath it to the bundle's author
- [probe-directory](tests/probe-directory.property.l1.test.ts): For every entry under a node's `probes/` directory, the 4.0 naming-schema version accepts it exactly when it is a probe directory whose name is any slug, that directory's `probe.md` file, an artifact file `{slug}.{ext}` in that directory where `{slug}` is any slug and `{ext}` is any word, or that directory's `runs/` directory
- [index-form-4-0](tests/index-form.property.l1.test.ts): For every string, the 4.0 naming-schema version accepts it as an index exactly when it is a two-digit integer from `10` to `99` followed by zero or more two-digit fractional segments, each joined by `.`
- [index-form-3x](tests/index-form.property.l1.test.ts): For every string, the 3.x naming-schema version accepts it as an index exactly when it is a dot-separated run of digits
- [test-file-form](tests/test-file-form.property.l1.test.ts): For every file name under a node's `tests/` directory, both the 4.0 and the 3.x naming-schema version accept it exactly when it is `{core}.test.{ext}`, `test_{core}.{ext}`, or `{core}_test.{ext}`, where `{core}` is `{subject}.{evidence}.{level}` with an optional trailing `.{runner}`, `{subject}` and `{runner}` are any slug, `{evidence}` is `scenario`, `mapping`, `conformance`, `property`, or `compliance`, `{level}` is `l1`, `l2`, or `l3`, and `{ext}` is any word, a word being a lowercase letter followed by lowercase letters and digits and a slug one or more words joined by `-`
- [naming-schema-versions](tests/naming-schema-versions.property.l1.test.ts): For every methodology declaration on a line SPX reads, the naming-schema versions are totally ordered and each carries a self-contained set of accepted filename forms; the declaration selects its valid versions, and a name no valid version accepts is superseded when a version ordered before the declared target's accepts it

### Test.Compliance: naming version

- [naming-version-computed](tests/naming-version.compliance.l1.test.ts): ALWAYS: the dedicated naming-schema version the spec-tree library surface exposes is the member of the grammar registry's version set that the canonical function computes as the highest, wherever that member stands in the set, so a body that takes the first member, takes the last member, or names a fixed member selects a wrong member for some set

### Audit: grammar ownership

- kinds-flat-registry: ALWAYS: `SPEC_TREE_CONFIG.KINDS` is one flat `as const` object literal, `KIND_REGISTRY` projects from it, and every derived kind view comes from `KIND_REGISTRY`; a kind, suffix, category, label, or opening constant declared apart from it fails.
- vocabulary-through-grammar: ALWAYS: config descriptors, source adapters, tree assembly, state derivation, and projections receive Spec-Tree vocabulary through the versioned grammar or a test-scoped registry fixture; a module among them that takes a grammar token from any other source fails.
- no-parallel-token: NEVER: a Spec-Tree filename grammar token is declared in a module-local constant outside the grammar registry surface; each such constant fails.
