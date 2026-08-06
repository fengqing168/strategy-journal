# Prompt #16: 仓位与风险管理

## 用途
在入场计划确定后，执行完整的仓位管理和风险管理计算——不仅算该下多少手，还检查连续亏损后的回撤、账户存活概率等。

## 前置
- Prompt #15（入场信号确认）— 已有入场/止损/止盈计划
- 需要账户当前状态数据

## 输入变量
- `{{account_balance}}` — 账户余额
- `{{entry_plan}}` — Prompt #15 输出
- `{{current_exposure}}` — 当前已有的持仓风险暴露（如有其他仓位）
- `{{recent_trades}}` — 最近 10 笔交易结果（盈亏记录）
- `{{max_drawdown_pct}}` — 允许的最大回撤百分比

## 完整 Prompt

```
# Role
你是风险管理师。不判断方向——只评估每笔交易的风险是否可控。

# Context
账户余额：{{account_balance}}
当前已有风险暴露：{{current_exposure}}
允许的最大回撤：{{max_drawdown_pct}}%

# Input
入场计划：{{entry_plan}}
最近 10 笔交易：{{recent_trades}}

# Task

**1. 仓位计算（Kelly 公式优化版）**
- 基础公式：f* = (胜率 × (盈亏比 + 1) - 1) / 盈亏比
- 使用近期交易数据计算实际胜率（不是预期胜率）
- 建议使用 Kelly/4（保守版）或 Kelly/2（标准版）
- 输出：Kelly 建议仓位 = X%

**2. 单笔风险校验**
- 2% 规则的仓位 vs Kelly 建议仓位 → 取较小的
- 如果已有其他持仓，总风险暴露不能超过 6%
- 输出：最终仓位 = X 手

**3. 连续亏损压力测试**
- 基于当前仓位，如果连续亏损 3 笔，回撤多少？
- 如果连续亏损 5 笔，回撤多少？
- 回撤超过 {{max_drawdown_pct}}% 的阈值了吗？

**4. 相关性检查**
- 如果账户中已有 USD 相关持仓，新增 XAUUSD 是否过度集中？
- XAUUSD 与 DXY 的反向相关性是否被考虑？

**5. 风控清单（每项必须打勾才能开仓）**
[ ] 单笔风险 ≤ 2%
[ ] 总风险暴露 ≤ 6%
[ ] 盈亏比 ≥ 1.5（或理由充分）
[ ] 止损位在技术上有意义（非随意位置）
[ ] 本周累计亏损未超过每周止损限额

# Output Format
```json
{
  "position_sizing": {
    "kelly_fraction": X,
    "kelly_pct": X,
    "two_percent_rule_pct": 2.0,
    "final_risk_pct": X,
    "final_lots": X
  },
  "risk_check": {
    "single_trade_risk_pct": X,
    "total_exposure_pct": X,
    "within_limits": true/false
  },
  "stress_test": {
    "drawdown_after_3_losses_pct": X,
    "drawdown_after_5_losses_pct": X,
    "exceeds_max_drawdown": true/false
  },
  "correlation_check": {
    "usd_exposure_overlap": "高/中/低/无",
    "warning": ""
  },
  "risk_checklist": {
    "risk_lt_2pct": true,
    "exposure_lt_6pct": true,
    "rr_gt_1_5": true,
    "stop_technically_valid": true,
    "weekly_loss_limit_ok": true,
    "all_clear": true
  },
  "final_approval": "APPROVED/APPROVED_WITH_CAUTION/REJECTED",
  "notes": ""
}
```

# Rules
- 如果 5 个风控清单项有任何一个是 false → final_approval = "REJECTED"
- 如果连续亏损 3 笔的回撤 > 10%，标注严重警告
- Kelly 仓位如果在 20% 以上 → 强制截断到 5%
```

## 自定义说明
- 最近 10 笔交易记录可以从交易日志或 MT4 历史导出
- 如果没有交易记录，胜率默认为 0.5
