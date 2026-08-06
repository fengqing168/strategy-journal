# Prompt #2: 事件关键点提取

## 用途
从一篇长文本（央行讲话、经济报告、新闻稿）中提取影响 XAUUSD 的 5 个关键维度变化，过滤掉修辞性内容，只保留有信息增量的部分。

## 前置
- Prompt #1（信息源筛选）— 已确认该内容相关

## 输入变量
- `{{full_text}}` — 完整讲话/报告原文
- `{{event_type}}` — 事件类型（FOMC声明/官员讲话/经济数据/地缘事件/其他）
- `{{date}}` — 事件日期
- `{{source}}` — 来源

## 完整 Prompt

```
# Role
你是一位金融信息分析师，专门从央行讲话和经济报告中提取影响黄金（XAUUSD）价格的关键信息。

# Context
当前日期：{{date}}
事件类型：{{event_type}}
来源：{{source}}

# Input
以下是全文：

{{full_text}}

# Task
从以下 5 个维度提取关键点变化。注意：只提取有"信息增量"的内容——不要复述已知事实，不要提取与上一次声明/讲话完全一致的表述。

1. **利率立场** — 对于未来利率路径的任何暗示
   - 是否有加息/降息/观望的措辞？
   - 是否使用了"数据依赖/耐心/适当调整"等信号词？

2. **通胀描述** — 对当前通胀的定性
   - 用词强度：elevated/persistent/sticky/transitory/moderating
   - 是否提到特定导致通胀的因素（能源/供应链/工资/住房）？

3. **就业市场** — 对劳动力市场的判断
   - 描述：tight/balanced/softening/strong
   - 是否提到工资压力或劳动力供给变化？

4. **风险平衡** — 政策展望中的风险方向
   - 上行风险（通胀反弹、地缘冲突）vs 下行风险（经济放缓、金融紧缩）
   - 是否新增了此前未提及的风险？

5. **异常措辞** — 任何与常规表述不同的词句
   - 意外的强烈/温和措辞
   - 新增的经济术语或政策表述
   - 此前回避但此次明确提及的话题

# Output Format
```json
{
  "利率立场": {
    "extracted": ["关键句1", "关键句2"],
    "direction": "偏鹰/偏鸽/中性",
    "signals": "暗示加息/暗示降息/暗示观望",
    "new_info": true/false,
    "change_description": "与最近表态相比的变化（如有）"
  },
  "通胀描述": { ... },
  "就业市场": { ... },
  "风险平衡": { ... },
  "异常措辞": [
    {
      "passage": "原句",
      "annotation": "为什么这是异常的"
    }
  ]
}
```

# Rules
- 每个维度至少保证 1-2 条提取结果。如果原文中该维度没有明确表述，标注"未提及"并说明
- 引用的原文句必须是逐字引用（翻译版可意译但需标注）
- 标注 `new_info: true` 的判断标准：是否与上次该官员/该会议的表述有明显不同
```

## 示例（基于 7/29 FOMC 声明）

**输入：** 7月29日 FOMC 声明全文

**预期输出（节选）：**
```json
{
  "利率立场": {
    "extracted": [
      "The Committee seeks to achieve maximum employment and inflation at the rate of 2 percent over the longer run",
      "The Committee will deliver price stability"
    ],
    "direction": "偏鹰",
    "signals": "暗示继续维持高利率",
    "new_info": true,
    "change_description": "6月声明未出现'deliver price stability'这种绝对化措辞，本次新增"
  },
  "通胀描述": {
    "extracted": [
      "Inflation remains elevated relative to the Committee's 2 percent goal",
      "reflecting supply shocks that have driven price increases in certain sectors, including energy"
    ],
    "direction": "偏鹰",
    "new_info": true,
    "change_description": "首次明确提及'能源供应冲击'作为通胀驱动因素，与中东冲突关联"
  },
  ...
  "异常措辞": [
    {
      "passage": "The Committee will deliver price stability.",
      "annotation": "极为罕见的绝对化承诺语气。历史上FOMC声明极少使用'will deliver'而非'monitor/assess/seeks'等措辞。这是本声明中最强硬的信号。"
    },
    {
      "passage": "the conflict in the Middle East",
      "annotation": "Fed声明首次明确提及特定地缘冲突。此前最多笼统提到'geopolitical tensions'"
    }
  ]
}
```

## 自定义说明
- 如果你是分析欧央行/英央行的讲话，把 "FOMC" 和美元语境替换为相应的央行和货币
- 建议把 `{{event_type}}` 作为提示词的参数传入，不同类型的文本（讲话 vs 硬数据）关注的重点不同
