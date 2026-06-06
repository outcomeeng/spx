# Release

PROVIDES per-release generation of release notes and documentation updates from the product's git history, plus governed publication
SO THAT every capability the product ships
CAN reach users as a released version carrying accurate, current release information

## Assertions

### Compliance

- ALWAYS: a release derives its contents from the product's git history — commits, tags, and version — so a release describes the product without depending on any domain ([audit])
- ALWAYS: release notes, documentation updates, and publication operate from one shared release-data description, so they agree on what the release contains ([audit])
- NEVER: require network access or a separately installed tool to compute release data — the computation runs locally and in CI from the bundled CLI ([audit])
- NEVER: gate a release on a domain (validation, testing, audit, reviewing) within the spec tree — running those gates before a release is the product exercising its own commands, not a release dependency ([audit])
