# Dependency Updates

PROVIDES a repository-root Renovate configuration that raises pull requests for outdated and vulnerable dependencies as updates are found, bounded by per-hour and concurrency limits
SO THAT the product's shipped artifacts and development toolchain
CAN stay on current, advisory-clear dependency versions without manual tracking

## Assertions

- ALWAYS: a repository-root Renovate configuration raises pull requests for outdated and vulnerable dependencies ([audit])
- ALWAYS: vulnerability-driven updates raise pull requests at any time and carry a security label ([audit])
- ALWAYS: non-major devDependency, GitHub Actions, and vulnerability updates merge automatically once their continuous-integration checks pass, while every major-version update — including a major vulnerability fix — and the pnpm package-manager bump require manual approval ([audit])
- NEVER: a second automated tool raises dependency pull requests alongside Renovate — Dependabot security updates stay disabled while Dependabot alerts remain the advisory source Renovate consumes ([audit])
