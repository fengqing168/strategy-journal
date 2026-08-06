# Prompt #3: 结构化格式化

## 用途
将 Prompt #2 输出的 JSON 转换为统一的结构化表格，为后续定量分析（打分、对比）提供干净的数据格式。

## 前置
- Prompt #2（事件关键点提取）— 已有 5 维度的 JSON 提取结果

## 输入变量
- `{{extracted_data}}` — Prompt #2 的完整 JSON 输出
- `{{event_id}}` — 事件编号（用于追溯）

## 完整 Prompt

```
# Role
你是数据结构化专家，负责将分析结果整理为标准格式。

# Input
以下是 Prompt #2 对事件 #{{event_id}} 的提取结果：

{{extracted_data}}

# Task
将多层级 JSON 压平为一张标准化表格。每个维度一行，包含以下列：

| 事件编号 | 维度 | 关键摘录 | 方向 | 信号强度 | 有新增信息？ | 变化描述 |
|---------|------|---------|------|---------|----------|---------|

规则：
1. `方向` 统一为：鹰派(+1) / 鸽派(-1) / 中性(0)
2. `信号强度` 1-5，根据措辞强度：
   - 1 = 微弱信号（模糊措辞，如 "will monitor"）
   - 3 = 中等信号（明确措辞，如 "inflation remains elevated"）
   - 5 = 强烈信号（极强措辞，如 "will deliver price stability"）
3. `关键摘录` 每个维度最多取 3 条最重要的原文句
4. 如果有"异常措辞"，在表格下方单独列出异常项

# Output Format
```markdown
### 事件 #{{event_id}} 结构化分析

...
```

## 示例（基于 7/29 FOMC）

| 事件编号 | 维度 | 关键摘录 | 方向 | 信号强度 | 有新增信息 | 变化描述 |
|---------|------|---------|------|---------|----------|---------|
| #001 | 利率立场 | "The Committee will deliver price stability" | +1 | 5 | 是 | 从seeks升级为will deliver |
| #001 | 通胀描述 | "Inflation remains elevated...reflecting supply shocks" | +1 | 4 | 是 | 首次提及能源供应冲击 |
| #001 | 就业市场 | "Job gains have kept pace with the workforce" | 0 | 2 | 否 | 与6月声明一致 |
| #001 | 风险平衡 | "elevated uncertainty...conflict in Middle East" | +1 | 3 | 是 | 首次明确点名地缘冲突 |
| #001 | 异常措辞 | "will deliver price stability" | +1 | 5 | 是 | 极罕见的绝对化承诺 |

⚠ 异常项：
- "The Committee will deliver price stability." → 历史上无先例的强硬措辞
- 首次在FOMC声明中明确提到"conflict in the Middle East"

## 自定义说明
- 如果后续需要做程序化分析，可要求输出纯 JSON 而非 Markdown 表格
- `信号强度` 的 1-5 标准建议保持不变，便于跨事件横向对比
