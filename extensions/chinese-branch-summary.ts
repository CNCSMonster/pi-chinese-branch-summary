import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * 原文：BRANCH_SUMMARY_PROMPT（来自 @earendil-works/pi-coding-agent 核心源码）
 * 结构严格与官方内核一对一保真对齐。
 */
export const CHINESE_BRANCH_SUMMARY_PROMPT = `为当前对话分支生成一份结构化摘要，以便后续切换回此分支时恢复上下文。

严格使用以下格式：

## 目标
[用户在此分支中尝试完成什么？]

## 约束与偏好
- [提到的任何约束、偏好或要求]
- [若未提及则填写"（无）"]

## 进展
### 已完成
- [x] [已完成的任务/改动]

### 进行中
- [ ] [已开始但尚未完成的工作]

### 受阻
- [阻碍进展的问题，若有]

## 关键决策
- **[决策]**: [简要理由]

## 下一步
1. [继续推进此工作接下来应做什么]

保持各部分精炼。精确保留文件路径、函数名及错误信息。`;

export default function chineseBranchSummaryExtension(pi: ExtensionAPI) {
	pi.on("session_before_tree", async () => {
		return {
			replaceInstructions: true,
			customInstructions: CHINESE_BRANCH_SUMMARY_PROMPT,
		};
	});
}
