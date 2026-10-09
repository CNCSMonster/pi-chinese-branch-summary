import test from "node:test";
import assert from "node:assert/strict";
import chineseBranchSummaryExtension, {
	CHINESE_BRANCH_SUMMARY_PROMPT,
} from "../extensions/chinese-branch-summary.ts";

test("CHINESE_BRANCH_SUMMARY_PROMPT 包含所有核心结构与必填字段", () => {
	assert.ok(CHINESE_BRANCH_SUMMARY_PROMPT.includes("## 目标"));
	assert.ok(CHINESE_BRANCH_SUMMARY_PROMPT.includes("## 约束与偏好"));
	assert.ok(CHINESE_BRANCH_SUMMARY_PROMPT.includes("## 进展"));
	assert.ok(CHINESE_BRANCH_SUMMARY_PROMPT.includes("### 已完成"));
	assert.ok(CHINESE_BRANCH_SUMMARY_PROMPT.includes("### 进行中"));
	assert.ok(CHINESE_BRANCH_SUMMARY_PROMPT.includes("### 受阻"));
	assert.ok(CHINESE_BRANCH_SUMMARY_PROMPT.includes("## 关键决策"));
	assert.ok(CHINESE_BRANCH_SUMMARY_PROMPT.includes("## 下一步"));
	assert.ok(
		CHINESE_BRANCH_SUMMARY_PROMPT.includes("精确保留文件路径、函数名及错误信息。"),
	);
});

test("扩展正确监听 session_before_tree 并返回 replaceInstructions", async () => {
	const registeredHandlers: Record<string, Function[]> = {};

	const mockPi = {
		on(event: string, handler: Function) {
			registeredHandlers[event] = registeredHandlers[event] || [];
			registeredHandlers[event].push(handler);
		},
	};

	chineseBranchSummaryExtension(mockPi as any);

	assert.ok(Array.isArray(registeredHandlers.session_before_tree));
	assert.equal(registeredHandlers.session_before_tree.length, 1);

	const handler = registeredHandlers.session_before_tree[0];
	const result = await handler();

	assert.equal(result.replaceInstructions, true);
	assert.equal(result.customInstructions, CHINESE_BRANCH_SUMMARY_PROMPT);
});
