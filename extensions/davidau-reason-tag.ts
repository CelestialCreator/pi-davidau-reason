/**
 * DavidAU Qwen3.8 Turbo Brilliance: `{REASON:xxx}` mode/persona tags + TUI status
 * + `/davidau-mode` command with COMBOS, PRESETS, persistence, and autocomplete.
 *
 * Model side (llama.cpp chat-template reason_mods, verified live on
 * cachyos:8001 model `zorro-davidau-3.8-flash-next`):
 *  - tag must sit in the LATEST user message; tag in system/older messages == ignored
 *  - unknown names are silently ignored (this extension warns up front instead)
 *  - up to TWO tags compose: {REASON:musk}{REASON:business} (reasoning + instruct
 *    via i-prefix, x = xhigh-combo). Persona does NOT persist to untagged follow-ups.
 *
 * Extension side: re-applies the configured tag(s) to the latest user message on
 * every provider request (request-local, session history untouched). Tags already
 * typed by the user are left alone.
 *
 * `/davidau-mode`                      -> status: current tag(s), descriptions, model
 * `/davidau-mode musk`                 -> {REASON:musk}
 * `/davidau-mode musk business`        -> {REASON:musk}{REASON:business}   (Tab both slots)
 * `/davidau-mode research`             -> preset -> {REASON:xspoon}{REASON:hyper}
 * `/davidau-mode {REASON:musk}{REASON:ihouse}` -> literal paste, parsed as-is
 * `/davidau-mode off`                  -> {REASON:off} (disable all enhancements)
 *
 * Selection persists across restarts in .davidau-mode.json (next to this file);
 * fallback order: state file > env DAVIDAU_REASON_MODE (space-separated ok) > "xhigh".
 * `i` prefix = instruct variant, `x` prefix = xhigh combo.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_PATH = join(homedir(), ".pi", "agent", "extensions", ".davidau-reason.log");
const STATE_PATH = join(homedir(), ".pi", "agent", "extensions", ".davidau-mode.json");
function trace(msg: string): void {
	try {
		appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
	} catch {
		/* logging must never break requests */
	}
}

// llama-swap ids of models whose chat template implements DavidAU's reason_mods.
// Add here when loading e.g. the 27B NEO-MAX-MTP build.
const MODEL_IDS = ["zorro-davidau-3.8-flash-next"];
const STATUS_KEY = "davidau-persona";
const TAG_RE = /\{REASON:[^}]*\}/;
const TAG_EXTRACT_RE = /\{REASON:([^{}]+)\}/g;

// ---- mode catalogue (from the model cards' chat-template reason_mods tables) ----

const PERSONAS = new Set(["pkd", "musk", "joker", "vader", "quinn", "joe", "neo", "curie", "stark", "matlock", "house"]);
const LEVELS = new Set(["xhigh", "medium", "low"]);

const MODES: Array<[name: string, desc: string]> = [
	["xhigh", "native default: deepest Qwen reasoning"],
	["medium", "native medium reasoning"],
	["low", "native low reasoning"],
	["off", "disable persona/reasoning modes"],
	["help", "in-model help: use cases + all modes"],
	// "x" combined modes (specialized reasoning + xhigh)
	["xomni", "omni-dimensional quantum framework + xhigh"],
	["xdeeptree", "deep tree-of-thought + xhigh"],
	["xhyper", "MECE hyper-structure deconstructor + xhigh"],
	["xsocrates", "Socratic questioning + xhigh"],
	["xlogic", "first-principles logic + xhigh"],
	["xeinstein", "creative perspective agents + xhigh"],
	["xspoon", "structured research, panel of 5 experts + xhigh"],
	["xultra", "elite perfectionist + xhigh"],
	["xhelp", "context help picking a mode + xhigh"],
	// reasoning modes / personas
	["omni", "omni-dimensional quantum framework"],
	["deeptree", "deep tree-of-thought"],
	["hyper", "MECE hyper-structure"],
	["socrates", "Socratic questioning"],
	["logic", "foundational first principles"],
	["einstein", "brainstormer, up to 20 perspective agents"],
	["spoon", "research answer, panel of 5 experts"],
	["ultra", "elite perfectionist reasoning engine"],
	["holodeck", "Star Trek holodeck cast for debate"],
	["prompt", "prompt engineer mode"],
	["pkd", "persona: Philip K. Dick"],
	["musk", "persona: Elon Musk"],
	["joker", "persona: The Joker"],
	["vader", "persona: Darth Vader"],
	["quinn", "persona: Harley Quinn"],
	["joe", "persona: relatable 'regular Joe'"],
	["neo", "persona: Matrix Neo"],
	["curie", "persona: Marie Curie"],
	["brainstorm", "hyper-accelerated ideation engine"],
	["comedy", "synthetic comedy consciousness"],
	["business", "business strategy brainstorm"],
	["story", "narrative architect"],
	["teacher", "learn any skill/language plainly"],
	["007", "agentic operator: tool orchestration"],
	["coder", "elite multi-paradigm software architect"],
	["stark", "persona: Iron Man / JARVIS"],
	["matlock", "persona: litigation attorney"],
	["house", "persona: Dr. House diagnostics"],
];

