#!/usr/bin/env python3
"""
XAUUSD 智能体工作流 · 一键执行器 v2.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
16 个串联 Prompt · DeepSeek 驱动 · 自包含单文件

首次运行会引导设置 API Key。
直接运行:  python xau_workflow.py
传入文本:  python xau_workflow.py --text "FOMC声明全文..."
从文件读:  python xau_workflow.py --file statement.txt
只跑基本面: python xau_workflow.py --stage 1
"""

import json
import os
import sys
import time
import argparse
from datetime import datetime
from pathlib import Path

# ── 配置 ──────────────────────────────────────────────
CONFIG_FILE = Path.home() / ".xau_workflow_config.json"
STATE_FILE  = Path("workflow_state.json")
OUTPUT_DIR  = Path("output")

# ── 16 个 Prompt（全部内嵌，不依赖外部文件） ────────────

PROMPTS = {}

# ═══ 阶段一 · 采集 ═══

PROMPTS[1] = """你是一位宏观信息过滤器，专门识别与黄金（XAUUSD）价格相关的新闻和事件。

当前日期：{date}
当前环境：联邦基金利率 3.50%-3.75%，最新 FOMC（7月29日）9-3 维持不变，通胀仍高于 2% 目标。

输入 — 一批新闻/信息：
{raw_text}

请对每条内容进行两步筛选：
Step 1 — 相关性判断：相关（直接影响利率/美元/避险/通胀）或 无关
Step 2 — 对相关条目标注影响类型：货币政策信号 / 经济数据 / 地缘政治 / 市场结构 / 其他

输出 JSON：
```json
{{
  "relevant": [
    {{"title": "…", "type": ["货币政策信号"], "impact": "正面/负面/中性", "urgency": "高/中/低", "reason": "一句话"}}
  ],
  "irrelevant_count": N,
  "summary": "本批共 X 条，Y 条相关，重点关注 Z"
}}
```"""

PROMPTS[2] = """你是金融信息分析师，从央行讲话/经济报告中提取影响黄金价格的 5 个维度关键点。

输入 — 全文：
{raw_text}
事件类型：{event_type}

从以下 5 个维度提取有"信息增量"的内容：

1. **利率立场** — 加息/降息/观望的信号词
2. **通胀描述** — 用词强度（elevated/persistent/sticky/transitory）
3. **就业市场** — tight/balanced/softening
4. **风险平衡** — 上行风险 vs 下行风险，是否新增风险
5. **异常措辞** — 与历史惯例不同的表述

输出 JSON：
```json
{{
  "利率立场": {{"extracted": ["关键句"], "direction": "偏鹰/偏鸽/中性", "signals": "…", "new_info": true/false, "change_description": "…"}},
  "通胀描述": {{ … }},
  "就业市场": {{ … }},
  "风险平衡": {{ … }},
  "异常措辞": [{{"passage": "原文", "annotation": "为什么异常"}}]
}}
```

每个维度至少 2 条。异常措辞必须逐字引用原文。"""

PROMPTS[3] = """你是数据结构化专家。将前面的 5 维度 JSON 结果压平为标准表格。

输入：
{output_2}

输出一张 Markdown 表格，每个维度一行：

| 维度 | 关键摘录 | 方向(+1/-1/0) | 信号强度(1-5) | 新增信息？ | 变化描述 |

信号强度标准：
- 1 = 微弱（"will monitor"）
- 3 = 中等（"inflation remains elevated"）
- 5 = 强烈（"will deliver price stability"）

如有异常措辞，表格下方单独列出 ⚠ 异常项。"""

# ═══ 阶段二 · AI 分析 ═══

PROMPTS[4] = """你是央行政策分析师。对官员讲话进行 5 维度鹰鸽打分。

背景：当前联邦基金利率 3.50%-3.75%，最新 FOMC 7月29日 9-3 投票维持不变，Hammack/Kashkari/Logan 投加息反对票。通胀仍高于 2% 目标。

讲话关键语句：
{raw_text}

从以下 5 个维度打分，每个 -5 到 +5（正=鹰派，负=鸽派）：
1. 利率指引 — 暗示加息/降息/观望
2. 通胀措辞 — 用词强度
3. 就业评估 — 劳动力市场判断
4. 风险提及 — 新增或强调的风险偏向
5. 语气方向 — 整体措辞的立场偏移

输出 JSON：
```json
{{
  "scores": {{"利率指引":X,"通胀措辞":X,"就业评估":X,"风险提及":X,"语气方向":X}},
  "total": X,
  "verdict": "鹰派(15~25)/偏鹰(5~14)/中性(-4~4)/偏鸽(-14~-5)/鸽派(-25~-15)",
  "certainty": "高/中/低",
  "key_evidence": ["引用原文词句"],
  "risk_flag": "是否触发预警（任意维度≥±2偏移时触发）"
}}
```

如果打分 ≥+3，必须至少一条原文引用。"""

