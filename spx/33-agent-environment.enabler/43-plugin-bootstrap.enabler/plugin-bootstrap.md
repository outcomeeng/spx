# Plugin Bootstrap

PROVIDES deterministic bootstrap of configured plugin marketplaces, plugins, and skills
SO THAT agent runtimes launched or prepared by spx
CAN depend on required local capabilities without manual installation steps

## Assertions

### Compliance

- ALWAYS: plugin bootstrap distinguishes configured marketplace, plugin, and skill entries by type and target runtime ([review])
- ALWAYS: bootstrap reports installed, missing, stale, and failed entries deterministically ([review])
- NEVER: silently install network-fetched capabilities during offline core operations ([review])
