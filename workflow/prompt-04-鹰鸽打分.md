# Prompt #4: 鹰鸽打分

## 用途
对央行官员讲话进行 5 维度量化评分，判断其对货币政策的鹰鸽立场。

## 前置
- Prompt #2（事件关键点提取）— 已提取关键语句
- Prompt #3（结构化格式化）— 已整理为标准格式

## 输入变量
- `{{speaker_info}}` — 官员姓名、职务、历史倾向（偏鹰/偏鸽/中性）
- `{{key_passages}}` — 从 Prompt #2 提取的关键语句
- `{{current_macro}}` — 当前宏观背景：利率、通胀、上次决议结果
- `{{previous_statement}}` — 同一官员上一次讲话的摘要（来自 Prompt #6）

## 完整 Prompt

```
# Role
你是一位央行政策分析师，专门解读美联储官员的讲话措辞。

# Context
{{current_macro}}

# Input
官员信息：{{speaker_info}}
本次关键语句（已由前置 Prompt 提取）：
{{key_passages}}
同一官员上次讲话摘要（供对比）：
{{previous_statement}}

# Task
从以下 5 个维度打分，每个维度 -5 到 +5（正 = 鹰派，负 = 鸽派）：

1. **利率指引** — 是否暗示加息/降息/观望
2. **通胀措辞** — 对通胀的描述用词强度
3. **就业评估** — 劳动力市场判断方向
4. **风险提及** — 新增或强调的风险偏向
5. **语气方向** — 整体措辞的立场偏移

# Output Format
```json
{
  "speaker": "",
  "date": "",
  "scores": {"利率指引":X,"通胀措辞":X,"就业评估":X,"风险提及":X,"语气方向":X},
  "total": X,
  "verdict": "鹰派(15~25)/偏鹰(5~14)/中性(-4~4)/偏鸽(-14~-5)/鸽派(-25~-15)",
  "certainty": "高/中/低",
  "key_evidence": ["引用原文词句"],
  "vs_previous": "变鹰/变鸽/不变，原因",
  "risk_flag": "是否触发预警"
}
```

# Rules
- 如果打分 ≥+3，必须至少一条原文引用支撑
- vs_previous 与 verdict 方向相反时（如措辞变鸽但总分仍偏鹰），需额外解释
- 当任意维度对比上次出现 ≥±2 偏移时，trigger risk_flag
```

## 示例

参见 shujian.cc/product.html 中的完整演示。
