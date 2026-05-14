# Domain Path Filters

PROVIDES config-backed domain path-filter inputs to the file-inclusion resolver
SO THAT validation, testing, auditing, and reviewing
CAN select paths through shared mechanics while preserving descriptor-owned policy

## Assertions

### Compliance

- ALWAYS: a consumer-supplied path filter records include and exclude matches in the scope decision trail ([review])
- ALWAYS: explicit caller-supplied paths bypass domain path filters and remain included ([review])
- ALWAYS: file inclusion receives typed path-filter values from callers and does not read `spx.config.*` directly ([review])
- NEVER: apply one domain's path filter to another domain unless that domain explicitly passes the same descriptor section ([review])
- NEVER: read `spx/EXCLUDE` or another standalone ignore-source file to decide path scope ([review])
