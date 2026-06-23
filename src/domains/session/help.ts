/**
 * Shared help text for session commands.
 *
 * Centralizes help text to ensure consistency across subcommands.
 *
 * @module domains/session/help
 */

/**
 * Session file format description for the main session help.
 */
export const SESSION_FORMAT_HELP = `
Session File Format:
  Sessions are markdown files with YAML frontmatter for metadata.

  ---
  priority: high
  git_ref: main
  goal: Fix the failing release check
  next_step: Run the focused session tests
  specs: []
  files: []
  ---
  # Session Title

  Session content...

Workflow:
  1. handoff  - Create session (todo) — JSON header + body on stdin
  2. pickup   - Claim session (todo -> doing)
  3. release  - Return session (doing -> todo)
  4. archive  - Move session to archive
  5. delete   - Remove session permanently
`;

/**
 * Input contract for the handoff command.
 */
export const HANDOFF_FRONTMATTER_HELP = String.raw`
Usage:
  Pipe a JSON header followed by the body bytes to stdin.

  The header is a single JSON object holding caller-supplied structured fields.
  A single LF or CRLF after the header is consumed as a separator. The body
  is the remaining bytes verbatim — no YAML, no escape rules, no ambiguity
  from leading characters like '#' or '---'.

JSON Header Fields:
  priority    "high" | "medium" | "low" (default: medium)
  goal        required, non-empty string
  next_step   required, non-empty string
  specs       optional string[], for pickup auto-injection
  files       optional string[], for pickup auto-injection

Prefilled by the CLI:
  created_at, git_ref, and agent_session_id when an agent session ID is
  available.

  git_ref records the branch name (main checkout on a branch), the HEAD SHA
  (detached), or the origin/<default> tip SHA (clean detached non-main checkout).
  Handoff is refused from any other non-main checkout state.

Output Tags (for automation):
  <HANDOFF_ID>session-id</HANDOFF_ID>          Session identifier
  <SESSION_FILE>/path/to/file</SESSION_FILE>   Absolute path to created file

Canonical Invocation:
  printf '%s\n' \
    '{"priority":"high","goal":"Fix login","next_step":"Run validation","specs":[],"files":[]}' \
    '# Fix login' \
    '' \
    'Body text — # symbols, --- delimiters, and code fences are literal.' \
    | spx session handoff
`;

/**
 * Selection logic for pickup command.
 */
export const PICKUP_SELECTION_HELP = `
Selection Logic (--auto):
  Sessions are selected by priority, then age (FIFO):
    1. high priority first
    2. medium priority second
    3. low priority last
    4. Within same priority: oldest session first

Output:
  <PICKUP_ID>session-id</PICKUP_ID> tag for each claimed session
`;
