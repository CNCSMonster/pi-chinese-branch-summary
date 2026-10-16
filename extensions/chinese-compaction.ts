/**
 * 中文上下文压缩扩展（chinese-compaction）
 *
 * 通过官方 `session_before_compact` 事件接管上下文压缩的摘要生成步骤，
 * 产出与核心结构同构的中文检查点摘要；任何拿不准的情况回退核心英文默认。
 *
 * - 设计文档：docs/spec-chinese-compaction.md
 * - 升级 SOP：docs/upgrade-sop.md
 *
 * 机制（全公开 API，参考官方示例 examples/extensions/custom-compaction.ts）：
 *   1) 契约守卫：preparation 字段缺失 → 回退（对齐升级漂移）
 *   2) 取料：messagesToSummarize + turnPrefixMessages 单次全覆盖（split 不回退）
 *   3) 生成：convertToLlm + serializeConversation（与核心截断口径一致）→ 中文模板
 *   4) 交卷：compaction.{summary, firstKeptEntryId, tokensBefore, usage, details}
 *      空摘要 / abort / 异常 / 无模型 → notify + return，核心英文默认接管（降级不损坏）
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

/** 对标核心 SUMMARIZATION_SYSTEM_PROMPT（utils.js）的中文版。 */
export const CHINESE_SUMMARIZATION_SYSTEM_PROMPT = `你是上下文压缩助手。你的任务是阅读一段用户与 AI 助手之间的对话，然后严格按照指定格式产出结构化摘要。

不要续写对话。不要回答对话中的任何问题。只输出结构化摘要本身。`;

/** 对标核心 SUMMARIZATION_PROMPT（compaction.js:379，英文 EXACT format）的中文同构版。 */
export const CHINESE_SUMMARIZATION_PROMPT = `以上是一段需要总结的对话。请为另一位 LLM 生成一份结构化上下文检查点摘要，供其接续完成这项工作。

严格使用以下格式：

## 目标
[用户在此会话中想完成什么？若涵盖多项任务可并列多条]

## 约束与偏好
- [用户提到的任何约束、偏好或要求]
- [若未提及则填写"（无）"]

## 进展
### 已完成
- [x] [已完成的任务/改动]

### 进行中
- [ ] [当前工作]

### 受阻
- [阻碍进展的问题，若无则填写"（无）"]

## 关键决策
- **[决策]**: [简要理由]

## 下一步
1. [接下来应发生的有序事项]

## 关键上下文
- [接续工作所需的数据、示例或引用]
- [若不适用则填写"（无）"]

保持各部分精炼。精确保留文件路径、函数名及错误信息。

若提供了 <previous-summary>，在其基础上增量更新：仍然有效的信息原样保留；用新消息补充新进展、新决策与新上下文；已完成的"进行中"条目移入"已完成"；已解决的"受阻"条目移除。`;

/** 对标核心 utils.js computeFileLists（去重/排序/只读与修改互斥），保真复刻。 */
export function computeFileLists(fileOps: {
	read: Set<string>;
	written: Set<string>;
	edited: Set<string>;
}): { readFiles: string[]; modifiedFiles: string[] } {
	const modified = new Set([...fileOps.edited, ...fileOps.written]);
	const readOnly = [...fileOps.read].filter((f) => !modified.has(f)).sort();
	return { readFiles: readOnly, modifiedFiles: [...modified].sort() };
}

/** 对标核心 utils.js formatFileOperations（前导 \n\n + XML 块），保真复刻。 */
export function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
	const sections: string[] = [];
	if (readFiles.length > 0) {
		sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
	}
	if (modifiedFiles.length > 0) {
		sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
	}
	if (sections.length === 0) return "";
	return `\n\n${sections.join("\n\n")}`;
}

