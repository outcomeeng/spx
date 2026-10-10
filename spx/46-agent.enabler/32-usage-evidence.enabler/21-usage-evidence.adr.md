# Usage Evidence

Claude Code token usage evidence is a deterministic accounting over the Claude Code transcript store that [`spx/46-agent.enabler/agent.md`](spx/46-agent.enabler/agent.md) resolves from `CLAUDE_CONFIG_DIR`. The accounting unit is the request: records sharing one request identity are one request, accounted once. A request's identity is the record's `requestId`, and where that field is absent, the assistant message's `message.id`. A usage-bearing record carrying neither field has no request identity; it is reported as unsupported and enters no total.

Every token total — uncached input, cache read, cache write, output — is proven by tracing alone: the total names the transcript records it sums, and no second source reconciles it. The accounting reads transcripts and never writes them. It requires no network access.

One import reads at most a budget of transcript bytes, with a product default and a caller override. The import returns an opaque cursor naming where it stopped; the next import passes the cursor back and resumes from it. SPX persists no usage state, so the cursor is the only carrier of resume position and no `.spx/` state class arises.

Per request, bounded tool evidence carries each tool use's name, tool-use ID, result byte size, and error flag, and never tool input or tool output content. A request carries at most 50 entries and the count of entries beyond them.

The interface is a command, `spx agent usage`, whose JSON output carries an integer interface version. The command is the boundary a consumer process reaches as a subprocess with structured output; the TypeScript library behind it is internal and no part of the interface. Adding a field keeps the version. Removing a field, renaming a field, or changing a field's meaning raises the version by one. A caller selects a version with an option; SPX serves the current version and the one before it, and any other requested version fails with a diagnostic naming the served versions. A superseded version stays served until the release after the one that introduced its successor.

## Rationale

Claude Code writes one transcript record per content block of a response, so a response with text and several tool uses repeats its usage on every record. Summing records over-counts; keying on the request identity counts each response once. `requestId` is the field Claude Code writes for the request; `message.id` identifies the same response where `requestId` is absent. A usage-bearing record with neither field cannot be tied to one request, so counting it would either double-count or invent an identity; reporting it as unsupported keeps every total honest and the gap visible.

Tracing is the sufficient proof because the transcripts are the only source of the totals. A second source, such as a billing endpoint, would need network access, which core operations never require under [`spx/spx.product.md`](spx/spx.product.md), and would make a total depend on external availability rather than on the records it names.

A transcript store grows without bound and a session may still be appending to it. A byte budget bounds the work of one import regardless of store size, and an opaque cursor lets the next import continue where the previous one stopped without SPX storing anything between invocations. Keeping the position in the result rather than in `.spx/` avoids a new state class and makes the import a pure function of the transcripts and the cursor. A record that arrives after the cursor passed its position, or that a cursor cannot locate, is a named gap rather than a silent loss.

Tool evidence supports attributing cost to the tools that caused it. Names, IDs, sizes, and error flags answer that question without copying tool input or output, which can hold secrets or arbitrarily large content. The 50-entry bound plus the overflow count keeps a request's evidence bounded while preserving the fact that more existed.

The consumer is a coding-agent plugin process, so a subprocess with structured output is the boundary it can reach. Exposing the TypeScript library would bind the consumer to SPX's internal module shapes. An integer version with an additive-keeps, breaking-raises rule lets a consumer detect incompatibility mechanically, and serving the preceding version for one release gives it time to move.

## Invariants

- A request's accounted totals are a deterministic function of the transcript records bearing its request identity.
- Every usage-bearing record is either accounted under exactly one request identity or reported as unsupported.
- Importing leaves every source transcript byte-identical.
- Resuming from a returned cursor never accounts a record that an earlier import already accounted.

## Verification

- ALWAYS: records sharing one request identity are accounted as one request, so repeating a response's usage across its content-block records does not change the request's totals
- ALWAYS: a request's identity is the record's `requestId`, and the assistant message's `message.id` where `requestId` is absent
- ALWAYS: a usage-bearing record with neither `requestId` nor `message.id` is reported as unsupported and enters no total
- ALWAYS: each token total names the transcript records it derives from
- ALWAYS: one import reads at most the transcript-byte budget, taken from the product default or the caller override, and returns an opaque cursor from which the next import resumes
- ALWAYS: tool evidence per request carries each tool use's name, tool-use ID, result byte size, and error flag, bounded to 50 entries plus the count of entries beyond them
- ALWAYS: the `spx agent usage` JSON output carries the integer interface version, and SPX serves the current version and the one before it
- ALWAYS: a request for a version other than a served version fails with a diagnostic naming the served versions
- NEVER: usage accounting writes to a source transcript
- NEVER: usage accounting persists usage state under `.spx/`, because the cursor returned to the caller carries the resume position
- NEVER: usage accounting requires network access or reconciles a total against a second source
- NEVER: tool evidence carries tool input or tool output content
- NEVER: the TypeScript library behind `spx agent usage` is treated as part of the consumer-facing interface
- NEVER: removing, renaming, or changing the meaning of an interface field keeps the interface version