PROMPTS[5] = """你是宏观策略分析师。将鹰鸽打分映射为对 XAUUSD 的 4 条传导路径。

当前 XAUUSD：{current_price}

鹰鸽评分：
{output_4}

请分析 4 条传导路径（每条打分 -3 到 +3，正 = 对金价利好）：

1. **利率预期路径** — 实际利率 ↑ → 金价 ↓ | 实际利率 ↓ → 金价 ↑
2. **美元强弱路径** — 利差扩大 → 美元 ↑ → 金价 ↓ | 利差收窄 → 金价 ↑
3. **风险情绪路径** — 不确定性/地缘 ↑ → 避险 ↑ → 金价 ↑
4. **通胀预期路径** — 通胀粘性超预期 → 抗通胀需求 ↑ → 金价 ↑

输出 JSON：
```json
{{
  "pathways": {{
    "利率预期": {{"score":X, "rationale":"", "confidence":"高/中/低"}},
    "美元强弱": {{"score":X, "rationale":"", "confidence":"高/中/低"}},
    "风险情绪": {{"score":X, "rationale":"", "confidence":"高/中/低"}},
    "通胀预期": {{"score":X, "rationale":"", "confidence":"高/中/低"}}
  }},
  "composite": X,
  "composite_direction": "看涨/中性偏涨/中性/中性偏跌/看跌",
  "dominant_pathway": "",
  "note": ""
}}
```

composite = 四条路径得分之和（-12 ~ +12）。"""

PROMPTS[6] = """你是央行政策历史分析师。将当前讲话与前两次同机构/同官员的表态做多维对比。

本次：
{raw_text}

上次：
{previous_statement}

上上次（如有）：
{previous_statement_2}

逐维度对比（利率立场/通胀措辞/就业评估/风险提及/语气方向 × 3 次），输出：

```json
{{
  "comparisons": [
    {{
      "dimension": "利率立场",
      "本次": "摘要",
      "上次": "摘要",
      "trend": "持续偏鹰/持续偏鸽/由鹰转鸽/由鸽转鹰/不变",
      "magnitude": 1-3,
      "is_reversal": true/false,
      "note": ""
    }}
  ],
  "overall_trend": "",
  "significance": "常规变动/值得注意/重大信号"
}}
```

如果只有一次历史数据，标记"数据不足"。如果 3 次显示一致趋势，significance=重大信号。"""

PROMPTS[7] = """你是分析质检员。检查前面的分析是否存在内部矛盾、逻辑不一致或可疑结论。

事件原文：
{raw_text}

鹰鸽打分（Prompt #4）：
{output_4}

传导路径（Prompt #5）：
{output_5}

历史对比（Prompt #6）：
{output_6}

检查 5 类问题：
1. **内部矛盾** — 5 维度打分之间是否有逻辑矛盾？
2. **路径矛盾** — 4 条传导路径是否有自相矛盾？
3. **引用漂移** — key_evidence 中的引用是否真的来自原文？（对照原文核对）
4. **历史偏差** — 本次偏移幅度是否为此官员历史上从未出现过的？
5. **置信度虚高** — 是否有绝对化措辞但数据薄弱？

输出 JSON：
```json
{{
  "issues_found": [
    {{"type": "内部矛盾/路径矛盾/引用漂移/历史偏差/过度自信", "severity": "严重/中等/轻微", "description": "", "suggested_fix": ""}}
  ],
  "clean": true/false,
  "summary": ""
}}
```

宁错杀不放过。每一个 issue 必须给出具体数据点和修正建议。"""

# ═══ 阶段三 · 人机对比 ═══

