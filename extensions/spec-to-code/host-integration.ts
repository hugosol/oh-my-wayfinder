/**
 * Host integration: this extension's single seam onto the OMP host.
 *
 * Everything here is host-owned: which skills are discoverable, the skill-prompt
 * message the host renders for a skill activation, and whether the host's own
 * agent discovery would resolve `agent: "tdd"`. Keeping it in one module means a
 * host format or discovery change lands in one place instead of a hand-rolled copy.
 */
import {
	buildSkillPromptMessage,
	discoverSkills,
	SKILL_PROMPT_MESSAGE_TYPE,
	type ExtensionAPI,
} from "@oh-my-pi/pi-coding-agent";
import { discoverAgents } from "@oh-my-pi/pi-coding-agent/task";

/** True when the host discovers a skill with this exact name. */
export async function hasSkill(name: string): Promise<boolean> {
	const { skills } = await discoverSkills();
	return skills.some(skill => skill.name === name);
}

/**
 * True when the host's own agent discovery resolves `agent: "tdd"` for `cwd`.
 * The host's discovery covers configured extension roots and the project/user
 * `.omp/agents` dirs, so the preflight cannot promise an agent the task tool
 * will fail to find.
 */
export async function hasTddAgent(cwd: string): Promise<boolean> {
	const { agents } = await discoverAgents(cwd);
	return agents.some(agent => agent.name === "tdd");
}

/**
 * Inject a skill the way the host's own autoload path does: hidden and
 * agent-injected, through the host's canonical autoload prompt template.
 */
export async function activateSkill(
	pi: ExtensionAPI,
	skillName: string,
	userArgs: string,
): Promise<boolean> {
	const { skills } = await discoverSkills();
	const skill = skills.find(s => s.name === skillName);
	if (!skill) return false;

	const built = await buildSkillPromptMessage(skill, { args: userArgs }, "autoload");

	pi.sendMessage(
		{
			customType: SKILL_PROMPT_MESSAGE_TYPE,
			content: built.message,
			display: false,
			details: built.details,
			attribution: "user",
		},
		{ triggerTurn: true },
	);

	return true;
}
