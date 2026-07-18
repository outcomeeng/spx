# Changelog

## [0.6.20]

### Added

- Source graph analysis now includes TypeScript support, collecting coverage and reachability facts and following declared TypeScript provider contracts.

### Fixed

- Source graph provider registry is now exposed as an enumeration view, making registered providers easier to discover.
- Registered source graph provider descriptors are now uniformly invokable.
- Fixed a source graph issue where the drive-letter fallback was not correctly guarded against empty values.
- Improved reliability of release documentation generation: version numbers and prompt data are now correctly escaped and encoded, and documentation version instructions are stated exactly and encoded consistently.

### Security

- Agent file reads are now gated to stay within the working directory.
- File-editing tools used during release documentation generation are now restricted to non-interactive, contained operations.
