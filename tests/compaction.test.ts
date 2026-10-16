import test from "node:test";
import assert from "node:assert/strict";
import chineseCompactionExtension, {
	CHINESE_SUMMARIZATION_PROMPT,
	CHINESE_SUMMARIZATION_SYSTEM_PROMPT,
	computeFileLists,
	formatFileOperations,
} from "../extensions/chinese-compaction.ts";

/** 收集注册的 handler */
function loadHandlers() {
	const registered: Record<string, Function[]> = {};
	const mockPi = {
		on(event: string, handler: Function) {
			registered[event] = registered[event] || [];
			registered[event].push(handler);
		},
	};
	chineseCompactionExtension(mockPi as any);
	return registered;
}

/** 构造 mock ctx：记录 notify 与 complete 入参，可注入失败/无模型 */
function makeCtx(options: { summary?: string; fail?: boolean; noModel?: boolean } = {}) {
	const notices: Array<{ msg: string; level: string }> = [];
	const calls: any[] = [];
	const ctx = {
		ui: { notify: (msg: string, level: string) => notices.push({ msg, level }) },
		model: options.noModel ? undefined : { id: "mock/model", maxTokens: 32768 },
		modelRegistry: {
			complete: async (_model: any, context: any, opts: any) => {
				calls.push({ context, opts });
				if (options.fail) throw new Error("network down");
				return {
					content: [{ type: "text", text: options.summary ?? "## 目标\n测试摘要正文" }],
					usage: { input: 10, output: 5, cost: { total: 0.001 } },
				};
			},
		},
	};
	return { ctx, notices, calls };
}

function makePreparation(overrides: any = {}) {
	return {
		messagesToSummarize: [{ role: "user", content: [{ type: "text", text: "老历史" }] }],
		turnPrefixMessages: [],
		isSplitTurn: false,
		firstKeptEntryId: "kept-1",
		tokensBefore: 12345,
		previousSummary: undefined,
		fileOps: {
			read: new Set(["a.ts", "b.ts"]),
			written: new Set(["out.ts"]),
			edited: new Set(["a.ts"]),
		},
		settings: { reserveTokens: 16384, keepRecentTokens: 20000 },
		...overrides,
	};
}

test("CHINESE_SUMMARIZATION_PROMPT 与核心结构同构（全章节 + 保真要求 + 迭代更新）", () => {
	for (const section of [
		"## 目标",
		"## 约束与偏好",
		"## 进展",
		"### 已完成",
		"### 进行中",
		"### 受阻",
		"## 关键决策",
		"## 下一步",
		"## 关键上下文",
	]) {
		assert.ok(CHINESE_SUMMARIZATION_PROMPT.includes(section), `缺少章节 ${section}`);
	}
	assert.ok(CHINESE_SUMMARIZATION_PROMPT.includes("精确保留文件路径、函数名及错误信息"));
	assert.ok(CHINESE_SUMMARIZATION_PROMPT.includes("<previous-summary>"), "应含增量更新指引");
	assert.ok(CHINESE_SUMMARIZATION_SYSTEM_PROMPT.includes("不要续写对话"));
});

test("扩展注册 session_before_compact 与 session_compact_failed", () => {
	const registered = loadHandlers();
	assert.equal(registered.session_before_compact?.length, 1);
	assert.equal(registered.session_compact_failed?.length, 1);
});

test("happy path：交出完整 compaction，usage/firstKeptEntryId/tokensBefore 保真，文件尾巴与 details 齐全", async () => {
	const registered = loadHandlers();
	const handler = registered.session_before_compact[0];
	const { ctx, notices, calls } = makeCtx({ summary: "## 目标\n中文摘要" });

	const result = await handler(
		{ preparation: makePreparation(), reason: "threshold", signal: new AbortController().signal },
		ctx,
	);

	assert.ok(result?.compaction, "必须交出 compaction 成品");
	assert.equal(result.compaction.firstKeptEntryId, "kept-1");
	assert.equal(result.compaction.tokensBefore, 12345);
	assert.equal(result.compaction.usage?.input, 10);
	// 文件尾巴（对标核心 formatFileOperations：a.ts 被编辑 → 只进 modified，不进 read）
	assert.ok(result.compaction.summary.includes("<read-files>\nb.ts\n</read-files>"));
	assert.ok(result.compaction.summary.includes("<modified-files>\na.ts\nout.ts\n</modified-files>"));
	assert.deepEqual(result.compaction.details, {
		readFiles: ["b.ts"],
		modifiedFiles: ["a.ts", "out.ts"],
	});
	// 提示词拼装：conversation 标签 + 中文格式 + 中文 systemPrompt
	const prompt = calls[0].context.messages[0].content[0].text;
	assert.ok(prompt.includes("<conversation>"));
	assert.ok(prompt.includes(CHINESE_SUMMARIZATION_PROMPT));
	assert.equal(calls[0].context.systemPrompt, CHINESE_SUMMARIZATION_SYSTEM_PROMPT);
	// 预算对标核心：min(0.8 * 16384, 模型上限)
	assert.equal(calls[0].opts.maxTokens, Math.floor(0.8 * 16384));
	assert.equal(calls[0].opts.cacheRetention, "none");
	// 接管通知（L2 观测）
	assert.equal(notices[0].level, "info");
	assert.ok(notices[0].msg.includes("中文压缩："));
});

