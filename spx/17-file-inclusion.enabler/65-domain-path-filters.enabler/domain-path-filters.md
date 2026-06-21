# Domain Path Filters

PROVIDES config-backed domain path-filter inputs to the file-inclusion resolver
SO THAT validation and testing
CAN select paths through shared mechanics while preserving descriptor-owned policy and layering domain-specific filtering on top of the git-tracking default

## Assertions

### Compliance

- ALWAYS: a consumer-supplied path filter records include and exclude matches in the scope decision trail ([review])
- ALWAYS: explicit caller-supplied paths bypass domain path filters and remain included ([review])
- ALWAYS: file inclusion receives typed path-filter values from callers and does not read `spx.config.*` directly ([review])
- ALWAYS: a domain path filter layers on top of the git-tracking default — it narrows or restricts within the git-tracked set, never replaces git's view as the default scope source per `../11-ignore-defaults.pdr.md` ([review])
- NEVER: apply one domain's path filter to another domain unless that domain explicitly passes the same descriptor section ([review])
- NEVER: a domain path filter expands scope beyond the git-tracked set — operators who want ignored entries processed pass `--no-ignore`, `--no-ignore-vcs`, or `--ignore-file` per `../11-ignore-defaults.pdr.md`, not a domain filter `include` pattern ([review])
