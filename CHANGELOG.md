# Changelog

## 0.1.0 — 2026-10-30

Initial release, packaged from the `davidau-reason-tag` pi extension used in production since 2026-10-22.

- Injects DavidAU `{REASON:xxx}` Turbo Brilliance tags into the **latest user message** on every provider request (request-local; session history untouched).
- Only active for models whose chat template implements DavidAU's `reason_mods` (currently `zorro-davidau-3.8-flash-next` via llama-swap; extend `MODEL_IDS` in the extension for more).
- `/davidau-mode` command: status, single/two-tag combos, `i`-prefix instruct variants, presets (`research`, `build`, `legal`, …), literal `{REASON:…}` paste, unknown-mode warnings with did-you-mean suggestions, Tab autocomplete.
- Persistence across restarts (`~/.pi/agent/extensions/.davidau-mode.json`), `DAVIDAU_REASON_MODE` env fallback, default `xhigh`.
- TUI status indicator (`🎭 <modes>`) when a DavidAU model is selected.
