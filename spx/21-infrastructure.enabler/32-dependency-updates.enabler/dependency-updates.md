# Dependency Updates

PROVIDES a repository-root Renovate configuration that raises pull requests for outdated and vulnerable dependencies — vulnerability fixes at any time, routine updates batched on a weekly schedule
SO THAT the product's shipped artifacts and development toolchain
CAN stay on current, advisory-clear dependency versions without manual tracking

## Assertions

### Compliance

- ALWAYS: a repository-root Renovate configuration raises pull requests for outdated and vulnerable dependencies ([audit])
- ALWAYS: vulnerability-driven updates raise pull requests at any time, separate from the weekly schedule that batches routine updates ([audit])
- ALWAYS: non-major devDependency, GitHub Actions, and vulnerability updates merge automatically once required checks pass, while major-version updates and the pnpm package-manager bump require manual approval ([audit])
- NEVER: a second automated tool raises dependency pull requests alongside Renovate — Dependabot security updates stay disabled while Dependabot alerts remain the advisory source Renovate consumes ([audit])