PROMPTS[8] = """你是黄金策略分析师。基于前面所有分析，给出你对 XAUUSD 方向的 AI 初步判断。

当前 XAUUSD：{current_price}

鹰鸽评分：{output_4}
传导路径：{output_5}
历史对比：{output_6}
质量审核：{output_7}

输出你的判断：

```json
{{
  "event_id": "{event_id}",
  "timestamp": "",
  "current_price": {current_price},
  "judgment": {{
    "direction": "看涨/看跌/横盘",
    "confidence": 1-10,
    "time_horizon": "描述（如：到下次FOMC前）",
    "target_zone": {{"upside": X, "downside": X}},
    "rationale": "3-5句核心逻辑",
    "uncertainties": ["因素1"],
    "invalidation_condition": "什么情况会证明你错了"
  }}
}}
```

如果 confidence < 4，direction 必须是"横盘"并建议观望。target_zone 基于 current_price 的合理百分比（日内 ±1-3%）。"""

PROMPTS[9] = """这是人工判断输入模板。请交易者回答：

当前 XAUUSD：{current_price}
AI 的初判（仅供参考）：{output_8}

请回答：
1. 你对 XAUUSD 方向的判断？[看涨/看跌/横盘]
2. 确信程度？(1-10)
3. 判断基于什么？
   [ ] 技术面（图表、支撑阻力） — 具体：
   [ ] 基本面（宏观、政策） — 具体：
   [ ] 直觉/经验 — 具体：
4. 与 AI 判断最一致的点？
5. 与 AI 判断最不一致的点？
6. 当前最大风险判断？
7. 备注

输出 JSON：
```json
{{
  "source": "human",
  "direction": "",
  "confidence": 1-10,
  "basis": {{
    "technical": {{"used": true/false, "details": ""}},
    "fundamental": {{"used": true/false, "details": ""}},
    "intuition": {{"used": true/false, "details": ""}}
  }},
  "agree_with_ai": "",
  "disagree_with_ai": "",
  "risk_assessment": "",
  "notes": ""
}}
```"""

PROMPTS[10] = """你是决策审计师。客观对比 AI 和人工判断。

AI 判断：{output_8}
人工判断：{output_9}

逐项对比：
1. 方向一致度
2. 置信度差距
3. 逻辑差异 — AI 侧重什么？人侧重什么？
4. 风险感知差异
5. 分歧严重度

```json
{{
  "direction_match": true/false,
  "confidence_gap": X,
  "logic_divergence": {{
    "ai_focus": ["…"], "human_focus": ["…"],
    "overlap": ["共同点"], "ai_only": ["…"], "human_only": ["…"]
  }},
  "risk_divergence": {{"ai_risk": "", "human_risk": "", "match": true/false}},
  "divergence_score": 1-10,
  "divergence_level": "高度一致(1-3)/部分分歧(4-6)/严重分歧(7-10)",
  "recommendation": "以AI为准/以人为主/各半加权/建议观望（分歧过大）"
}}
```

分歧评分逻辑：方向不一致 +5，置信度差≥3 +2，逻辑无重叠 +2，风险不一致 +1。"""

# ═══ 阶段四 · 决策 ═══

PROMPTS[11] = """你是量化决策引擎。基于预设规则计算最终交易信号。

AI 判断：{output_8}
人工判断：{output_9}
分歧分析：{output_10}
历史准确率：AI=0.5, 人=0.5（暂无足够数据），权重各 50%

决策规则（内置，不可改）：

规则 1 — 方向不一致 → NO TRADE
规则 2 — 加权得分 = (AI置信度×AI准确率×0.5 + 人置信度×人准确率×0.5) / 1.0
规则 3 — 分歧惩罚：
  - 分歧 ≥7 → 得分 ×0.5
  - 分歧 4-6 → 得分 ×0.8
  - 分歧 ≤3 → 不惩罚
规则 4 — 信号阈值：
  - ≥7.0 → STRONG_SIGNAL（标准仓位）
  - 5.0-6.9 → WEAK_SIGNAL（半仓）
  - 3.0-4.9 → MONITOR（观望）
  - <3.0 → NO_TRADE

输出 JSON：
```json
{{
  "decision": "STRONG_SIGNAL/WEAK_SIGNAL/MONITOR/NO_TRADE",
  "direction": "LONG/SHORT/NONE",
  "position_size": "标准(100%)/半仓(50%)/零",
  "weighted_score": X.X,
  "score_breakdown": {{
    "ai_contribution": X, "human_contribution": X,
    "divergence_penalty": X, "anti_rule_check": "通过/触发"
  }},
  "caution": ""
}}
```"""

