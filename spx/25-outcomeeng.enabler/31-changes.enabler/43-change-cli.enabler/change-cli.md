# Change CLI

PROVIDES the `spx change draft` command boundary for local draft operations
SO THAT authoring workflows invoking SPX
CAN supply draft text through stdin, recover returned file coordinates, and delete an identified working draft

## Assertions

### Properties

- The create command with `--input stdin` reads the supplied text and emits one JSON draft descriptor; list emits a JSON array of descriptors; delete with one managed ID emits its deletion result, and each successful operation exits zero ([test](tests/change-cli.property.l1.test.ts)).
- ALWAYS: omitted or unsupported create input selection, missing delete operands, unknown commands, and unsafe draft identifiers fail with nonzero status and actionable stderr without altering an existing draft ([test](tests/change-cli.property.l1.test.ts)).
- ALWAYS: `-C` resolves every draft operation against the selected working copy, independently of the caller's ambient directory ([test](tests/change-cli.property.l1.test.ts)).

### Compliance

- ALWAYS: `src/interfaces/cli/change.ts` owns command grammar and process I/O, `src/commands/change/` adapts requests to the draft capability, and no CLI or handler constructs a hosted Change backend or parses draft metadata ([audit]).
