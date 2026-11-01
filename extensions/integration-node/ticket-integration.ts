/** Owns one ticket’s per-repository merge attempts and one integration child session.
 * Dependents are released only after every repository's first successful merge.
 * Each Git instance retains ownership of its forward/reverse-merge lock.
 */

import { randomUUID } from "node:crypto";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import type { HyperGit, MergeTicketResult, TicketWorktree } from "../hyper-auto-coding/git";
import type { HyperHost, HyperRole } from "../hyper-auto-coding/subagent-host";
import type { Report } from "../hyper-auto-coding/workflow";

/** One repository and the original worktree this ticket owns in it. */
export interface TicketRepository {
	repository: string;
	git: HyperGit;
	worktree: TicketWorktree;
}

/** Read-only view of one ticket's integration outcome. */
export interface TicketIntegrationSnapshot {
	merged: boolean;
	mergedHeads: Record<string, string>;
	integrationReport?: string;
	integrationAgentId?: string;
}

/** Runs and records the integration loop of a single ticket across its repositories. */
export class TicketIntegration {
	#merged = false;
	#mergedHeads: Record<string, string> = {};
	#integrationReport?: string;
	#integrationAgentId?: string;

	constructor(
		private readonly repositories: readonly TicketRepository[],
		private readonly host: HyperHost,
		private readonly references: string,
		private readonly save: (role: HyperRole, result: SingleResult, heads: Record<string, string>) => Promise<Report>,
		private readonly onMerged: () => void,
	) {}

	/** A detached snapshot, including evidence of any partial first merges. */
	get snapshot(): TicketIntegrationSnapshot {
		return {
			merged: this.#merged,
			mergedHeads: { ...this.#mergedHeads },
			integrationReport: this.#integrationReport,
			integrationAgentId: this.#integrationAgentId,
		};
	}

	/** Restore a drained ticket's recorded outcome without reviving its child session. */
	static restore(
		repositories: readonly TicketRepository[],
		host: HyperHost,
		references: string,
		save: (role: HyperRole, result: SingleResult, heads: Record<string, string>) => Promise<Report>,
		onMerged: () => void,
		snapshot: TicketIntegrationSnapshot,
	): TicketIntegration {
		const integration = new TicketIntegration(repositories, host, references, save, onMerged);
		integration.#merged = snapshot.merged;
		integration.#mergedHeads = { ...snapshot.mergedHeads };
		integration.#integrationReport = snapshot.integrationReport;
		integration.#integrationAgentId = snapshot.integrationAgentId;
		return integration;
	}

	/**
	 * Merge independently in each repository, then give one fresh child all the
	 * original worktrees. Conflicting follow-up merges resume that same child.
	 * Successful first merges survive failures in other repositories; no rollback.
	 */
	async run(ticket: string, implementationReport: string): Promise<void> {
		const first = await this.#merge(true);
		const request = {
			role: "integrate" as const,
			cwd: this.repositories[0]!.worktree.cwd,
			name: `integrate-${ticket}-${randomUUID()}`,
			task: `接管本票全部原开发 worktree 和 branch，TDD 会话已结束，不复用它。票据：${ticket}。实现报告：${implementationReport}。\n${this.references}\n本票仓库及首次合入状态：\n${this.#describe(first)}\n宿主已在各仓库独立尝试合入，并将各自的集成提交 merge 回对应原开发分支；集成工作区如有合并冲突已 abort。解决各原 worktree 中遗留的冲突，检查同步结果。\n本轮自行完成集成验收：读取每个原 worktree 的项目指令，在本票列出的每一个仓库中运行该项目的全局测试，并完成票据明确要求的跨仓联调与回归，所有相关仓库检查分别通过前直接修复问题。联调的源码、构建与服务路径均使用本票 worktree，不使用共享集成目录。解决冲突及修复均提交到对应原开发分支，保持全部工作区干净。不得操作任何集成工作区、切换分支、新建 worktree、reset 丢弃工作或调用 retro。不要直接合入集成分支；返回后宿主在各仓库排队合并。如再次冲突，会在此同一会话继续，不另派 fixer。`,
		};
		let result = await this.host.run(request);
		const integrationAgentId = result.id;
		this.#integrationAgentId = integrationAgentId;
		while (true) {
			const heads: Record<string, string> = {};
			for (const { repository, git, worktree } of this.repositories)
				heads[repository] = await git.ticketHead(worktree);
			const report = await this.save("integrate", result, heads);
			this.#integrationReport = report.path;
			if (result.exitCode !== 0 || result.error || result.aborted || result.truncated)
				throw new Error(`集成执行未正常完成：${report.path}`);
			for (const { git, worktree } of this.repositories) await git.assertTicketClean(worktree);
			const merges = await this.#merge(false);
			if ([...merges.values()].every((merge) => merge.merged)) return;
			result = await this.host.resume({
				...request,
				id: integrationAgentId,
				task: `本票回合并状态（全部原开发 worktree）：\n${this.#describe(merges)}\n发生冲突的集成工作区已 abort，宿主已将对应集成提交 merge 回对应原开发 worktree。解决尚存的 Git 冲突；其余仓库保持已合入成果，不回滚。沿用本会话的代码上下文，自行阅读判断、完成必要调整并提交，保持全部工作区干净。不新建 worktree、不操作任何集成工作区、不修改需求。仅首次调用强制在每个仓库运行全局测试；本轮自行判断必要验证，不启动新一轮完整验收。返回后宿主再次在各仓库排队合入，全部合入成功即结束。`,
			});
		}
	}

	/** Record first-merge evidence immediately, even if a later repository fails. */
	async #merge(syncAfterSuccess: boolean): Promise<Map<string, MergeTicketResult>> {
		const results = new Map<string, MergeTicketResult>();
		for (const { repository, git, worktree } of this.repositories) {
			const merge = await git.mergeTicket(worktree, syncAfterSuccess);
			results.set(repository, merge);
			if (merge.merged && !Object.prototype.hasOwnProperty.call(this.#mergedHeads, repository)) {
				this.#mergedHeads[repository] = merge.head;
				if (!this.#merged && this.repositories.every(({ repository: id }) => Object.prototype.hasOwnProperty.call(this.#mergedHeads, id))) {
					this.#merged = true;
					this.onMerged();
				}
			}
		}
		return results;
	}

	/** Include every original path on every turn, including already-merged repos. */
	#describe(merges: ReadonlyMap<string, MergeTicketResult>): string {
		return this.repositories.map(({ repository, worktree }) => {
			const merge = merges.get(repository)!;
			return `${repository}: cwd=${JSON.stringify(worktree.cwd)}; branch=${JSON.stringify(worktree.branch)}; 集成提交=${merge.head}; 合入=${merge.merged ? "成功" : "未完成"}; 原 worktree 冲突=${merge.conflicts ? "待解决" : "无"}`;
		}).join("\n");
	}
}
