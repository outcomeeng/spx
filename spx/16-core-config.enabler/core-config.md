# Core Config

PROVIDES a typed configuration schema with embedded defaults for directory paths and project structure
SO THAT all CLI commands and validation steps
CAN resolve spec trees, session directories, and work item locations without hardcoded paths

## Assertions

### Scenarios

- Given no user configuration, when a command resolves paths, then DEFAULT_CONFIG supplies all required directory paths ([test](tests/config-schema.unit.test.ts))
- Given DEFAULT_CONFIG, when accessing any path property, then the value is a non-empty string ([test](tests/config-schema.unit.test.ts))

### Properties

- DEFAULT_CONFIG is structurally complete: every path category (specs, sessions, decisions) has all required fields ([test](tests/config-schema.unit.test.ts))
- SpxConfig interface and DEFAULT_CONFIG are type-consistent: the constant satisfies the interface without assertion ([test](tests/defaults.unit.test.ts))
