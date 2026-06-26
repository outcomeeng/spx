# Node Runtime Target

spx runs on the Active Node.js LTS release line — Node 24 — with a minimum of 24.0.0. The published package's `engines.node` constraint declares that floor, the continuous-integration verification exercises that line, and the publish workflow runs on it.

## Rationale

spx targets the single Node.js release line in Active LTS — the line receiving active maintenance — so the product is exercised only on the runtime its users should run; Maintenance LTS, odd-numbered, and pre-release lines are excluded. The 24.0.0 floor is the highest minimum any production dependency requires on the supported major. Declaring the floor in `engines` while exercising the supported line in CI keeps the published minimum and the exercised runtime in agreement, so a contributor on a runtime below the floor is warned at install and the supported line is proven in CI. The publish workflow runs on the supported line because OIDC Trusted Publishing requires the newer npm that line ships.

## Verification

### Audit

- ALWAYS: the published `engines.node` constraint equals the dependency-tree floor — the highest minimum version any production dependency declares on the supported Node major ([audit])
- ALWAYS: the `@types/node` version declared in `devDependencies` has a major equal to the supported Node major the `engines.node` floor admits, so project code is typed against the supported runtime and cannot compile against an API absent from it ([audit])
- ALWAYS: the continuous-integration verification exercises the Active LTS line spx supports, and the publish workflow runs on that line because OIDC Trusted Publishing requires the newer npm it ships ([audit])
- NEVER: the continuous-integration verification exercises, or the publish workflow runs on, a Node line below the `engines.node` floor or outside the Active LTS line spx supports ([audit])
