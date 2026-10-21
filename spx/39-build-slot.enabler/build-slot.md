# Build Slot

PROVIDES a host-wide build slot — one holder at a time across the processes, sessions, and product repositories of one OS account on one host, waiters admitted in arrival order, and holds released by process liveness — per [spx/39-build-slot.enabler/21-build-slot-queue.adr.md](spx/39-build-slot.enabler/21-build-slot-queue.adr.md)
SO THAT a heavy command run from any session, repository, CI job, or git hook
CAN start only when no other heavy command holds the host

## Assertions

- Given no holder, when a request runs a command, then it is admitted at once, runs the command, releases the slot when the command ends normally, with a non-zero status, or by a signal, and reports the command's exit status
- ALWAYS: at most one request holds the slot at a time across processes, sessions, and product repositories on one host
- Given several waiting requests, when the slot is released, then they are admitted one at a time in arrival order
- ALWAYS: a holder and a waiter are identified by process id plus start time, so a process that reuses a recorded pid is neither
- Given a holder whose wrapper is killed while its command runs, then the slot stays held until the command ends and a liveness check then releases it; no lease or timeout releases a hold
- Given a waiter that dies or is cancelled, then its record is removed and the next request is admitted in its turn
- Given a request whose environment carries the live holder's token and whose process ancestry reaches the holder, then it runs at once under that hold; a request with the token but not that ancestry, or that ancestry but not the token, queues
- Given requests from two product repositories, or with differing `HOME` or `XDG_STATE_HOME` values, a relative one included, then they share one queue
- NEVER: admission reads a load average, a memory reading, or another host-capacity signal, or requires an agent identity
