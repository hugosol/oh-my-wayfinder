/** Owns one ticket’s merge attempts, integration reports, and original child session.
 * First merge releases dependents; later conflicts resume that same session.
 * Git retains ownership of the shared forward/reverse-merge lock.
 */

import { randomUUID } from "node:crypto";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import type { HyperGit, TicketWorktree } from "../hyper-auto-coding/git";
import type { HyperHost, HyperRole } from "../hyper-auto-coding/subagent-host";
import type { Report } from "../hyper-auto-coding/workflow";

/** Read-only view of one ticket's integration outcome. */
export interface TicketIntegrationSnapshot {
	mergedHead?: string;
	integrationReport?: string;
	integrationAgentId?: string;
}

/** Runs and records the integration loop of a single ticket. */
export class TicketIntegration {
	#mergedHead?: string;
	#integrationReport?: string;
	#integrationAgentId?: string;

	constructor(
		private readonly git: HyperGit,
		private readonly host: HyperHost,
		private readonly references: string,
		private readonly save: (role: HyperRole, result: SingleResult, head: string) => Promise<Report>,
		private readonly onMerged: () => void,
	) {}

	/** Current integration state; a fresh object of scalars, never an internal reference. */
	get snapshot(): TicketIntegrationSnapshot {
		return {
			mergedHead: this.#mergedHead,
			integrationReport: this.#integrationReport,
			integrationAgentId: this.#integrationAgentId,
		};
	}

	/**
	 * Rebuild one ticket's recorded integration outcome for a workflow restored
	 * from a pause. The object is inert: no child session is revived, and `run`
	 * is never called again for a ticket that already reached this snapshot.
	 */
	static restore(
		git: HyperGit,
		host: HyperHost,
		references: string,
		save: (role: HyperRole, result: SingleResult, head: string) => Promise<Report>,
		onMerged: () => void,
		snapshot: TicketIntegrationSnapshot,
	): TicketIntegration {
		const integration = new TicketIntegration(git, host, references, save, onMerged);
		integration.#mergedHead = snapshot.mergedHead;
		integration.#integrationReport = snapshot.integrationReport;
		integration.#integrationAgentId = snapshot.integrationAgentId;
		return integration;
	}

	/**
	 * Merge the ticket worktree, run the resumable integration child, and keep
	 * attempting merges until the ticket branch is part of the integration
	 * branch. Throws on execution faults, dirty worktrees, and Git failures.
	 */
	async run(ticket: string, worktree: TicketWorktree, implementationReport: string): Promise<void> {
		const first = await this.git.mergeTicket(worktree, true);
		if (first.merged) {
			this.#mergedHead = first.head;
			this.onMerged();
		}
		const name = `integrate-${ticket}-${randomUUID()}`;
		const request = {
			role: "integrate" as const,
			cwd: worktree.cwd,
			name,
			task: `接管本票原开发 worktree 和 branch，TDD 会话已结束，不复用它。票据：${ticket}。实现报告：${implementationReport}。\n${this.references}\n首次合入${first.merged ? "已成功" : "有冲突，集成工作区已 abort"}，宿主已将集成提交 ${first.head} merge 回当前开发分支。${first.conflicts ? "当前 worktree 有待解决冲突，请自行阅读代码判断并解决。" : "检查当前同步结果。"}\n本轮自行完成集成验收：只要求运行项目全局测试，通过前直接修复问题。复杂脚本、实机 smoke 与跨票据整体验收留给最后独立门禁。解决冲突及修复均提交到当前开发分支，保持工作区干净。不得操作集成工作区、切换分支、新建 worktree、reset 丢弃工作或调用 retro。不要直接合入集成分支；返回后宿主排队合并。如再次冲突，会在此同一会话继续，不另派 fixer。`,
		};
		let result = await this.host.run(request);
		const integrationAgentId: string = result.id;
		this.#integrationAgentId = integrationAgentId;
		while (true) {
			const report = await this.save("integrate", result, await this.git.ticketHead(worktree));
			this.#integrationReport = report.path;
			// Normal child completion: a fault is never reported as a finished integration.
			if (result.exitCode !== 0 || result.error || result.aborted || result.truncated)
				throw new Error(`集成执行未正常完成：${report.path}`);
			await this.git.assertTicketClean(worktree);
			const merge = await this.git.mergeTicket(worktree, false);
			if (merge.merged) {
				if (!this.#mergedHead) {
					this.#mergedHead = merge.head;
					this.onMerged();
				}
				return;
			}
			result = await this.host.resume({
				...request,
				id: integrationAgentId,
				task: `本票回合并发生冲突，集成工作区已 abort。宿主已将集成提交 ${merge.head} merge 回此原开发 worktree。${merge.conflicts ? "请解决当前 Git 冲突。" : "逆向同步已完成。"}沿用本会话的代码上下文，自行阅读判断、完成必要调整并提交，保持工作区干净。不新建 worktree、不操作集成工作区、不修改需求。仅首次调用强制运行全局测试；本轮自行判断必要验证，不启动新一轮完整验收。返回后宿主再次排队合入，合入成功即结束。`,
			});
		}
	}
}
