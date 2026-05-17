# Auto-Injection

PROVIDES automatic reading and printing of files listed in the `specs` and `files` arrays of a session's YAML front matter per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) on pickup
SO THAT session-claim and session-cli enablers
CAN deliver referenced file contents to the agent without additional read commands

## Assertions

### Scenarios

- Given a session whose frontmatter sets `specs:` and `files:` to non-empty arrays of paths that exist on disk, when `spx session pickup` is invoked without `--no-inject`, then every listed file's contents appear in stdout in a section delimited by the file's path ([test](tests/auto-injection.scenario.l1.test.ts))
- Given a session listing a path that does not exist on disk, when `spx session pickup` is invoked, then a warning naming the missing path is emitted to stderr and the pickup exits with code 0 per [`spx/36-session.enabler/21-auto-injection.adr.md`](../21-auto-injection.adr.md) ([test](tests/auto-injection.scenario.l1.test.ts))
- Given a session whose frontmatter has `specs: []` and `files: []`, when `spx session pickup` is invoked, then no injection section appears in stdout ([test](tests/auto-injection.scenario.l1.test.ts))
- Given a session whose frontmatter omits `specs` and `files`, when `spx session pickup` is invoked, then no injection section appears in stdout per the default-empty-array rule in [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/auto-injection.scenario.l1.test.ts))
- Given `spx session pickup --no-inject` is invoked on a session with non-empty `specs:` and `files:` arrays referencing real files, when pickup completes, then no listed file is opened (observed via a recording filesystem that counts reads) ([test](tests/auto-injection.scenario.l1.test.ts))

### Properties

- For every string `s` produced by the arbitrary `arbitraryNonFrontMatterContent`, `parseSessionMetadata(s).specs` equals `[]` and `parseSessionMetadata(s).files` equals `[]` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/auto-injection.property.l1.test.ts))
- For every YAML object whose `specs` key is any value other than an array of strings, `parseSessionMetadata` returns a result whose `specs` equals `[]`; the same holds for `files` ([test](tests/auto-injection.property.l1.test.ts))

### Compliance

- ALWAYS: pickup continues on missing files with a warning per [`spx/36-session.enabler/21-auto-injection.adr.md`](../21-auto-injection.adr.md) ([review])
- ALWAYS: `parseSessionMetadata` returns `specs` and `files` as arrays — `undefined` never appears in either slot per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/auto-injection.compliance.l1.test.ts))
- NEVER: cache injected file contents — every pickup reads the listed files fresh per [`spx/36-session.enabler/21-auto-injection.adr.md`](../21-auto-injection.adr.md) ([review])
- NEVER: inject files not listed in the session's `specs` or `files` arrays — only declared dependencies enter stdout per [`spx/36-session.enabler/21-auto-injection.adr.md`](../21-auto-injection.adr.md) ([review])
