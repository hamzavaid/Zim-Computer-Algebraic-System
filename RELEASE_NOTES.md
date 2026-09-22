# Release notes

## v2.4.6 — Readable GUI results

- Adds a dedicated presenter for nonlinear-system and polynomial-analysis responses, with readable solutions, root summaries, multiplicities, and solver-state boundaries.
- Keeps the pretty answer as the default and adds a Settings option to show result JSON alongside it.
- Retains the separate developer inspection panel for full API request and response envelopes.

## v2.4.5 — CLI and GUI feature parity

- Exposes all current API-v2 operations through documented CLI commands and help.
- Adds automatic inequality routing to the standard CLI and GUI Solve workflows.
- Adds an API-v2 GUI endpoint and operation surfaces for systems, relations, polynomial analysis, nonlinear systems, derivations, formatting, LaTeX, and capabilities.
- Preserves API-v1 compatibility, cancellation, request limits, security headers, history, and raw response inspection.
- Adds capability-parity regression coverage so new operations require an explicit CLI and GUI support decision.
