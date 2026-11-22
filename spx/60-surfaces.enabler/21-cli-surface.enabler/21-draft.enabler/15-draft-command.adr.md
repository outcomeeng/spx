# Draft Command

CONSTRAINS the `spx draft` command layer over the draft capability
TO handlers that adapt each request to the capability's library surface and apply the list bound themselves, and a descriptor that reads no standard input
SO THAT no draft text enters SPX through a command, and the list bound, the output escaping, and the command vocabulary each have one home

## Verification

### Test.Compliance: input

- no-standard-input: NEVER: the `draft` descriptor or a `draft` command handler reads standard input.

### Test.Property: output

- external-values-escaped: For every external value a draft command emits, returned JSON preserves the value as data, and human-facing error text escapes its external segments through the terminal-text primitive.

### Audit: command layer

- list-bound-in-handler: ALWAYS: the `draft` list handler applies the listing bound the command surface declares to the complete listing the capability returns.
- command-vocabulary-declaration: ALWAYS: the `draft` command vocabulary, its command, operation, option, and operand tokens, has one source-owned declaration.