export default function chineseCompactionExtension(pi: ExtensionAPI) {
	pi.on("session_before_compact", async (event: any, ctx: any) => {
		const { preparation, customInstructions, reason, signal } = event;

		const fallback = (why: string) => {
			ctx.ui.notify(`中文压缩回退英文默认（${reason ?? "unknown"}）：${why}`, "warning");
			return undefined;
		};

		// 1) 契约守卫：pi 升级导致字段漂移时显性回退（见 docs/upgrade-sop.md）
		if (
			!preparation ||
			!Array.isArray(preparation.messagesToSummarize) ||
			typeof preparation.firstKeptEntryId !== "string" ||
			typeof preparation.tokensBefore !== "number"
		) {
			return fallback("preparation 契约字段缺失（疑似 pi 升级漂移，跑一次升级 SOP）");
		}

		// 2) 取料
		const model = ctx.model;
		if (!model) return fallback("无当前会话模型（ctx.model 为空）");
		const {
			messagesToSummarize,
			turnPrefixMessages = [],
			tokensBefore,
			firstKeptEntryId,
			previousSummary,
			fileOps,
			settings,
			isSplitTurn,
		} = preparation;
		// split user-message span：单次调用全覆盖两块（官方示例同款，消除 split 回退）
		const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
		if (allMessages.length === 0) return fallback("无可摘要消息");

		// 3) 生成（与核心同一序列化口径；core SUMMARIZATION_SYSTEM_PROMPT 的中文等价物）
		const conversationText = serializeConversation(convertToLlm(allMessages));
		let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
		if (previousSummary) {
			promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
		}
		if (customInstructions) {
			promptText += `附加焦点（用户 /compact 指令）：${customInstructions}\n\n`;
		}
		promptText += CHINESE_SUMMARIZATION_PROMPT;

		// 对标核心 generateSummaryWithUsage 的预算：min(0.8*reserveTokens, 模型上限)
		const reserveTokens = settings?.reserveTokens ?? 16384;
		const modelMax = model.maxTokens > 0 ? model.maxTokens : Number.MAX_SAFE_INTEGER;
		const maxTokens = Math.min(Math.floor(0.8 * reserveTokens), modelMax);

		try {
			const response = await ctx.modelRegistry.complete(
				model,
				{
					systemPrompt: CHINESE_SUMMARIZATION_SYSTEM_PROMPT,
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: promptText }],
							timestamp: Date.now(),
						},
					],
				},
				{ maxTokens, signal, cacheRetention: "none" },
			);

			if (response.content.some((block: any) => block.type === "toolCall")) {
				return fallback("摘要模型尝试调用工具");
			}
			const summary = response.content
				.filter((block: any): block is { type: "text"; text: string } => block.type === "text")
				.map((block) => block.text)
				.join("\n");
			if (!summary.trim()) {
				return signal?.aborted ? fallback("用户中止（空摘要）") : fallback("模型返回空摘要");
			}

			// 4) 交卷：文件清单尾巴 + details（fromHook 摘要 Pi 不自动携带，必须自维护）
			const safeFileOps = fileOps ?? { read: new Set(), written: new Set(), edited: new Set() };
			const { readFiles, modifiedFiles } = computeFileLists(safeFileOps);
			const fullSummary = summary + formatFileOperations(readFiles, modifiedFiles);

			ctx.ui.notify(
				`中文压缩：${allMessages.length} 条消息（split=${isSplitTurn ? "是" : "否"}），tokensBefore=${tokensBefore}，触发=${reason ?? "unknown"}`,
				"info",
			);
			return {
				compaction: {
					summary: fullSummary,
					firstKeptEntryId,
					tokensBefore,
					usage: response.usage,
					details: { readFiles, modifiedFiles },
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (signal?.aborted) return fallback("用户中止");
			return fallback(`模型调用失败：${message}`);
		}
	});

	// 终态遥测：仅接管（fromExtension）失败时提示，配对回退统计
	pi.on("session_compact_failed", async (event: any, ctx: any) => {
		if (!event?.fromExtension) return;
		const detail = event.aborted ? "已中止" : (event.errorMessage ?? "未知错误");
		ctx.ui.notify(`中文压缩终态失败（${event.reason ?? "unknown"}）：${detail}`, "warning");
	});
}
