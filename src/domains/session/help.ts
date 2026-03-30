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
  priority: high | medium | low
  tags: [tag1, tag2]
  ---
  # Session Title

  Session content...

Workflow:
  1. handoff  - Create session (todo)
  2. pickup   - Claim session (todo -> doing)
  3. release  - Return session (doing -> todo)
  4. archive  - Move session to archive
  5. delete   - Remove session permanently
`;

/**
 * Frontmatter details for handoff command.
 */
export const HANDOFF_FRONTMATTER_HELP = `
Usage:
  Option 1: Pipe content with frontmatter via stdin
  Option 2: Run without stdin, then edit the created file directly

Frontmatter Format:
  ---
  priority: high      # high | medium | low (default: medium)
  tags: [feat, api]   # optional labels for categorization
  ---
  # Your session content here...

Output Tags (for automation):
  <HANDOFF_ID>session-id</HANDOFF_ID>     - Session identifier
  <SESSION_FILE>/path/to/file</SESSION_FILE> - Absolute path to edit

Examples:
  # With stdin content:
  echo '---
  priority: high
  ---
  # Fix login' | spx session handoff

  # Without stdin (creates empty session, edit file directly):
  spx session handoff
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
