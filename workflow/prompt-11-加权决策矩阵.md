# Prompt #11: 加权决策矩阵

## 用途
综合 AI 判断、人工判断、历史准确率、分歧程度和置信度阈值规则，输出最终的「是否交易 + 方向 + 仓位建议」。这是整个工作流的决策终点——前面 10 个 Prompt 都为了给这一步提供结构化数据。

## 前置
- Prompt #8（AI 初判）
- Prompt #9（人工判断）
- Prompt #10（人机分歧对比）
- 置信度规则表（`规则/置信度规则表.md`）

## 输入变量
- `{{ai_judgment}}` — Prompt #8
- `{{human_judgment}}` — Prompt #9
- `{{divergence}}` — Prompt #10
- `{{accuracy_table}}` — 历史准确率表（见置信度规则表）
- `{{risk_rules}}` — 当前适用的风控规则

## 完整 Prompt

```
# Role
你是量化决策引擎。基于预设的置信度规则，计算加权决策矩阵，输出最终的交易信号。

# Input
AI 判断：{{ai_judgment}}
人工判断：{{human_judgment}}
分歧分析：{{divergence}}
历史准确率表：{{accuracy_table}}
风控规则：{{risk_rules}}

# Decision Rules（内置规则，不可更改）

**规则 1：方向权重**
- 如果 AI 和人工方向一致 → 方向确定，权重各 50%
- 如果方向不一致 → 不生成信号，输出"NO TRADE"

**规则 2：置信度加权**
```
加权得分 = (AI 置信度 × AI 历史准确率 × AI 权重) + (人工置信度 × 人工历史准确率 × 人工权重)
            ─────────────────────────────────────────────────────────────────────────────
                                        总权重
```
- AI 历史准确率 = 历史上 AI 判断正确的比例
- 人工历史准确率 = 历史上人工判断正确的比例
- 如果暂无历史数据，AI 和人工准确率均默认 0.5

**规则 3：分歧惩罚**
- 如果分歧严重度 ≥ 7 → 总得分 × 0.5
- 如果分歧严重度 4-6 → 总得分 × 0.8
- 如果分歧严重度 ≤ 3 → 无惩罚

**规则 4：信号阈值**
- 加权得分 ≥ 7.0 → STRONG SIGNAL（标准仓位）
- 加权得分 5.0-6.9 → WEAK SIGNAL（半仓）
- 加权得分 3.0-4.9 → MONITOR（不交易，重新分析）
- 加权得分 < 3.0 → NO TRADE

**规则 5：反例排除**
- 如果 `ai_judgment.invalidation_condition` 或 `human_judgment.risk_assessment` 中提到的风险在最近 24 小时内出现 → SIGNAL 降一级

# Output Format
```json
{
  "event_id": "{{event_id}}",
  "timestamp": "",
  "decision": "STRONG_SIGNAL/WEAK_SIGNAL/MONITOR/NO_TRADE",
  "direction": "LONG/SHORT/NONE",
  "position_size": "标准(100%)/半仓(50%)/零",
  "weighted_score": X.X,
  "score_breakdown": {
    "ai_contribution": X,
    "human_contribution": X,
    "divergence_penalty": X,
    "anti_rule_check": "通过/触发（原因）"
  },
  "confidence_rate": "高/中/低",
  "caution": "任何特别注意事项"
}
```

# Rules
- 不要在当前分析中修改内置的决策规则
- 如果 historical accuracy 数据不足 5 次记录，在 caution 中标注"历史数据不足，置信度受限"
- 每个 decision output 必须附带 score_breakdown，不可跳过
```

## 自定义说明
- 决策规则（权重、阈值、惩罚系数）记录在 `规则/置信度规则表.md` 中。持续使用后，根据实际胜率调整这些参数
- 反例排除（规则 5）的触发条件可以动态更新。比如你发现"NFP 公布前 24 小时信号不可靠"，加到风控规则里