PROMPTS[12] = """你是交易复盘分析师。对本次完整工作流进行事后审计。

工作流输出（#8）：{output_8}
人工判断（#9）：{output_9}
决策结果（#11）：{output_11}

实际交易结果：{trade_result}
复盘时已知的信息：{hindsight}

按以下框架复盘：

1. **信号质量** — 鹰鸽打分事后看准吗？传导路径判断合理吗？
2. **决策质量** — 决策矩阵的得分合理吗？有没有规则说不行但执意做了？
3. **信息缺口** — 决策时少了什么信息？如果有会不同吗？
4. **流程改进** — 哪个 Prompt 要调整？有没有新的信号要加入？
5. **知识更新** — 学到了什么规律？

```json
{{
  "outcome": {{"result": "盈利/亏损/未触发", "pnl": X}},
  "signal_audit": {{"prompt4_accuracy": "准确/不准确/无法判断"}},
  "decision_audit": {{"rule_followed": true/false, "overrides": []}},
  "information_gaps": [],
  "process_improvements": [],
  "lessons": [],
  "archive_tag": []
}}
```

不要写"我觉得"。lessons 必须是可行动的——"以后 XX 条件出现时应更谨慎"，不是"以后要更小心"。"""

# ═══ 阶段五 · 黄金技术面与执行 ═══

PROMPTS[13] = """你是 XAUUSD 技术分析师。基于以下数值判断当前技术结构。

当前价格：{current_price}
分析周期：{timeframe}
基本面偏向：{output_8}

技术水平数据：
| 指标 | 数值 |
|------|------|
| 近期高点 | {recent_high} |
| 近期低点 | {recent_low} |
| 短期均线 | {ma_short} |
| 长期均线 | {ma_long} |
| RSI(14) | {rsi} |
| 成交量 | {volume_note} |
| 形态 | {pattern_notes} |
| 价格结构 | {price_structure} |

请分析：
1. 趋势判断（多头/空头/震荡，强度 1-5）
2. 关键阻力位（2个）和支撑位（2个）
3. RSI 信号（超买/超卖/中性，是否有背离）
4. 均线信号（金叉/死叉，发散/收敛）
5. 技术面结论：偏多/偏空/中性，置信度 1-10
6. 与基本面的一致/矛盾 — 如果不一致，哪个可能主导？

```json
{{
  "trend": {{"direction": "多头/空头/震荡", "strength": 1-5}},
  "key_levels": {{"resistances": [{{"price":X, "reason":""}}], "supports": [{{"price":X, "reason":""}}]}},
  "rsi": {{"value":X, "zone": "超买/超卖/中性", "divergence": true/false, "direction": "上升/下降"}},
  "ma": {{"golden_cross": true/false, "price_vs_ma": "之上/之下", "ma_trend": "发散/收敛"}},
  "tech_conclusion": {{"direction": "偏多/偏空/中性", "confidence": 1-10}},
  "vs_fundamental": {{"consistent": true/false, "comment": ""}}
}}
```"""

PROMPTS[14] = """你是黄金市场分析师。分析 XAUUSD 的 6 个特有驱动因子。

当前 XAUUSD：{current_price}
DXY：{dxy}
美国 10Y TIPS 实际收益率：{real_yield}

黄金特有因子数据：
| 因子 | 数据 |
|------|------|
| GLD ETF 持仓 | {etf_holdings} |
| 央行购金动态 | {cb_buying} |
| CME 期货持仓 | {cme_futures} |
| 印中实物需求 | {india_china_demand} |

逐一打分（+3 到 -3，正=利好金价）：

1. 实际利率 — TIPS 收益率 vs 金价反向关系
2. 美元 (DXY) — DXY 位置和趋势
3. ETF 资金流 — 机构资金流入/流出
4. 央行购金 — 全球央行购金趋势
5. 实物需求 — 印度/中国季节性需求
6. 投机仓位 — CME 净多头持仓极端程度

```json
{{
  "factors": {{
    "实际利率": {{"score":X, "assessment":""}},
    "美元":     {{"score":X, "assessment":""}},
    "ETF资金流":{{"score":X, "assessment":""}},
    "央行购金":  {{"score":X, "assessment":""}},
    "实物需求":  {{"score":X, "assessment":""}},
    "投机仓位":  {{"score":X, "assessment":""}}
  }},
  "composite_gold_score": X,
  "dominant_factor": "",
  "warning": ""
}}
```

composite_gold_score = 6 个因子之和（-18 ~ +18）。"""

