#!/bin/zsh
# usage: capture.sh <RUN dir, relative to the worktree root>
cd /Users/shz/Code/outcomeeng/spx/worktrees/change-320-probe || exit 1
RUN="$1"
capture() { out="$1"; shift; "$@" > "$RUN/$out" 2> "$RUN/$out.stderr"; echo "$?" > "$RUN/$out.exit"; }
T2=spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler
T3=spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler
T4=spx/18-state.enabler/32-worktree-topology.enabler
capture t0.show.txt tsx src/cli.ts spec context show
capture t0.show.json tsx src/cli.ts spec context show --json
for pair in "t1 spx/" "t2 $T2" "t3 $T3" "t4 $T4"; do
  id=${pair%% *}; tgt=${pair#* }
  capture $id.show.txt tsx src/cli.ts spec context show $tgt
  capture $id.show.json tsx src/cli.ts spec context show $tgt --json
  capture $id.list.txt tsx src/cli.ts spec context list $tgt
  capture $id.list.json tsx src/cli.ts spec context list $tgt --json
done
capture t5.show.txt tsx src/cli.ts spec context show $T2 $T3 $T4
capture t5.show.json tsx src/cli.ts spec context show $T2 $T3 $T4 --json
capture t5.list.txt tsx src/cli.ts spec context list $T2 $T3 $T4
capture t5.list.json tsx src/cli.ts spec context list $T2 $T3 $T4 --json
capture t5.reversed.show.txt tsx src/cli.ts spec context show $T4 $T3 $T2
cmp "$RUN/t5.show.txt" "$RUN/t5.reversed.show.txt"; echo "cmp exit=$?"
for f in "$RUN"/*.exit; do printf "%s %s bytes=%s\n" "$(basename $f)" "$(cat $f)" "$(wc -c < ${f%.exit})"; done
