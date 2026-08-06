# Prompt #14: 黄金特有因子

## 用途
分析 XAUUSD 的 5 个特有驱动因子——这些是其他资产类别不具备的——判断各因子对金价的合力方向。

## 前置
- Prompt #5（多维影响评估）— 已有利率/美元/风险/通胀 4 条路径
- 需要当前黄金市场数据

## 输入变量
- `{{current_price}}` — 当前 XAUUSD 价格
- `{{dxy}}` — 当前美元指数 (DXY)
- `{{real_yield}}` — 美国 10 年期 TIPS 实际收益率
- `{{etf_holdings}}` — 最大黄金 ETF (GLD) 持仓量及近期变化
- `{{cb_buying}}` — 央行购金动态（最近数据和趋势）
- `{{cme_futures}}` — CME 黄金期货持仓数据（如有）
- `{{india_china_demand}}` — 印度/中国实物黄金需求情况

## 完整 Prompt

```
# Role
你是黄金市场分析师，专门研究 XAUUSD 的独特驱动因子。

# Context
当前 XAUUSD：{{current_price}}
DXY：{{dxy}}
美国 10Y TIPS 实际收益率：{{real_yield}}

# Input — 黄金特有因子数据
| 因子 | 数据 |
|------|------|
| GLD ETF 持仓 | {{etf_holdings}} |
| 央行购金动态 | {{cb_buying}} |
| CME 期货持仓 | {{cme_futures}} |
| 印中实物需求 | {{india_china_demand}} |

# Task
逐一分析 5 个黄金特有因子：

**因子 1：实际利率**
- TIPS 实际收益率 vs 金价的历史反向关系
- 当前实际利率水平处于什么位置？对金价是支撑还是压力？
- 打分：+3 到 -3（正=利好金价）

**因子 2：美元强弱 (DXY)**
- DXY 当前位置（高位/中位/低位）
- DXY 近期趋势
- 打分：+3 到 -3

**因子 3：ETF 资金流**
- GLD 持仓增加意味着机构资金流入，减少意味着流出
- 近期是净流入还是净流出？规模多大？
- 打分：+3 到 -3

**因子 4：央行购金**
- 2022-2026 年全球央行购金热潮的趋势
- 中国、波兰、印度等央行的购金节奏
- 趋势是加速还是减速？
- 打分：+3 到 -3

**因子 5：实物需求**
- 印度（婚庆季/排灯节）、中国的季节性需求
- 当前处于旺季还是淡季？
- 打分：+3 到 -3

**因子 6：投机仓位（CME COT 数据）**
- 管理基金净多头持仓是历史高位还是低位？
- 极端持仓往往预示反转
- 打分：+3 到 -3

# Output Format
```json
{
  "factors": {
    "实际利率": {"score": X, "assessment": "..."},
    "美元":     {"score": X, "assessment": "..."},
    "ETF资金流":{"score": X, "assessment": "..."},
    "央行购金":  {"score": X, "assessment": "..."},
    "实物需求":  {"score": X, "assessment": "..."},
    "投机仓位":  {"score": X, "assessment": "..."}
  },
  "composite_gold_score": X,
  "dominant_factor": "",
  "warning": ""
}
```
- composite_gold_score = 6 个因子得分之和（-18 ~ +18）
- 正值 = 因子层面偏向利好金价
```

## 自定义说明
- 如果你不跟踪这些数据，至少填入当前 DXY 和 TIPS 收益率——这两个是最核心的
- COT 数据可以每周从 CME 官网或 barchart.com 获取（免费）
