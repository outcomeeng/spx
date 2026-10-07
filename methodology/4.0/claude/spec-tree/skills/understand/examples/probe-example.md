# Capture basic

## Intent

The operator expects quick add to feel instantaneous on the web surface. The assertion states a two-second bound from focus to a captured task; only a person or agent operating the running surface can settle whether the field behaves that way.

## Environment and preconditions

- Development build of the web surface at the commit under verification, served locally.
- One signed-in account with an empty task list.
- Browser at 1280 by 800 with the network throttled to "Fast 3G".

## Protocol

1. Open the task list and focus the quick-add field with the keyboard shortcut.
2. Type "call the dentist tomorrow" and press Enter.
3. Observe the list until the task appears with tomorrow's date.
4. Repeat steps 1 to 3 twice more with different text.

## Attested run

- Date: 2026-09-01
- Observations: the task appeared with the parsed date in every run; the longest focus-to-task interval in the screen recording is 1.4 seconds.
- Artifacts: [screen recording](capture-basic.webm), [run transcript](run.transcript.txt) — illustrative filenames; a real run links the files it retained in this directory

## Verdict

`passed` — every run captured within the bound.

## Limitations

The protocol exercised one browser, one throttling profile, and Latin text; a long title, a non-Latin script, and the mobile surface were not exercised.
