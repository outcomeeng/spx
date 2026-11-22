# Command Removal

GOVERNS every Change that removes an spx command
SO THAT a Product that invokes the command
CAN RELY ON the command working until that Product's own migration Change merges

## Audit: removal ordering

- removal-lists-consumers: ALWAYS: a Change that removes an spx command lists, in its Statement of Intent, each other Product of the Change Store that invokes the command, with the Change that migrates that Product off it, or states that it found no such Product; a removal Change that lists neither fails.
- removal-blocked-by-migrations: ALWAYS: a Change that removes an spx command names each migration Change it lists as a blocking Change, so it cannot be applied, and the command keeps working, until every listed migration Change closes Applied; a listed migration Change that it does not name as a blocker fails.