PROMPTS[15] = """你是 XAUUSD 交易策略师。确认入场计划。

当前价格：{current_price}
ATR(14)：{atr}
决策信号：{output_11}
技术面分析：{output_13}

Step 1：入场条件审核
[ ] 条件1：决策信号 STRONG 或 WEAK
[ ] 条件2：基本面和技术面方向一致
[ ] 条件3：当前价格离最近关键位 ≥ 0.5 ATR
[ ] 条件4：12h 内无重大数据（NFP/CPI/FOMC）
[ ] 条件5：日内波幅 < 2 ATR

Step 2：入场价位
- 激进（市价）vs 保守（回撤入场），建议哪个？

Step 3：止损 = 1.5×ATR，放在关键价位之下/之上

Step 4：止盈 — TP1(第一关键位) 和 TP2(第二关键位)，计算盈亏比

```json
{{
  "entry_check": {{"all_clear": true/false, "missing": []}},
  "entry": {{"direction": "LONG/SHORT", "price": X, "type": "市价/回撤"}},
  "stop_loss": {{"price": X, "distance_atr": X, "based_on": ""}},
  "take_profit": {{"tp1": {{"price": X, "rr": X}}, "tp2": {{"price": X, "rr": X}}}},
  "warnings": []
}}
```

盈亏比 < 1.5 时标注警告但不阻止。"""

PROMPTS[16] = """你是风险管理师。执行仓位和风险计算。

账户余额：{account_balance}
当前已有风险暴露：{current_exposure}
允许最大回撤：{max_drawdown_pct}%
入场计划：{output_15}
最近交易：{recent_trades}

1. 仓位计算
   - Kelly 公式（保守版 Kelly/4）：f* = (胜率×(盈亏比+1)-1)/盈亏比
   - 2% 单笔风险规则
   - 取较小者

2. 压力测试 — 连亏 3 笔回撤？连亏 5 笔？是否超最大回撤？

3. 风控清单
[ ] 单笔风险 ≤2%
[ ] 总暴露 ≤6%
[ ] 盈亏比 ≥1.5
[ ] 止损有技术意义
[ ] 周度亏损未超限

```json
{{
  "position": {{"kelly_pct": X, "two_percent_lots": X, "final_lots": X, "risk_pct": X}},
  "stress_test": {{"dd_3_losses_pct": X, "dd_5_losses_pct": X, "exceeds_limit": true/false}},
  "checklist": {{"all_clear": true/false, "failed_items": []}},
  "final_approval": "APPROVED/CAUTION/REJECTED"
}}
```"""


# ── API 调用 ─────────────────────────────────────────

def load_config():
    if CONFIG_FILE.exists():
        try: return json.loads(CONFIG_FILE.read_text())
        except: pass
    return {}

def save_config(cfg):
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    try: CONFIG_FILE.chmod(0o600)
    except: pass

def setup_wizard():
    print("\n  ╔══════════════════════════════════════╗")
    print("  ║   XAUUSD 智能体工作流 · 首次设置    ║")
    print("  ╚══════════════════════════════════════╝\n")
    print("  使用 DeepSeek API 驱动所有 Prompt。")
    print("  获取 Key: https://platform.deepseek.com → API Keys\n")
    key = input("  请输入 DeepSeek API Key (sk-...): ").strip()
    if not key:
        print("\n  ✗ 未输入 Key。下次运行再次引导。\n")
        sys.exit(0)
    cfg = load_config()
    cfg["api_key"] = key
    save_config(cfg)
    print(f"\n  ✓ Key 已保存到 {CONFIG_FILE}\n")
    return key

def get_api_key():
    cfg = load_config()
    k = cfg.get("api_key", "") or os.environ.get("DEEPSEEK_API_KEY", "")
    if k:
        return k
    return ""