test("split：turnPrefixMessages 一并覆盖且顺序在历史之后", async () => {
	const registered = loadHandlers();
	const handler = registered.session_before_compact[0];
	const { ctx, calls } = makeCtx();
	await handler(
		{
			preparation: makePreparation({
				isSplitTurn: true,
				turnPrefixMessages: [{ role: "assistant", content: [{ type: "text", text: "半截现场" }] }],
			}),
			reason: "threshold",
			signal: new AbortController().signal,
		},
		ctx,
	);
	const prompt = calls[0].context.messages[0].content[0].text;
	assert.ok(prompt.includes("老历史"));
	assert.ok(prompt.includes("半截现场"));
	assert.ok(prompt.indexOf("老历史") < prompt.indexOf("半截现场"), "历史必须在半截现场之前");
});

test("manual /compact 的 customInstructions 并入提示词；previousSummary 走增量块", async () => {
	const registered = loadHandlers();
	const handler = registered.session_before_compact[0];
	const { ctx, calls } = makeCtx();
	await handler(
		{
			preparation: makePreparation({ previousSummary: "上次摘要体" }),
			customInstructions: "聚焦部署脚本",
			reason: "manual",
			signal: new AbortController().signal,
		},
		ctx,
	);
	const prompt = calls[0].context.messages[0].content[0].text;
	assert.ok(prompt.includes("附加焦点（用户 /compact 指令）：聚焦部署脚本"));
	assert.ok(prompt.includes("<previous-summary>\n上次摘要体\n</previous-summary>"));
});

test("回退族：空摘要 / 抛错 / 无模型 / 契约漂移 / toolCall 全部返回 undefined 且带 warning 通知", async () => {
	const registered = loadHandlers();
	const handler = registered.session_before_compact[0];
	const signal = new AbortController().signal;
	const event = (preparation: any) => ({ preparation, reason: "threshold", signal });

	// 空摘要
	{
		const { ctx, notices } = makeCtx({ summary: "   " });
		const r = await handler(event(makePreparation()), ctx);
		assert.equal(r, undefined);
		assert.equal(notices[0].level, "warning");
		assert.ok(notices[0].msg.includes("回退英文默认"));
	}
	// 模型调用抛错
	{
		const { ctx, notices } = makeCtx({ fail: true });
		const r = await handler(event(makePreparation()), ctx);
		assert.equal(r, undefined);
		assert.ok(notices[0].msg.includes("模型调用失败"));
	}
	// 无模型
	{
		const { ctx } = makeCtx({ noModel: true });
		const r = await handler(event(makePreparation()), ctx);
		assert.equal(r, undefined);
	}
	// 契约漂移（preparation 缺字段）
	{
		const { ctx, notices } = makeCtx();
		const r = await handler(event({ tokensBefore: 1 }), ctx);
		assert.equal(r, undefined);
		assert.ok(notices[0].msg.includes("契约字段缺失"));
	}
	// 模型吐了工具调用
	{
		const { ctx } = makeCtx();
		ctx.modelRegistry.complete = async () => ({
			content: [{ type: "toolCall" }],
			usage: undefined,
		});
		const r = await handler(event(makePreparation()), ctx);
		assert.equal(r, undefined);
	}
});

test("session_compact_failed：仅接管失败时通知（终态遥测）", async () => {
	const registered = loadHandlers();
	const handler = registered.session_compact_failed[0];
	const { ctx, notices } = makeCtx();
	await handler({ fromExtension: false, reason: "threshold" }, ctx);
	assert.equal(notices.length, 0, "非接管失败不打扰");
	await handler({ fromExtension: true, reason: "threshold", errorMessage: "boom" }, ctx);
	assert.equal(notices.length, 1);
	assert.ok(notices[0].msg.includes("boom"));
});

test("computeFileLists / formatFileOperations 与核心行为一致", () => {
	const lists = computeFileLists({
		read: new Set(["b.ts", "a.ts", "out.ts"]),
		written: new Set(["out.ts"]),
		edited: new Set(["a.ts"]),
	});
	// 只读与修改互斥、双端排序
	assert.deepEqual(lists, { readFiles: ["b.ts"], modifiedFiles: ["a.ts", "out.ts"] });
	// 精确的 XML 尾巴与分隔符（前导 \n\n）
	assert.equal(
		formatFileOperations(["b.ts"], ["a.ts"]),
		"\n\n<read-files>\nb.ts\n</read-files>\n\n<modified-files>\na.ts\n</modified-files>",
	);
	// 空清单返回空串（摘要不被污染）
	assert.equal(formatFileOperations([], []), "");
});
