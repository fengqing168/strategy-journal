# 全站元素方案（SITE ARCHITECTURE）

> 本文件是 shujian.cc 的「基础上」：全站结构、组件、K线三线框架、后台 API、设计变量。
> 每次在这个站点上做优化/修复/新增，都以本文为底，避免改乱结构。
> 最后更新：2026.08.08

---

## 0 · 站点一句话定位

漏斗型「站即产品」站点，唯一目标是促成「AI 智能体工作流（¥199）」购买。
所有内容皆为证据，所有路径皆向购买。人设：金融圈有认知高度的人，话不多，每句精准（专业但不晦涩）。

**全站四句强句（默认保留）**
- AI 做分析，人来做判断。
- 这里没有确定性。只有过程。
- AI 不是答案，是问法。
- 不是更快，是更完整。

**导航（全站统一 4+1）**
```
工作流(/) | 运行日志(search.html) | 关于(about.html) | 订阅(subscribe.html)   [获取完整版 → purchase.html]
```
- 第1项「工作流」指 index.html（首页=工作流落地页）
- 「获取完整版」统一指向 purchase.html
- 任何页面都有 ≥1 条「向前一步」的购买路径

---

## 二 · 前端页面（10 个 html）

| 文件 | 页面 | 作用 |
|---|---|---|
| `index.html` | 工作流落地页(首页 `/`) | Hero + 右侧「最新发布预览」K线卡 + 信任条 + 工作流5阶段16节点 + 样本运行 + 履约清单 + FAQ + 购买咨询弹窗 |
| `search.html` | 运行日志列表 | LATEST 置顶卡 + 日志卡片表格（已发布#001/#002，无「选题中」占位）+ 搜索 + 标签筛选 |
| `logs/001.html` | 日志 #001 | 为什么开始记录 AI 策略研究系列（写作缘起） |
| `logs/002.html` | 日志 #002 | 预判在先：4000 底部破位追多，目标 4250（含 K 线图） |
| `workflow.html` | 一键运行器 | 独立工作流演示/交互页 |
| `subscribe.html` | 订阅 | 每周运行实况邮件订阅 |
| `purchase.html` | 获取完整版 | ¥199 购买页（收款码） |
| `about.html` | 关于 | 舍予又见 + 第二屏幕自我介绍 |
| `library.html` | 资料库 | 研究概念索引 |
| `product.html` | 产品介绍 | AI 智能体工作流 |
| `admin.html` | 管理后台 | token 授权 / 订单核对后台（有登录门禁） |

---

## 三 · 静态资源

| 文件 | 说明 |
|---|---|
| `styles.css`（~500 行） | 全站设计变量 + 组件样式；颜色板用小变量 `--card --border --text` 等 |
| `js/main.js` | 全站通用交互（fade-in 动画、导航等） |
| `js/ticker.js` | 顶部行情滚条（多品种 XAUUSD/EURUSD…） |
| `js/kline.js` | K 线组件（lightweight-charts 封装，离线可跑） |
| `js/vendor/lightweight-charts.standalone.production.js` | K线图表库 |
| `_headers` | Cloudflare 安全响应头（X-Frame-Options 保护） |
| `data/xau_daily.jsonp` / `xau_daily_recent.json` | XAU 日线兜底数据（fetch 失败时用） |
| `images/` | 收款码（微信/支付宝）等 |

---

## 四 · 设计系统（styles.css 核心变量）

```css
背景/卡片：--bg #0F1118 → --card #181B28 → --card2 #1E2133
边框:      --border #252940（--border-soft / --border-strong 另两档）
主色:      --accent #6366F1 (indigo)；渐变 --grad #6366F1→#8B5CF6
正文:      --text #E2E4F0；次要 --text-sec；弱 --text-muted
涨跌:      --up #34D399(绿) / --down #F87171(红)
圆角:      --radius 12px；字体: 系统 + JetBrains Mono(数字/代码)
```

---

## 五 · K 线组件 ⭐（kline.js 三线框架）

这是全站最常改的部分。用法：任意页面放 `<div class="kline">` 并传属性。

| 属性 | 含义 | 示例 |
|---|---|---|
| `data-interval` | 单周期 1d/4h/1h | `data-interval="4h"` |
| `data-intervals` | 多周期上下堆叠 | `data-intervals="4h,1h"` |
| `data-start` / `data-end` | 日期范围 | `data-start="2026-08-05" data-end="2026-08-07"` |
| `data-cut` | 定格时间戳（unix秒），K线只显示 ≤cut | `data-cut="1785895200"` |
| `data-title` / `data-hint` | 图上方标题 / 图下方说明 | |
| `data-mark` | 画线标注 JSON 数组 | 见下 |

