# pi-davidau-reason

DavidAU **Turbo Brilliance `{REASON:xxx}`** mode/persona tags for [pi](https://pi.dev) — reliable injection into the latest user message, plus a `/davidau-mode` command with combos, presets and autocomplete.

[![npm](https://img.shields.io/npm/v/pi-davidau-reason)](https://www.npmjs.com/package/pi-davidau-reason)

## What it does

[DavidAU's Turbo Brilliance](https://huggingface.co/DavidAU) persona/mode tags (`{REASON:xhigh}`, `{REASON:pkd}`, …) only work when they are in the **latest user message** — the model's chat template (`reason_mods`) extracts them there. Put them in the system prompt and they are silently ignored.

This extension injects your configured tags into the latest user message on every provider request (request-local — your saved session history stays clean), so the tag survives tool loops and context compaction. It also provides a `/davidau-mode` command to change modes live, with Tab autocomplete.

## Requirements

- [pi](https://pi.dev) (`@earendil-works/pi-coding-agent`)
- A model whose chat template implements DavidAU's `reason_mods` — currently Qwen3.8-based DavidAU "Turbo Brilliance" GGUF builds served through llama.cpp / llama-swap (e.g. model id `zorro-davidau-3.8-flash-next`). The extension only activates for the model ids listed in `MODEL_IDS` at the top of `extensions/davidau-reason-tag.ts` — add yours there.

## Install

```bash
# from npm (once published)
pi install npm:pi-davidau-reason

# or straight from this repo
pi install git:github.com/CelestialCreator/pi-davidau-reason
```

Then restart pi. To uninstall: `pi remove npm:pi-davidau-reason`.

## Usage

Select a DavidAU model, then:

```
/davidau-mode              # show current mode + available modes/personas
/davidau-mode xhigh        # single mode
/davidau-mode xdeepsolve ianalyst   # two-tag combo (max 2)
/davidau-mode legal        # preset → xlegal + iprose
/davidau-mode {REASON:joker}        # paste a literal tag
/davidau-mode off          # disable injection
```

Presets: `research` (xdeepthink+icritic), `build` (xbuild+iseo), `legal` (xlegal+iprose), `legal-tech` (xlegal+idev), `launch` (xlaunch+ibrainstorm), `creative` (xcreative+idirector), `decision` (xdecide+ianalyst), `feasibility` (ifeasibility+ipredict), `think` (xdeepthink+isocrates).

Personas: `pkd musk joker vader quinn joe neo curie stark matlock house`. Modes include `xhigh xmax xdeep xdeepthink xdeepsolve xbuild xlegal xcreative xdecide xlaunch …` and cross-products (`xomni xdeeptree xhyper xsocrates xlogic xeinstein xspoon xultra xhelp`); nearly everything has an `i`-prefixed *instruct* variant. Unknown names warn but still apply, with did-you-mean suggestions.

## Configuration

- Default mode: `xhigh`. Override with env `DAVIDAU_REASON_MODE=xmax` (or a mode string like `"pkd xhigh"`).
- The chosen mode persists across restarts in `~/.pi/agent/extensions/.davidau-mode.json`.
- When a DavidAU model is selected, a small `🎭 <mode>` indicator appears in the TUI status bar.

## Development

```bash
npm install     # typescript + pi types (dev only; pi itself is a peer dep)
npm run check   # tsc --noEmit
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md). Design notes in [SPEC.md](./SPEC.md).

## License

MIT
