# Draft

PROVIDES the `spx draft` command boundary for local draft operations on caller-named kinds
SO THAT every workflow that keeps a local working copy through SPX
CAN obtain the one file of a new draft before writing it, find retained drafts from any worktree, and delete an identified draft

## Assertions

### Test.Mapping: [packaged-draft-commands](tests/packaged-commands.mapping.l1.test.ts)

The packaged CLI exposes each draft operation as one `spx draft` command path, for every kind in the kind grammar.

| Case   | Command path                                |
| ------ | ------------------------------------------- |
| create | `spx draft create --kind <kind>`            |
| list   | `spx draft list`                            |
| delete | `spx draft delete --kind <kind> <draft-id>` |

### Test.Mapping: [list-selection-bound](tests/list-selection-bound.mapping.l1.test.ts)

`spx draft list` maps its selection options to the descriptors it emits and their order, from a store that holds more drafts of every kind than each bound, where newest means the greatest identifier.

| Case       | Selection options               | Descriptors emitted                                  |
| ---------- | ------------------------------- | ---------------------------------------------------- |
| default    | none                            | the 50 newest across every kind, newest first        |
| kind       | `--kind <kind>`                 | every descriptor of that kind, newest first          |
| limit      | `--limit <count>`               | the `<count>` newest across every kind, newest first |
| kind-limit | `--kind <kind> --limit <count>` | the `<count>` newest of that kind, newest first      |
| all        | `--all`                         | every descriptor of every kind, newest first         |
| kind-all   | `--kind <kind> --all`           | every descriptor of that kind, newest first          |

### Test.Property: draft results

- [draft-create-result](tests/change-cli.property.l1.test.ts): For every kind in the kind grammar of [`spx/25-outcomeeng.enabler/31-changes.enabler/32-change-drafts.enabler/21-draft-storage.pdr.md`](spx/25-outcomeeng.enabler/31-changes.enabler/32-change-drafts.enabler/21-draft-storage.pdr.md), `spx draft create --kind <kind>` takes no draft text and no input option, creates one empty draft file, emits one JSON draft descriptor carrying `kind`, `draftId`, a lowercase UUIDv7, and `path` of that file, and exits zero
- [draft-list-result](tests/change-cli.property.l1.test.ts): For every set of retained drafts, `spx draft list --all` emits one JSON array of every descriptor, and `spx draft list --kind <kind>` one JSON array of every descriptor of that kind, each in descending identifier order, newest first, each exits zero, and neither changes a draft
- [directory-context](tests/change-cli.property.l1.test.ts): For every worktree of one repository, `-C <worktree>` resolves every draft operation against that repository, so each worktree creates, lists, and deletes the same drafts, independently of the caller's ambient directory
- [kind-rejections](tests/change-cli.property.l1.test.ts): For every value outside the kind grammar, `spx draft create --kind <value>`, `spx draft list --kind <value>`, and `spx draft delete --kind <value> <draft-id>` exit nonzero with a diagnostic on standard error naming the value, and create or alter no draft
- [external-values-escaped](tests/change-cli.property.l1.test.ts): For every external value a draft command emits, its JSON result on standard output preserves the value as data, and its diagnostic on standard error escapes the value's external segments through the terminal-text primitive

### Test.Compliance: draft commands

- [draft-delete-result](tests/draft-commands.compliance.l1.test.ts): ALWAYS: `spx draft delete --kind <kind> <draft-id>` naming a retained draft removes only that kind's draft of that identifier, emits its deletion result as one JSON document, and exits zero
- [delete-absent](tests/draft-commands.compliance.l1.test.ts): ALWAYS: `spx draft delete --kind <kind> <draft-id>` whose `<draft-id>` is a lowercase UUIDv7 that names no draft of that kind reports that absence through the command's diagnostic on standard error, exits non-zero, and changes no draft
- [draft-command-rejections](tests/draft-commands.compliance.l1.test.ts): ALWAYS: an omitted kind on `create` or `delete`, an `--input` option on `create`, a `--limit` value that is not a positive integer, `--limit` together with `--all`, a missing delete operand, an unknown command, and an unsafe or malformed draft identifier, a UUID of a version other than 7 included, fail with nonzero status and actionable standard error without creating or altering a draft
- [no-standard-input](tests/draft-commands.compliance.l2.test.ts): NEVER: `spx draft create`, `spx draft list`, or `spx draft delete` reads standard input
- [content-untouched](tests/draft-commands.compliance.l1.test.ts): NEVER: a `spx draft` command reads, parses, or changes the content of a draft file
- [change-group-retired](tests/draft-commands.compliance.l2.test.ts): NEVER: `spx change` or `spx change draft` resolves as a command; invoking either fails as an unknown command

### Test.Scenario: listing order

- [default-list-newest-first](tests/listing.scenario.l1.test.ts):
  - Given a repository whose only drafts are `change/019a8b3c-4d5e-7f60-8a1b-2c3d4e5f6a7b`, `review/019a8b3c-5e6f-7a01-9b2c-3d4e5f6a7b8c`, and `change/019a8b3c-6f70-7b12-ac3d-4e5f6a7b8c9d`, created in that order
  - When `spx draft list` runs
  - Then it exits zero and emits one JSON array of exactly three descriptors, in the order `change/019a8b3c-6f70-7b12-ac3d-4e5f6a7b8c9d`, `review/019a8b3c-5e6f-7a01-9b2c-3d4e5f6a7b8c`, `change/019a8b3c-4d5e-7f60-8a1b-2c3d4e5f6a7b`
- [kind-list-newest-first](tests/listing.scenario.l1.test.ts):
  - Given the same three drafts
  - When `spx draft list --kind change --all` runs
  - Then it exits zero and emits one JSON array of exactly two descriptors, in the order `change/019a8b3c-6f70-7b12-ac3d-4e5f6a7b8c9d`, `change/019a8b3c-4d5e-7f60-8a1b-2c3d4e5f6a7b`

### Test.Scenario: absent deletion

- [delete-absent-draft](tests/listing.scenario.l1.test.ts):
  - Given a repository whose only draft is `change/019a8b3c-4d5e-7f60-8a1b-2c3d4e5f6a7b`
  - When `spx draft delete --kind change 019a8b3c-7081-7c23-bd4e-5f6a7b8c9dae` runs
  - Then it exits non-zero, writes one diagnostic to standard error naming the absent draft `change/019a8b3c-7081-7c23-bd4e-5f6a7b8c9dae`, and `spx draft list --all` then emits exactly one descriptor, `change/019a8b3c-4d5e-7f60-8a1b-2c3d4e5f6a7b`

### Audit: command layer

- list-bound-in-handler: ALWAYS: the `spx draft list` handler applies the selection bound to the complete listing the draft capability returns; a bound the capability applies, or a capability call that receives the bound, fails.
- command-vocabulary-declaration: ALWAYS: the `draft` command name, its operation names, its option names, and its operand tokens each have one source-owned declaration that the descriptor and the handlers import; a literal of that vocabulary repeated in another module fails.
