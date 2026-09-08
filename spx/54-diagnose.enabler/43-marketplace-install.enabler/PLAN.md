# Plan: marketplace install check

## Pending steps

1. Report a plugin, plugin cache, or marketplace clone under the repository as a
   broken-bucket defect naming the path and the agent home spx sets for that coding
   agent, per `spx/12-agent-harness.pdr.md`. The probe inspects the project-scoped
   install locations each coding agent uses under the repository root (`.codex/`,
   `.claude/`) for plugin content; tracked configuration files there are not defects.
   Route the new assertion through `/apply` and `/verify` before adding evidence.
