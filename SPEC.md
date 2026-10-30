# SPEC — pi-davidau-reason

## Problem

DavidAU's Turbo Brilliance `{REASON:xxx}` persona/mode tags are extracted by the model's chat template (`reason_mods`) **only from the latest user message**. Two failure modes in an agent loop:

1. Tags placed in the system prompt / AGENTS.md are ignored by the template.
2. A tag typed manually into one user message disappears once the agent runs tool loops (the latest message becomes a tool result) or once context compaction rewrites history.

## Design

- **`context` hook, request-local injection.** On every outgoing provider request, append the configured tag(s) to the *latest user message* in the request payload only. Session history on disk is never modified; the tag is re-derived per request, so it survives tool loops and compaction.
- **Model gating.** Injection happens only when the selected model id is in `MODEL_IDS` (models whose template actually implements `reason_mods`). Non-DavidAU models are untouched — no prompt pollution.
- **State.** Mode list is held in memory; max 2 tags (DavidAU's `reason_mods` combines at most two). Persisted to `~/.pi/agent/extensions/.davidau-mode.json`; env `DAVIDAU_REASON_MODE` as bootstrap fallback; default `xhigh`.
- **UX.** `/davidau-mode` command: status, set (single/two tags, `i`-instruct variants, presets, literal `{REASON:…}` paste, `off`), unknown names warn + suggest but still apply (DavidAU's catalogue changes between model builds), Tab autocomplete, `🎭 <modes>` status widget when a gated model is active.
- **Diagnostics.** Injection events appended to `~/.pi/agent/extensions/.davidau-reason.log` (tail to verify the tag actually landed in a request).

## Non-goals

- Per-message ad-hoc tags typed inline (the extension *strips* user-typed `{REASON:…}` from message bodies to keep one source of truth — the `/davidau-mode` state).
- Multi-model routing or server-side prompt rewriting (that belongs in the llama-swap layer, e.g. a `qwen-gate` style proxy).

## Key invariants

- `TAG_RE = /\{REASON:[^}]*\}/` — user-typed tags are stripped from message content; the injected tag is the only one that reaches the model.
- Injection targets the **last** message with `role === "user"`; if the payload's last user message is already the system prompt-adjacent edge case, injection appends after existing content with a leading newline.
- If installed as a loose file (`~/.pi/agent/extensions/`) **and** as a package, the extension loads twice — remove the loose file when installing the package.
