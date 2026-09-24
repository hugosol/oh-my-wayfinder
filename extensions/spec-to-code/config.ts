/**
 * Spec-to-code settings resolution.
 *
 * Project settings sit before global settings, and each field is first-found-wins
 * independently — a project layer that sets only one field must not mask the
 * global layer's other field.
 */

export interface SpecToCodeConfig {
	jevEnabled: boolean;
	forcePhase2Round: number;
}

/** Default for `specToCode.jev.forcePhase2Round`: force phase 2 after this many agent_end rounds once tickets exist. */
export const DEFAULT_FORCE_PHASE2_ROUND = 5;

/** The subset of a parsed settings layer this extension reads. */
export interface SpecToCodeSettingsLayer {
	specToCode?: {
		jev?: {
			enabled?: boolean;
			forcePhase2Round?: number;
		};
	};
}

/** Resolve the effective config from already-parsed layers, highest priority first. */
export function readSpecToCodeConfig(
	layers: readonly (SpecToCodeSettingsLayer | undefined)[],
): SpecToCodeConfig {
	let jevEnabled = false;
	let forcePhase2Round = DEFAULT_FORCE_PHASE2_ROUND;
	let enabledFound = false;
	let forceFound = false;
	for (const layer of layers) {
		const jev = layer?.specToCode?.jev;
		if (!jev) continue;
		if (!enabledFound && typeof jev.enabled === "boolean") {
			jevEnabled = jev.enabled;
			enabledFound = true;
		}
		if (!forceFound && typeof jev.forcePhase2Round === "number" && jev.forcePhase2Round > 0) {
			forcePhase2Round = Math.floor(jev.forcePhase2Round);
			forceFound = true;
		}
	}
	return { jevEnabled, forcePhase2Round };
}