def call_deepseek(api_key, prompt, system="你是一位专业的 XAUUSD 金融市场分析师。请严格按输出格式回复 JSON。只输出 JSON，不要有任何额外解释。"):
    try:
        from openai import OpenAI
    except ImportError:
        print("  [!] 安装依赖: pip install openai")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "openai", "-q"])
        from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    resp = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        max_tokens=4096
    )
    return resp.choices[0].message.content


# ── 工具函数 ─────────────────────────────────────────

def extract_json(text):
    """从 AI 回复中提取 JSON 片段"""
    if not text: return {}
    text = text.strip()
    # 尝试直接解析
    try: return json.loads(text)
    except: pass
    # 尝试提取 ```json ... ```
    import re
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if m:
        try: return json.loads(m.group(1).strip())
        except: pass
    # 尝试找 { ... }
    m = re.search(r'\{[\s\S]*\}', text)
    if m:
        try: return json.loads(m.group(0))
        except: pass
    return {"_raw": text}

def spinner(msg, stop_event=None):
    """简单旋转指示器"""
    frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]
    i = 0
    while True:
        sys.stdout.write(f"\r  {frames[i % len(frames)]} {msg}")
        sys.stdout.flush()
        i += 1
        time.sleep(0.08)


# ── 主流程 ───────────────────────────────────────────