// instruct variants ("i" prefix), except levels/off which have none
const INSTRUCT_SKIP = new Set(["off", "xhigh", "medium", "low"]);
const ALL_OPTIONS: Array<[name: string, desc: string]> = [
	...MODES,
	...MODES.filter(([n]) => !INSTRUCT_SKIP.has(n)).map(([n, d]) => [`i${n}`, `instruct: ${d}`] as [string, string]),
];
const KNOWN = new Set(ALL_OPTIONS.map(([n]) => n));

// Preset stacks from the model card's use-case matrix (two tags each).
const PRESETS: Record<string, [string, string, string]> = {
	research: ["xspoon", "hyper", "expert panel gathers, MECE structures"],
	launch: ["brainstorm", "business", "ideas then go-to-market"],
	creative: ["einstein", "story", "concept angles then narrative draft"],
	decision: ["socrates", "joe", "question yourself, ground it in reality"],
	legal: ["matlock", "logic", "legal risk with first-principles analysis"],
	"legal-tech": ["matlock", "stark", "legal risk + system design"],
	build: ["007", "coder", "agentic tool orchestration + elite architect"],
	feasibility: ["musk", "logic", "physics-first sanity check + first principles"],
	think: ["xultra", "iultra", "max reasoning + polished instruct output"],
};

// ---- persisted selection ----

function loadModes(): string[] {
	try {
		const raw = JSON.parse(readFileSync(STATE_PATH, "utf8"));
		if (Array.isArray(raw.modes) && raw.modes.length > 0 && raw.modes.every((m: unknown) => typeof m === "string")) {
			return raw.modes.slice(0, 2);
		}
	} catch {
		/* no state file yet */
	}
	const env = (process.env.DAVIDAU_REASON_MODE || "").trim();
	if (env) return env.split(/[\s,+]+/).filter(Boolean).slice(0, 2);
	return ["xhigh"];
}
function saveModes(next: string[]): void {
	try {
		writeFileSync(STATE_PATH, JSON.stringify({ modes: next }, null, 1));
	} catch (e) {
		trace(`state save failed: ${e}`);
	}
}

let modes: string[] = loadModes();

function tagString(): string {
	return modes.map((m) => `{REASON:${m}}`).join("");
}
function describe(name: string): string {
	const hit = ALL_OPTIONS.find(([n]) => n === name);
	return hit ? hit[1] : "unknown mode";
}

// ---- injection ----

type TextBlock = { type: "text"; text: string };

function applyTag(text: string): string {
	if (TAG_RE.test(text)) return text;
	return `${tagString()} ${text}`;
}

