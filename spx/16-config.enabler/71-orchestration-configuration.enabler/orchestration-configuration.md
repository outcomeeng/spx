---
id: 01a17f2f-eb4a-7dad-aeed-a451e714bc90
malleability: spec
---

# Orchestration Configuration

PROVIDES the machine-local orchestration configuration contract — the per-store orchestration file, its settings, and its recorded status
SO THAT the SPX command surface, agent sessions, and orchestration controllers
CAN resolve and report one machine's configuration without reading repository-local files

## Assertions

- `spx orchestration` is the top-level interface for the local machine's orchestration configuration and status. `spx orchestration show` reports the resolved configuration and its source, and `spx orchestration status` reports the recorded state with unavailable observations identified explicitly.
- SPX resolves exactly one orchestration file for the effective checkout's Change Store: `$XDG_CONFIG_HOME/engineering.outcome/<owner>/<store>/orchestration.toml`, with `XDG_CONFIG_HOME` defaulting to `~/.config`. The owner and store components come from the validated SPX configuration binding.
- The file holds the machine's Position configuration and status for that store. Position entries identify their worktrees and harnesses, mail display names and addresses, and configuration needed by their controllers. A Position's Product and store resolve from SPX configuration at its checkout; repositories, Product overlays, and the Change Store hold no machine Position roster.
- Settings include operator availability and configurable controller and mail polling intervals. Status reports recorded Position and controller state distinctly from configuration, including observation time or an explicit unknown value. A read command starts no controller and grants no authority.
- `spx orchestration operator set --away` records that the operator is away for the resolved store on this machine; `spx orchestration operator set --available` records availability, and `spx orchestration operator status` reports it. The two setter flags are mutually exclusive. Availability changes do not themselves authorize actions or alter the controller's operating policy.
- Each command reads or changes only the resolved store's file. A Position entry whose checkout resolves to another store is rejected with a diagnostic. No command silently searches another store's file or falls back to repository-local orchestration settings.
- An absent orchestration file is reported as unconfigured, with its resolved absolute path. A malformed file is reported with its path and reason and is never replaced by defaults or overwritten by a setter.
- A setter changes only its named setting, preserves unrelated configuration and status, and writes atomically without discarding a concurrent update. It reports the effective value and absolute file path. Creating an absent file initializes only the required structure and requested setting and creates no Position or authorization.
- Shipped skills consume SPX's resolved interface. The orchestration file holds configuration and status only; operating prose and Orders remain outside it, and skills remain in plugins.
- Repository-shared `.spx` beside a bare Git repository and the machine-local orchestration file are distinct locations. Orchestration resolution requires no repository-local `.spx/orchestration` file.
- The resolved settings retain `shutdown`, `focus`, `ceiling`, `eligible_priorities`, `pace`, `restart_interval_seconds`, `delegation`, and `open_change_limit`, alongside operator availability, machine Positions, and controller and mail polling intervals. Product-scoped policies are evaluated against the Product resolved from a Position's checkout.
- `shutdown` defaults to false and records whether new Applier starts are disabled. `focus` defaults to an empty list and otherwise limits starts to its canonical Change identities. `eligible_priorities` defaults to Blocker and Urgent, takes names from the store's Priority options, and applies independently of focus.
- `ceiling` is an integer of at least one, has no default, and bounds Changes in execution for the resolved Product. `open_change_limit` is independently an integer of at least one, has no default, and bounds the Product's open Changes, whose Lifecycle is neither Applied nor Abandoned. Its absence means no configured creation limit; it never enters the list of required unset settings.
- `pace` has no default. When configured, its `percent_per_hour` is greater than zero and at most 100; an optional night schedule names an IANA timezone, start and end hours from zero through 23, and its own percentage in that domain. `restart_interval_seconds` is a positive integer defaulting to 900.
- Delegation records retain the delegate working directory, agent-mail address and project path, and authorizations with an act and either case-by-case or until-further-notice scope. A case-by-case authorization names its case and expires after that act; removing an until-further-notice authorization ends it. An absent authorization grants nothing.
- Mail polling uses a positive configurable interval with a five-second default. Polling and controller scheduling execute outside model turns; SPX exposes their settings and recorded status without starting them during a read.
- A resolved view reports the absolute orchestration file path, whether it is present, resolved settings, required unset settings, and status separately. Missing `ceiling` remains explicitly unset and conveys no permission to start work. An absent file remains visibly unconfigured even when individual settings have defaults.
- Unknown keys, wrong types, and out-of-domain values produce diagnostics naming the file, key, and reason. Invalid values never silently become defaults.
- SPX reports configured limits and authorizations. The consuming controller enforces start, creation, pacing, and delegation policy; neither configuration resolution nor an operator availability setter grants an authorization.