def run_pipeline(api_key, raw_text, stage="all", event_id="", ctx_overrides=None, dry_run=False):
    """执行工作流"""
    ctx = {
        "raw_text": raw_text,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "event_type": "央行讲话",
        "current_price": "（请填入最新 XAUUSD 价格）",
        "previous_statement": "（暂无上次讲话数据）",
        "previous_statement_2": "",
        "timeframe": "4H",
        "recent_high": "（请填入）", "recent_low": "（请填入）",
        "ma_short": "（请填入）", "ma_long": "（请填入）",
        "rsi": "（请填入）", "volume_note": "（请填入）",
        "pattern_notes": "（请填入）", "price_structure": "（请填入）",
        "dxy": "（请填入）", "real_yield": "（请填入）",
        "etf_holdings": "（请填入）", "cb_buying": "（请填入）",
        "cme_futures": "（请填入）", "india_china_demand": "（请填入）",
        "atr": "（请填入）",
        "account_balance": "（请填入）", "current_exposure": "0",
        "max_drawdown_pct": "20", "recent_trades": "（无）",
        "event_id": event_id or f"XAU-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
    }
    if ctx_overrides:
        ctx.update(ctx_overrides)

    results = {}
    event_id = ctx["event_id"]
    OUTPUT_DIR.mkdir(exist_ok=True)

    # 确定执行范围
    if stage == "1":
        steps = range(1, 4)   # 只跑基本面采集
    elif stage == "2":
        steps = range(10, 13) # 只跑人机对比+决策
    else:
        steps = range(1, 17)

    stage_names = {
        1:"信息筛选",2:"关键提取",3:"结构化",4:"鹰鸽打分",
        5:"多维影响",6:"历史对比",7:"异常检测",8:"AI初判",
        9:"人工判断",10:"人机分歧",11:"决策矩阵",12:"事后复盘",
        13:"技术分析",14:"黄金因子",15:"入场确认",16:"仓位风险"
    }

    print(f"\n  {'─'*50}")
    print(f"  事件: {event_id}  |  DeepSeek Chat  |  共 {len(list(steps))} 步")
    print(f"  {'─'*50}")

    for step in steps:
        name = stage_names.get(step, f"#{step}")
        print(f"\n  ▸ Step {step}/16: {name} ", end="", flush=True)
        t0 = time.time()

        if step == 9:
            # 人工判断 — 展示 AI 初判，等用户输入
            print("\n    ╔══════════════════════════════════╗")
            print("    ║  ⚠ 人工判断环节                ║")
            print("    ║  请根据你的经验输入判断        ║")
            print("    ╚══════════════════════════════════╝")
            if 8 in results:
                prev = results[8]
                try:
                    j = json.loads(prev)
                    d = j.get("judgment", j)
                    print(f"    AI 判: {d.get('direction','?')}, 置信度 {d.get('confidence','?')}")
                except:
                    print(f"    AI 判: {prev[:200]}...")
            print("    请输入你的判断（完成后 Ctrl+D）:")
            lines = []
            try:
                while True:
                    lines.append(input())
            except EOFError:
                pass
            # 将人工输入格式化为 JSON
            human_text = "\n".join(lines)
            # 尝试解析：如果人工输入的是 JSON，直接存；否则存为文本
            try:
                results[step] = json.loads(human_text)
            except:
                results[step] = human_text
            ctx["output_9"] = human_text
            print(f"    ✓ 人工判断已记录")
            continue

        # 构建 Prompt
        template = PROMPTS.get(step, "")
        for _ in range(5):
            for k, v in ctx.items():
                if isinstance(v, (dict, list)):
                    v = json.dumps(v, ensure_ascii=False)
                template = template.replace(f"{{{k}}}", str(v) if v else "")

        # 调用 DeepSeek
        try:
            if dry_run:
                print(f"\n    [DRY RUN] Prompt {step}: {name}")
                print(f"    ── Prompt 长度: {len(template)} 字符 ──")
                print(f"    {template[:300]}...")
                results[step] = f"[DRY RUN] Prompt #{step}"
                ctx[f"output_{step}"] = f"{{'dry_run': true, 'step': {step}}}"
            else:
                response = call_deepseek(api_key, template)
                parsed = extract_json(response)
                results[step] = response
                ctx[f"output_{step}"] = response
                elapsed = time.time() - t0
                print(f"✓ ({elapsed:.1f}s)", flush=True)
        except Exception as e:
            print(f"\n    ✗ DeepSeek 调用失败: {e}")
            print(f"    提示: 检查 API Key、网络、余额")
            break

        time.sleep(0.5)

    # 保存结果
    out_file = OUTPUT_DIR / f"{event_id}.json"
    out_file.write_text(json.dumps({
        "event_id": event_id,
        "timestamp": datetime.now().isoformat(),
        "results": {str(k): v for k, v in results.items()},
        "context": {k: v for k, v in ctx.items() if k.startswith("output_")}
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n  {'═'*50}")
    print(f"  ✓ 完成 — 结果已保存到 {out_file}")
    return results


# ── CLI ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="XAUUSD 智能体工作流 · 16 Prompt 一键执行")
    parser.add_argument("--text", default="", help="直接传入分析文本")
    parser.add_argument("--file", default="", help="从文件读取")
    parser.add_argument("--stage", default="all", choices=["1","2","all"], help="1=基本面 2=决策 all=全流程")
    parser.add_argument("--event-id", default="", help="事件编号")
    parser.add_argument("--setup", action="store_true", help="重新配置 API Key")
    parser.add_argument("--dry-run", action="store_true", help="仅打印 Prompt 不调 API（预览用）")
    parser.add_argument("--show", type=int, default=0, help="查看指定 Prompt 的完整文本（如 --show 4）")
    args = parser.parse_args()

    if args.show:
        if args.show in PROMPTS:
            print(f"\n  Prompt #{args.show} 完整文本:\n{'='*60}\n")
            print(PROMPTS[args.show])
            print(f"\n{'='*60}")
        else:
            print(f"  ✗ Prompt #{args.show} 不存在 (1-16)")
        sys.exit(0)

    if args.setup:
        CONFIG_FILE.unlink(missing_ok=True)
        setup_wizard()

    # dry-run 和 show 不需要 API Key
    if args.dry_run or args.show:
        api_key = get_api_key() or "dry-run-no-key-needed"
    else:
        api_key = get_api_key()
        if not api_key:
            api_key = setup_wizard()

    if args.file:
        raw_text = Path(args.file).read_text(encoding="utf-8")
    elif args.text:
        raw_text = args.text
    elif args.dry_run:
        raw_text = "(dry-run mode, no real input)"
    else:
        print("\n  请输入要分析的文本（央行讲话 / 宏观报告 / 新闻全文）")
        print("  粘贴后按 Enter，再按 Ctrl+D 开始分析\n")
        lines = []
        try:
            while True:
                lines.append(input())
        except EOFError:
            pass
        raw_text = "\n".join(lines)

    if not raw_text.strip():
        print("  ✗ 没有输入。用法: python xau_workflow.py --text '...'")
        sys.exit(1)

    run_pipeline(api_key, raw_text, stage=args.stage, event_id=args.event_id, dry_run=args.dry_run)

if __name__ == "__main__":
    main()
