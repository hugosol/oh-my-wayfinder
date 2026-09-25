/**
 * Spec-to-code configuration.
 *
 * Read once, at extension load, from `config.json` beside this module
 * (`extensions/spec-to-code/config.json`). There is no config.yml path and no
 * per-project override: the file is global to the extension install, so editing
 * it requires an extension reload or a fresh omp process.
 */

import * as fs from "node:fs";

export interface SpecToCodeConfig {
	jevEnabled: boolean;
	forcePhase2Round: number;
}

/** Default for `jev.forcePhase2Round`: force phase 2 after this many agent_end rounds once tickets exist. */
export const DEFAULT_FORCE_PHASE2_ROUND = 5;

/** `config.json` shape; every field is optional and falls back to the defaults. */
interface SpecToCodeConfigFile {
	jev?: {
		enabled?: boolean;
		forcePhase2Round?: number;
	};
}

export interface LoadedSpecToCodeConfig {
	config: SpecToCodeConfig;
	/** Human-readable reason when the file could not be read/parsed; undefined on success. */
	error?: string;
}

/** `<extension dir>/config.json`; `import.meta.url` stays correct for the host's `?mtime`-suffixed imports. */
const CONFIG_URL = new URL("config.json", import.meta.url);

function defaults(): SpecToCodeConfig {
	return { jevEnabled: false, forcePhase2Round: DEFAULT_FORCE_PHASE2_ROUND };
}

/** Validate parsed JSON, returning either a resolved config or a field-specific error. */
function validate(raw: unknown): { config?: SpecToCodeConfig; error?: string } {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		return { error: "root must be a JSON object" };
	}
	const file = raw as SpecToCodeConfigFile;
	const config = defaults();
	const jev = file.jev;
	if (jev !== undefined) {
		if (jev === null || typeof jev !== "object" || Array.isArray(jev)) {
			return { error: '"jev" must be an object' };
		}
		if (jev.enabled !== undefined) {
			if (typeof jev.enabled !== "boolean") return { error: '"jev.enabled" must be a boolean' };
			config.jevEnabled = jev.enabled;
		}
		if (jev.forcePhase2Round !== undefined) {
			const value = jev.forcePhase2Round;
			if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
				return { error: '"jev.forcePhase2Round" must be a positive number' };
			}
			config.forcePhase2Round = Math.floor(value);
		}
	}
	return { config };
}

/**
 * Load `config.json` beside this module. Never throws: a missing, unreadable, or
 * invalid file yields the built-in defaults plus a human-readable `error` for the
 * caller to surface.
 */
export function loadSpecToCodeConfig(): LoadedSpecToCodeConfig {
	let text: string;
	try {
		text = fs.readFileSync(CONFIG_URL, "utf8");
	} catch (error) {
		const code = (error as { code?: string } | undefined)?.code;
		const reason =
			code === "ENOENT" ? "not found" : `unreadable (${error instanceof Error ? error.message : String(error)})`;
		return { config: defaults(), error: `${CONFIG_URL.pathname} ${reason}; using defaults` };
	}
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		return {
			config: defaults(),
			error: `invalid JSON in ${CONFIG_URL.pathname}: ${error instanceof Error ? error.message : String(error)}; using defaults`,
		};
	}
	const result = validate(raw);
	if (result.config === undefined) {
		return { config: defaults(), error: `invalid ${CONFIG_URL.pathname}: ${result.error}; using defaults` };
	}
	return { config: result.config };
}
