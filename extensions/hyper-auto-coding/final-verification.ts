/** Independent delivery verification, evidence-driven repair, and HEAD-bound acceptance.
 * Scheduling prerequisites remain with the caller; verification state stays here.
 */

import { randomUUID } from "node:crypto";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import type { HyperGit } from "./git";
import type { HyperHost, HyperRole } from "./subagent-host";
import type { Report } from "./workflow";

export class FinalVerification {
	#verification?: Report;
	#verified = false;

	constructor(
		private readonly git: HyperGit,
		private readonly host: HyperHost,
		private readonly references: string,
		private readonly save: (role: HyperRole, result: SingleResult, head: string) => Promise<Report>,
	) {}

	/** Latest final verification report path (if any) and whether it still passes. */
	get snapshot(): { verification?: string; verified: boolean } {
		return { verification: this.#verification?.path, verified: this.#verified };
	}

	async verify(): Promise<void> {
		this.#verified = false;
		this.#verification = undefined;
		await this.git.assertClean();
		const head = await this.git.head();
		const report = await this.#run("verify",
			`对当前集成分支做最终整体验证。${this.references}\n不执行 code-review。依据 contract 承诺、跨票据行为及项目要求实际执行整体验证，包括必要的复杂脚本或实机 smoke；逐项报告实际证据、失败与未验证项。自行负责验收，通过则正常完成，失败明确以执行失败返回供 fixer 接手。不得修改代码、需求或提交，不调用 retro。`);
		await this.git.assertClean();
		if ((await this.git.head()) !== head) throw new Error("只读验证期间集成分支提交被修改。");
		this.#verification = report;
		// Completion is an execution outcome, not a judgment of report quality.
		this.#verified = report.result.exitCode === 0 && !report.result.error && !report.result.aborted && !report.result.truncated;
	}

	async fix(): Promise<void> {
		if (!this.#verification || this.#verified) throw new Error("先执行最终验证并取得失败报告。");
		const previous = this.#verification;
		this.#verified = false;
		await this.#run("fix",
			`修复最终整体验证发现的问题，报告：${previous.path}。${this.references}\n不执行 code-review，不改变需求或弱化验收。根据失败证据阅读代码、修复、运行必要检查并提交，保持工作区干净。完成后由独立 verify 子代理重新验证；不要自行宣布交付，不调用 retro。`);
		await this.git.assertClean();
	}

	async check(): Promise<void> {
		if (!this.#verified || !this.#verification) throw new Error("最终验证尚未正常完成。");
		await this.git.assertClean();
		if ((await this.git.head()) !== this.#verification.head) throw new Error("验证报告已过期，需要针对当前提交重新执行。");
	}

	async #run(role: HyperRole, task: string): Promise<Report> {
		const result = await this.host.run({ role, cwd: this.git.root, task, name: `${role}-${randomUUID()}` });
		return this.save(role, result, await this.git.head());
	}
}
