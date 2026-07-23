# Dependency Updates

PROVIDES a repository-root Renovate configuration that raises pull requests for outdated and vulnerable dependencies — routine updates held until a minimum release age and throttled by per-hour and concurrency limits, vulnerability fixes at any time
SO THAT the product's shipped artifacts and development toolchain
CAN stay on current, advisory-clear dependency versions without manual tracking

## Assertions

- ALWAYS: a repository-root Renovate configuration raises pull requests for outdated and vulnerable dependencies ([audit])
- ALWAYS: vulnerability-driven updates raise pull requests at any time and carry a security label ([audit])
- ALWAYS: routine updates across every manager are withheld until a release reaches a minimum age, while vulnerability fixes bypass the wait ([audit])
- ALWAYS: non-major devDependency, GitHub Actions, and vulnerability updates merge automatically once their continuous-integration checks pass, while every major-version update — including a major vulnerability fix — and the pnpm package-manager bump require manual approval ([audit])
- ALWAYS: routine automerges execute inside the daily early-morning window between 03:00 and 07:00 Europe/Zurich time, while vulnerability-fix automerges execute at any hour ([audit])
- ALWAYS: third-party GitHub Actions are referenced by a pinned commit digest, while the product's own outcomeeng/gh-actions reusable workflows are referenced at their development branch and excluded from digest pinning, so the product integrates changes to the actions it controls without a per-change pull request ([audit])
- NEVER: a second automated tool raises dependency pull requests alongside Renovate — Dependabot security updates stay disabled while Dependabot alerts remain the advisory source Renovate consumes ([audit])
