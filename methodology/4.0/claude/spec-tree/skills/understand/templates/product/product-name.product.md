# {Product Name}

## Why this product exists

{What problem this product solves for users. State as permanent product truth — not a gap to fill but a value to provide.}

## Consumers and jobs

Who consumes this product, and the job each hires it for. Name distinct personas, not a single "user".

| Consumer / persona | Job to be done                      |
| ------------------ | ----------------------------------- |
| {persona}          | {the job they hire the product for} |

## Surfaces

The surfaces through which consumers reach the product (web UI, CLI, API, library, embedded widget, file output, …). Surfaces are user-facing decomposition axes; code packages are not.

- {surface} — {which consumers use it, for what}

## Actors and sidedness

Whether the product serves one party or several (single-party tool, two-sided or multi-party marketplace, admin vs end-user, producer vs consumer). Name each actor and what they exchange.

- {actor} — {role; what they provide or receive}

## Product hypothesis

WE BELIEVE THAT {what this product provides — stated as permanent capability}
WILL {outcome — measurable change in user behavior, with metric and threshold}
CONTRIBUTING TO {impact — business KPI with target and timeframe, e.g. dollars, NRR, conversion rate}

### Evidence of success

| Metric   | Current    | Target | Measurement approach |
| -------- | ---------- | ------ | -------------------- |
| {metric} | {baseline} | {goal} | {how to measure}     |

## Scope

### What's included

Capabilities grouped by the consumer and surface they serve. `/decompose` maps these to enabler or outcome nodes — they are decomposition inputs, not a pre-assigned node list.

- {capability} — {consumer / surface it serves}

### What's excluded

| Excluded        | Rationale                                |
| --------------- | ---------------------------------------- |
| {excluded item} | {why it's out of scope for this product} |

## Product-level assertions

Cross-cutting assertions that span the entire tree. Product-level assertions are typically Compliance rules. Add other assertion types only when they span the entire tree.

### Compliance

- ALWAYS: {product-wide behavioral rule} — {why}
- NEVER: {product-wide prohibition} — {why}

## Open decisions

| Decision topic  | Key question          | Options               | Triggers ADR/PDR? |
| --------------- | --------------------- | --------------------- | ----------------- |
| {decision area} | {what needs deciding} | {option A / option B} | {yes/no}          |