function refreshStatus(ctx: ExtensionContext): void {
	if (ctx.model && MODEL_IDS.includes(ctx.model.id)) {
		ctx.ui.setStatus(STATUS_KEY, `🎭 ${modes.join(" + ")}`);
	} else {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}

// ---- argument parsing ----

function parseTokens(raw: string): string[] {
	const literals = [...raw.matchAll(TAG_EXTRACT_RE)].map((m) => m[1].trim());
	if (literals.length > 0) return literals.slice(0, 2);
	return raw.split(/[\s,+]+/).filter(Boolean).map((t) => t.toLowerCase());
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => refreshStatus(ctx));
	pi.on("model_select", (_event, ctx) => refreshStatus(ctx));

	pi.registerCommand("davidau-mode", {
		description: 'Set DavidAU {REASON} tag(s): "/davidau-mode musk business" or preset "research" (Tab lists all)',
		getArgumentCompletions: (prefix) => {
			const p = prefix || "";
			const tokens = p.split(/[\s,+]+/);
			const typing = (tokens[tokens.length - 1] || "").toLowerCase();
			const slot = tokens.length; // 1 = first token, 2 = second
			let pool: Array<[string, string]>;
			if (slot >= 3) return null; // max two tags
			if (slot === 1) {
				pool = [
					...Object.entries(PRESETS).map(([k, [a, b, d]]) => [k, `preset: {${"REASON"}:${a}}{REASON:${b}} — ${d}`] as [string, string]),
					...ALL_OPTIONS,
				];
			} else {
				pool = ALL_OPTIONS.filter(([n]) => n !== "off");
			}
			const hits = pool.filter(([n]) => (typing ? n.toLowerCase().startsWith(typing) : true));
			if (hits.length === 0) return null;
			return hits.map(([name, description]) => ({ value: name, label: name, description }));
		},
		handler: async (args, ctx) => {
			const raw = (args || "").trim();
			if (!raw) {
				ctx.ui.notify(
					`current: ${tagString()}  [${modes.map(describe).join(" | ")}] — set with "/davidau-mode musk business" or preset (Tab)`,
					"info",
				);
				return;
			}
			let tokens = parseTokens(raw);
			if (tokens.length === 0) return;
			// preset expansion only for a single first token
			if (tokens.length === 1 && PRESETS[tokens[0]]) {
				const [a, b] = PRESETS[tokens[0]];
				tokens = [a, b];
			}
			if (tokens.includes("off")) tokens = ["off"];
			if (tokens.length > 2) {
				ctx.ui.notify("max two {REASON} tags at once (card spec), e.g. musk business or coder i007", "warning");
				return;
			}
			const bad = tokens.filter((t) => !KNOWN.has(t));
			if (bad.length > 0) {
				const guess = ALL_OPTIONS.filter(([n]) => bad.some((b) => n.startsWith(b[0]))).slice(0, 5).map(([n]) => n);
				ctx.ui.notify(`unknown mode: ${bad.join(", ")} — server will silently ignore it${guess.length ? ` (did you mean: ${guess.join(", ")})` : ""}`, "warning");
				return;
			}
			modes = tokens;
			saveModes(modes);
			trace(`modes set: ${modes.join(",")} (activeModel=${ctx.model?.id ?? "none"})`);
			refreshStatus(ctx);
			ctx.ui.notify(`DavidAU tags set to: ${tagString()}`, "info");
		},
	});

	pi.on("context", (event, ctx) => {
		if (!ctx.model || !MODEL_IDS.includes(ctx.model.id)) {
			trace(`context hook: model=${ctx.model?.id ?? "none"} (not a DavidAU reason_mods model, skipped injection)`);
			return;
		}

		let lastUser = -1;
		for (let i = event.messages.length - 1; i >= 0; i--) {
			if (event.messages[i].role === "user") {
				lastUser = i;
				break;
			}
		}
		if (lastUser < 0) return;

		const original = event.messages[lastUser] as { content: unknown };
		let changed = false;
		let content: unknown = original.content;

		if (typeof content === "string") {
			const next = applyTag(content);
			changed = next !== content;
			content = next;
		} else if (Array.isArray(content)) {
			const blocks = content as Array<TextBlock | { type: string }>;
			const firstText = blocks.findIndex((b) => b.type === "text");
			if (firstText >= 0) {
				const block = blocks[firstText] as TextBlock;
				const next = applyTag(block.text);
				if (next !== block.text) {
					changed = true;
					content = blocks.map((b, i) => (i === firstText ? { ...block, text: next } : b));
				}
			}
		}

		if (!changed) {
			trace(`injection skipped (tag already present), modes=${modes.join(",")}`);
			return;
		}
		trace(`injected ${tagString()} into latest user message`);
		const messages = event.messages.slice();
		messages[lastUser] = { ...messages[lastUser], content } as (typeof messages)[number];
		return { messages };
	});
}
