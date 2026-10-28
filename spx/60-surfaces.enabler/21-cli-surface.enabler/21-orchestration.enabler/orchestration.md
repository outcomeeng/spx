---
id: 01a16911-762c-7935-b477-12fdd8bc4fa9
malleability: spec
---

# Orchestration

PROVIDES the `spx orchestration` command paths — `lock -- <command> [arguments...]` with its argument grammar `--run-id`, `--wait-seconds`, and `-C`, its help, and the pass-through of the guarded command's standard streams and exit code as the command-line binding of the host command lock, and `show`, `status`, and `operator` as the command-line binding of the orchestration configuration
SO THAT agent sessions, automation, and practitioners across every repository and worktree of one host
CAN run any heavy command under the one host-wide slot by prefixing it with one command, receiving the command's own output and exit code and one terminal result line, and read and change one machine's orchestration configuration through the same command namespace

## Assertions

- Given `spx orchestration lock -- <command> [arguments...]`, when it runs, then exactly that argument vector runs under the host command lock, and its standard streams and exit code pass through ([test](tests/lock-command.scenario.l1.test.ts))
- Given `--run-id <id>`, when the run ends, then the result line carries that id, and without `--run-id` it carries a generated id
- Given `-C <path>` or an invocation outside any git repository, when it runs, then the child's working directory is the effective invocation directory, and no product-root warning is written
- Given `--wait-seconds <n>`, when `n` is a positive integer at most the default cap, then the wait cap is `n` seconds; any other value fails before start with a diagnostic naming the option
- NEVER: an invocation without `--` or without a command after it starts anything; it fails with a usage diagnostic
- ALWAYS: `spx orchestration lock --help` documents the invocation shape, `--run-id`, `--wait-seconds`, the result line, and the exit codes
- ALWAYS: the command binds the host command lock through its public surface and owns no slot, load, or result semantics
- Given `spx orchestration show`, `spx orchestration status`, or `spx orchestration operator status`, when it runs in a checkout, then it reports the resolved store's orchestration file as `spx/16-config.enabler/71-orchestration-configuration.enabler/orchestration-configuration.md` states, writes nothing, and starts no controller
- Given `spx orchestration operator set --away` or `spx orchestration operator set --available`, when it runs, then it changes only the operator availability setting of the resolved store's file, and both flags together fail with a usage diagnostic naming them
- ALWAYS: the `show`, `status`, and `operator` command paths bind the orchestration-configuration contract through its public surface and own no file path, setting, or status semantics
