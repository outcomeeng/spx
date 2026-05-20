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
  goal: Fix the failing release check
  next_step: Run the focused session tests
  result: Local validation passed
  specs: []
  files: []
  ---
  # Session Title

  Session content...

Workflow:
  1. handoff  - Create session (todo)
  2. pickup   - Claim session (todo -> doing)
  3. release  - Return session (doing -> todo)
  4. archive  - Move session with a result to archive
  5. delete   - Remove session permanently
`;

/**
 * Frontmatter details for handoff command.
 */
export const HANDOFF_FRONTMATTER_HELP = `
Usage:
  Pipe content with frontmatter via stdin

Frontmatter Format:
  ---
  priority: high      # high | medium | low (default: medium)
  goal: Fix login     # required
  next_step: Run validation  # required
  specs: []           # optional pickup context
  files: []           # optional pickup context
  ---
  # Your session content here...

Prefilled by the CLI:
  created_at, branch, worktree, agent_session_id when an agent session ID is available

Before archive:
  Add a non-empty result field to the frontmatter.

Output Tags (for automation):
  <HANDOFF_ID>session-id</HANDOFF_ID>     - Session identifier
  <SESSION_FILE>/path/to/file</SESSION_FILE> - Absolute path to created file

Examples:
  echo '---
  priority: high
  goal: Fix login
  next_step: Run validation
  ---
  # Fix login' | spx session handoff
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
  <PICKUP_ID>session-id</PICKUP_ID> tag for automation parsing
`;
