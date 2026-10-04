#!/usr/bin/env bash
# Runs protocol steps 4 to 6 and the argument-order observation. Takes no argument.
# Run it with the run directory under runs/ as the working directory; it writes the captures there.
RUN="$(pwd -P)"
ROOT="$(git rev-parse --show-toplevel)"
PROBE="$ROOT/spx/31-spec-domain.enabler/43-context-ingestion.enabler/probes/context-fidelity"
case "$RUN" in
  "$PROBE"/runs/*) ;;
  *) echo "run this script with a run directory under the probe's runs/ as the working directory" >&2; exit 1 ;;
esac
cd "$ROOT" || exit 1
capture() { out="$1"; shift; "$@" > "$RUN/$out" 2> "$RUN/$out.stderr"; echo "$?" > "$RUN/$out.exit"; }
T2=spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler
T3=spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler
T4=spx/18-state.enabler/32-worktree-topology.enabler
capture t0.show.txt tsx src/cli.ts spec context show
capture t0.show.json tsx src/cli.ts spec context show --json
capture t1.show.txt tsx src/cli.ts spec context show spx/
capture t1.show.json tsx src/cli.ts spec context show spx/ --json
capture t1.list.txt tsx src/cli.ts spec context list spx/
capture t1.list.json tsx src/cli.ts spec context list spx/ --json
capture t2.show.txt tsx src/cli.ts spec context show "$T2"
capture t2.show.json tsx src/cli.ts spec context show "$T2" --json
capture t2.list.txt tsx src/cli.ts spec context list "$T2"
capture t2.list.json tsx src/cli.ts spec context list "$T2" --json
capture t3.show.txt tsx src/cli.ts spec context show "$T3"
capture t3.show.json tsx src/cli.ts spec context show "$T3" --json
capture t3.list.txt tsx src/cli.ts spec context list "$T3"
capture t3.list.json tsx src/cli.ts spec context list "$T3" --json
capture t4.show.txt tsx src/cli.ts spec context show "$T4"
capture t4.show.json tsx src/cli.ts spec context show "$T4" --json
capture t4.list.txt tsx src/cli.ts spec context list "$T4"
capture t4.list.json tsx src/cli.ts spec context list "$T4" --json
capture t5.show.txt tsx src/cli.ts spec context show "$T2" "$T3" "$T4"
capture t5.show.json tsx src/cli.ts spec context show "$T2" "$T3" "$T4" --json
capture t5.list.txt tsx src/cli.ts spec context list "$T2" "$T3" "$T4"
capture t5.list.json tsx src/cli.ts spec context list "$T2" "$T3" "$T4" --json
capture t5.reversed.show.txt tsx src/cli.ts spec context show "$T4" "$T3" "$T2"
cmp "$RUN/t5.show.txt" "$RUN/t5.reversed.show.txt"; echo "cmp exit=$?"
for f in "$RUN"/*.exit; do printf "%s %s bytes=%s\n" "$(basename "$f")" "$(cat "$f")" "$(wc -c < "${f%.exit}")"; done
