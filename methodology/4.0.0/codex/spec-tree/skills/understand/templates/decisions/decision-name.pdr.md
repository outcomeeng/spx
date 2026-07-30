# {Decision Name}

{The decision, stated directly as permanent truth in 1-3 sentences — what product behavior it governs and what it decides. State user-observable behavior, not implementation. No "This PDR governs..." preamble.}

## Rationale

{Answer in one or two sentences: Why is this the right decision? Name a rejected alternative only when it sharpens the decision and is not self-evident.}

## Product properties

{Ordered list — no more than 3 items; omit section if it would be redundant with the decision.}

1. {First observable property a product implementing this decision must exhibit}
2. {Second observable property a product implementing this decision must exhibit}
3. {Third observable property a product implementing this decision must exhibit}

## Verification

{Each rule is an ALWAYS guarantee or a NEVER boundary, under the one subsection naming how it is verified. Include only the subsections that apply. They are ordered by decreasing enforcement strength.}

### Testing

{Verified by a deterministic test. `/verify` selects test from the real subject's verdict; `/test` then selects each rule's assertion type — one of `scenario`, `mapping`, `conformance`, `property`, `compliance` — from the rule's quantifier before `/test-{language}` supplies language expression. The heading never determines the assertion type. Do not include test files; these belong to the specs implementing this PDR.}

- ALWAYS: {rule} ([{assertion type}])
- NEVER: {prohibition} ([{assertion type}])

### Eval

{Verified by graded LLM behavior over curated cases — the subject is a skill, agent, or classifier whose output has a parseable contract.}

- ALWAYS: {rule} ([eval])
- NEVER: {prohibition} ([eval])

### Audit

{Verified by an audit skill's judgment against this decision — the subject (a Spec Tree decision, spec, skill, or agent) admits no deterministic test or graded eval.}

- ALWAYS: {rule} ([audit])
- NEVER: {prohibition} ([audit])