**data-mark 结构（三线标准框架）**
```js
[
  {price:4150, label:"",             color:"#22D3EE", style:"dashed", ray:true, from:1785895200},  // 观察=水平向右长射线
  {price:4020, label:"止损", color:"#EF4444", style:"dashed"},                                        // 止损=贯穿横虚线
  {price:4250, label:"目标", color:"#10B981", style:"dashed"},                                        // 目标=贯穿横虚线
]
```
- **观察位**：带 `ray:true` → `addRay()`，只画从 `from` 时刻向右的水平射线，不向右全图贯穿（视图里价格触达后再延伸）。
- **止损 / 目标**：走 `addMark()`，横向贯穿全图虚线 + 右侧轴标签文字。
- **kline.js 里的过滤铁律**：`4h`/`1h` 请求失败时禁止回退到日线兜底（日线单根会吞掉定格语义，引发“到了目标位”的假象），必须走在线 TradingView 数据。
- 时间表：`data-cut` 只保留 time ≤ cut 的 K 线 —— 用于「预判框」定格观察触及不该出现后续K线。

**两个框的分工（logs/002 双K线）**
1. 判断框（预判画面）：`data-cut` 定在观察 4150 触及的那根K线，之后 K线不再出现——证明「预判在先」。
2. 实时框（验证画面）：无 `data-cut`，展示从介入点到目标 4250 触及/越过全段 → 证明「预判兑现」。

---

## 六 · 后台 API（worker.js，Cloudflare Worker）

线上路径 `https://shujian.cc/api/*`，约 395 行。

| 端点 | 用途 |
|---|---|
| `/api/sina` | 新浪行情代理（5 品种实时价） |
| `/api/kline` | XAUUSD K线（TradingView 源，统一 1d/4h/1h，支持 start/end/limit） |
| `/api/token/generate` | 生成 Token（需密码 pw） |
| `/api/token/validate` | 校验 Token |
| `/api/order/create` | 创建待确认订单 |
| `/api/order/list` | 列出订单（需密码） |
| `/api/order/approve` | 确认订单 → 发放 Token |
| `/api/order/status` | 查询订单状态 |
| `/api/subscribe` | 订阅邮件 + 自动回复（需 RESEND_API_KEY） |
| `/api/ping` | 健康检查 |

---

## 七 · 工作流系统本体（workflow/）

这套站点的「商品本体」= 16 步 AI 智能体流水线。

| 类别 | 文件 |
|---|---|
| 16 步 Prompt | prompt-01 信息源筛选 → prompt-16 仓位风控（06)

| 自动化脚本 | `news_scraper.py`(新闻抓取)、`xau_workflow.py`+`pipeline_worker.py`(16节点串联执行)、`threshold_calculator.py`(置信度阈值)、`generate_token.py`(本地token生成) |
| 规则文档 | `confidence_r.md`(置信度规则表) |
| 启动器 | `启动工作流.bat`(Windows一键启动)、`构建exe.bat` |
| 演示页 | `xau_workflow.html`(可视化工作流页) |

---

## 八、后台（admin）

- `admin.html`：管理面板（token 生成/订单列表/订单确认）。密码门禁。
- `admin/index.html`：一个指向 admin.html 的占位页。
- 线上入口：`https://shujian.cc/admin`（worker 自动 301/307 过渡）

---

## 九 · 修改时务必遵守（AGENTS.md 摘要）

1. **语言基座**：专业但不晦涩；短句开长句收；书面化；禁推销腔。
2. 禁用词：「搞定、跑通、踩坑、坦白局、绝对、保证赚钱、不卖课不喊单」等一律换书面语。
3. 验收闭环：禁用词扫描 → 每页 ≥1 句可记住的人设句 → 读一遍不卡壳。
4. 图表实情核实：K线数据可「预判在先」→ 预判框必须定格在观察触及处，不出现后续 K 线；实时框才显示后续到达目标的验证段。
5. 术语：三线固定为「观察 / 止损 / 目标」，跟随用户取舍决定图上是否出现「观察」字样。
6. **git 流程**：改动后先 `git status` 看差异 → `git commit` → `git push origin master`（Cloudflare Pages 自动部署，1-2 分钟生效）。