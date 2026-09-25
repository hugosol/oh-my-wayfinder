/**
 * Jev judging chain (opt-in via `jev.enabled` in `config.json`).
 *
 * `createJudgeDecider` is the judge port `planTurn` calls. It returns undefined
 * when the chain is off, has no native judge, or fails, so the caller then runs
 * the pre-Jev canned sequence.
 *
 * The request, result and error are logged at `debug` level to the host's shared
 * rotating file log (`~/.omp/logs/omp.<date>.<pid>.log`) and never reach the TUI.
 * Logging is a synchronous append on that shared sink and never spans the judge
 * `await`, so it cannot deadlock against the request it describes.
 */
import { settings, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { hasNativeJudge, resolveJudge } from "@oh-my-pi/pi-coding-agent/judgment";
import type { SpecToCodeConfig } from "./config";
import { AUTO_REPLY, CONTINUE_REPLY, pickJevOption, PUBLISH_REPLY } from "./turn-policy";

/** Round 1 omits "请继续" so the first automatic reply can never be a bare continuation. */
const JEV_OPTIONS_ROUND1 = [AUTO_REPLY, PUBLISH_REPLY] as const;
/** Round 2+ options; also the tie-break priority order (1 > 2 > 3). */
const JEV_OPTIONS = [AUTO_REPLY, PUBLISH_REPLY, CONTINUE_REPLY] as const;
/** Fixed question body handed to the judge; only `criteria` changes between rounds. */
const JEV_INSTRUCTIONS =
	"下面 state 是一个 coding agent 在把已批准的 spec/contract 拆成实现 ticket 时的最后一段回复。它的流程是：先自己思考、再向用户确认 ticket 粒度与依赖边、最后把 ticket 写入 .scratch/<slug>/implementation/。请判断：为了让流程自动推进，下一步应该自动回复 agent 哪一句？";
const JEV_CRITERIA: Record<string, string> = {
	[AUTO_REPLY]:
		"agent 在向用户提问、请求确认、或把决定权交给用户（例如问粒度是否合适、阻塞边是否正确）。此时应让它自己思考后继续，而不是等人类回答。",
	[PUBLISH_REPLY]:
		"agent 已给出完整 ticket 拆分方案（标题、依赖、交付内容），但尚未写入文件，或明确表示准备发布。此时应直接让它把 ticket 写入 .scratch/<slug>/implementation/。",
	[CONTINUE_REPLY]:
		"以上都不是：agent 只在正常推进、汇报进度或自然停下，既没向用户提问，也没准备发布。此时直接让它继续执行。",
};
/** Judge call timeout; on expiry the workflow falls back to the pre-Jev canned sequence. */
const JEV_TIMEOUT_MS = 5000;

export function createJudgeDecider(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	config: SpecToCodeConfig,
): (lastReply: string, round: number) => Promise<string | undefined> {
	return async (lastReply, round) => {
		if (!config.jevEnabled) {
			pi.logger.debug("spec-to-code: jev skipped", { round, reason: "disabled" });
			return undefined;
		}
		try {
			if (!hasNativeJudge(settings, ctx.modelRegistry)) {
				pi.logger.debug("spec-to-code: jev skipped", { round, reason: "no-native-judge" });
				return undefined;
			}
			const judge = resolveJudge({
				settings,
				registry: ctx.modelRegistry,
				sessionModel: ctx.model,
				sessionId: ctx.sessionManager.getSessionId(),
			});
			const options = round <= 1 ? JEV_OPTIONS_ROUND1 : JEV_OPTIONS;
			const criteria: Record<string, string> = {};
			for (const option of options) criteria[option] = JEV_CRITERIA[option] ?? "";
			const request = {
				state: lastReply,
				questions: {
					next_reply: {
						type: "choice" as const,
						instructions: JEV_INSTRUCTIONS,
						criteria,
					},
				},
			};
			pi.logger.debug("spec-to-code: jev request", { round, options: [...options], request });
			const started = performance.now();
			try {
				const result = await judge.judge(request, { signal: AbortSignal.timeout(JEV_TIMEOUT_MS) });
				const answer = result.answers.next_reply;
				const chosen = answer.type === "choice" ? pickJevOption(answer.probabilities, options) : undefined;
				pi.logger.debug("spec-to-code: jev result", {
					round,
					durationMs: Math.round(performance.now() - started),
					model: result.model,
					api: result.api,
					provider: result.provider,
					usage: result.usage,
					answers: result.answers,
					chosen,
					confidence: answer.type === "choice" ? answer.confidence : undefined,
					probabilities: answer.type === "choice" ? answer.probabilities : undefined,
				});
				if (answer.type !== "choice") return undefined;
				return chosen;
			} catch (error) {
				pi.logger.debug("spec-to-code: jev error", {
					round,
					durationMs: Math.round(performance.now() - started),
					error: error instanceof Error ? error.message : String(error),
					request,
				});
				return undefined;
			}
		} catch (error) {
			pi.logger.debug("spec-to-code: jev error", { round, error: error instanceof Error ? error.message : String(error), lastReply });
			return undefined;
		}
	};
}
