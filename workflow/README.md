# AI 智能体工作流 · 完整系统

> 一套基于 AI 智能体的 XAUUSD 策略研究流水线。12 个串联 Prompt + 置信度规则 + Python 脚本。
> 不是"AI 替你决策"——而是用 AI 跑完从信息收集到决策验证的全过程，留一份可供审阅、可反复使用的思考外脑。

---

## 快速开始

### 1. 理解架构

工作流按 4 阶段 12 个 Prompt 串联执行：

```
🔍 阶段一 · 采集          🧠 阶段二 · AI分析       ⚖️ 阶段三 · 人机对比      ✅ 阶段四 · 决策
  Prompt #1 信息源筛选      Prompt #4 鹰鸽打分 ⭐     Prompt #8  AI初判        Prompt #11 加权决策
  Prompt #2 关键点提取      Prompt #5 多维影响        Prompt #9  人工判断       Prompt #12 事后复盘
  Prompt #3 结构化格式化    Prompt #6 历史对比        Prompt #10 人机分歧
                           Prompt #7 异常检测
```

⭐ = Prompt #4 免费公开在 [shujian.cc/product.html](https://shujian.cc/product.html)

### 2. 手动运行（推荐入门）

逐行阅读 `prompts/` 目录下的 Prompt 文件，按编号顺序逐个粘贴到 Claude/GPT 对话窗口。

```
1. 打开 Claude 或 ChatGPT
2. 打开 prompts/prompt-01-信息源筛选.md
3. 复制 "## 完整 Prompt" 之后的内容
4. 将 {{变量}} 替换为实际值后发送
5. 将 AI 的输出保存下来，作为下一个 Prompt 的 {{输入}}
6. 重复 #2-#12
```

### 3. 自动化运行

安装依赖后，用 `pipeline_runner.py` 串联执行：

```bash
pip install anthropic feedparser requests
export ANTHROPIC_API_KEY="sk-ant-xxx"

# 传入原始文本，自动跑完全流程
python pipeline_runner.py --event-id FOMC-20260729 --raw-text fomc_statement.txt

# 只跑到 Prompt #4（先看鹰鸽打分）
python pipeline_runner.py --event-id FOMC-20260729 --raw-text fomc_statement.txt --step 4

# 试运行（不调用 API，只检查流程）
python pipeline_runner.py --dry-run
```

### 4. 单独使用计算器

```bash
# 用具体参数计算决策信号
python threshold_calculator.py --ai-conf 7 --human-conf 5 --divergence 4

# 交互模式逐项输入
python threshold_calculator.py --interactive

# 查看所有测试场景
python threshold_calculator.py --test
```

---

## 文件结构

```
.
├── README.md                    # 本文件
├── prompts/                     # 12 个 Prompt 模板（Markdown）
│   ├── prompt-01-信息源筛选.md
│   ├── prompt-02-事件关键点提取.md
│   ├── prompt-03-结构化格式化.md
│   ├── prompt-04-鹰鸽打分.md        ← 免费公开版
│   ├── prompt-05-多维影响评估.md
│   ├── prompt-06-历史语境对比.md
│   ├── prompt-07-矛盾与异常检测.md
│   ├── prompt-08-AI初判输出.md
│   ├── prompt-09-人工判断输入.md
│   ├── prompt-10-人机分歧对比.md
│   ├── prompt-11-加权决策矩阵.md
│   └── prompt-12-事后复盘模板.md
├── scripts/
│   ├── news_scraper.py           # 新闻抓取器
│   ├── pipeline_runner.py        # Prompt 串联执行器
│   └── threshold_calculator.py   # 置信度阈值计算器
├── rules/
│   └── 置信度规则表.md            # 阈值、权重、反例排除
└── examples/
    └── 案例001-7月FOMC鸽派措辞.md # 基于实际事件的走通示例
```

---

## 支持的 AI 模型

| 模型 | 兼容性 | 备注 |
|------|-------|------|
| Claude (Sonnet/Opus) | ✅ 完全兼容 | 推荐，所有 Prompt 基于 Claude 构建并实测 |
| GPT-4 / GPT-4o | ✅ 兼容 | JSON 输出格式偶尔需要额外提示"请严格输出 JSON" |
| 通义千问 (Qwen) | ✅ 兼容 | Prompt 中包含中文金融术语，通义理解良好 |
| Gemini 2.5 Pro | ✅ 兼容 | 长篇 Prompt 可能需要确认上下文窗口限制 |

每个 Prompt 标注了针对不同模型的调整建议。

---

## 常见问题

**Q: 运行全部 12 个 Prompt 需要多长时间？**
A: 手动逐个运行约 30-45 分钟。自动化串联约 5-8 分钟（Claude Sonnet）。

**Q: 运行全部 12 个 Prompt 需要多少 API 费用？**
A: Claude Sonnet 约 $0.50-1.00 / 次（所有 Prompt 合计约 15k-25k tokens 输入）。手动模式（网页版 ChatGPT/Claude）完全免费。

**Q: Prompt #9（人工判断）怎么自动化？**
A: 不能也不应该——这是你（交易者）的输入步骤。自动化运行到此步骤会暂停，等你手动填完再继续。

**Q: 我的历史准确率太低，可以调整权重吗？**
A: 可以。编辑 `rules/置信度规则表.md` 中的准确率数值和权重。建议积累至少 10 次实际交易数据后再调整。

---

## 更新日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-08-06 | v1.0 | 初始版本。12 个 Prompt + 3 个脚本 + 置信度规则表 |

---

**舍予又见** · [策略研究日志](https://shujian.cc)
