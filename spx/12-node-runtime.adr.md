# Node Runtime Target

spx runs on the active Node.js LTS release lines — Node 22 and Node 24 — with a minimum of 22.13.0. The published package's `engines.node` constraint declares that floor, the continuous-integration test matrix exercises each supported LTS line, and the publish workflow runs on the highest supported line.

## Rationale

spx supports only even-numbered LTS lines, which receive long-term security maintenance; odd-numbered and pre-release lines are excluded so the product is exercised only on runtimes that stay patched. The 22.13.0 floor is the highest minimum any production dependency requires on the 22 line. Declaring the floor in `engines` while testing each supported line in the matrix keeps the published minimum and the exercised runtimes in agreement, so a contributor on a runtime below the floor is warned at install and every supported line is proven in CI. The publish workflow runs on the highest supported line because OIDC Trusted Publishing requires a newer npm than the lower lines ship.

## Verification

### Audit

- ALWAYS: the published `engines.node` constraint equals the dependency-tree floor — the highest minimum version any production dependency declares on the lowest supported major ([audit])
- ALWAYS: the `@types/node` version declared in `devDependencies` has a major equal to the lowest Node major the `engines.node` floor admits, so project code is typed against the lowest supported runtime and cannot compile against an API absent from it ([audit])
- ALWAYS: the continuous-integration matrix exercises each active Node LTS line spx supports, and the publish workflow runs on the highest supported LTS line because OIDC Trusted Publishing requires a newer npm than the lower lines ship ([audit])
- NEVER: the continuous-integration matrix exercises, or the publish workflow runs on, a Node line below the `engines.node` floor or outside the active LTS lines ([audit])
