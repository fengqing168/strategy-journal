# 站点语言基座（Copy System）

本站是「站即产品」的漏斗型站点，唯一目标是促成 AI 智能体工作流（¥199）购买。所有内容皆为证据，所有路径皆向购买。每次改动或新增内容前，先读本文件。

## 一、声音定义（Identity）

人设：一个在金融圈有认知高度的人。话不多，每句精准。克制、审慎、有分寸。

**最高铁律：专业但不晦涩。** 用浅白的话讲深的内容。一句话让普通人一读就懂，绝不因术语而卡壳。可用专业用词，但不堆砌、不深奥。

**四句强句（全站锚点，默认保留）：**
- AI 做分析，人来做判断。
- 这里没有确定性。只有过程。
- AI 不是答案，是问法。
- 不是更快，是更完整。

## 二、通用语言规则（Syntax）

1. 短句开，长句收；段落先给判断句。
2. 术语可用但不堆砌，密度低；能用普通词讲清就不上术语。
3. 克制度：结论只说一遍，不用感叹号煽情，不自我感动。
4. 书面化：口语一律改书面。
5. 禁推销腔：不做夸大承诺，不给空头保证。

### 禁用词清单
搞定、跑通、踩坑、坦白局、给力、绝了、宝子、家人们、5分钟内、免费送、免费拿、亏了没关系、绝对、保证赚钱、不卖课不喊单（改书面）。

## 三、组件级模板（Component Copy Kit）

| 组件 | 结构 |
|---|---|
| hero 主标 | 判断句，6~12 字，可带收势 |
| hero 副标 | 「不…，只…」价值句 |
| section 标题 | 语义词 + EN 小标 |
| 功能卡 | 标题=价值结果；描述=机制+收益 |
| FAQ | 问=真实顾虑；答=结论+理由，禁推销腔 |
| CTA | 动词开头 + 明确结果 |
| 日志/文章 | 主题→做了什么→AI输出→工具优化→市场观察→takeaway |
| 空状态/表单/弹窗 | 一律书面、克制 |

## 四、验收闭环（每处产出自检）

- 禁用词扫描 → 无口语/推销词残留
- 每页 ≥1 句可被记住的人设句
- 读一遍不卡壳（不只是圈内人，外行也顺）
- 组件符合模板结构

## 五、导航结构（全站统一 4+1）

```
工作流(/=index) | 运行日志(search) | 关于 | 订阅      [获取完整版 → purchase]
```

- 第 1 项「工作流」指向首页根路径 index.html（首页=工作流落地页）
- 第 2 项「运行日志」指向 search.html
- 「获取完整版」统一指向 purchase.html
- 任何页面都有 ≥1 条「向前一步」的购买路径

## 六、日志发布工作流（自动发布 SOP）

发一篇日志 = 三步，缺一不可：

### 1. 触发
交易日志不发固定格式稿，由**行情触发**：
- 用户报当前价位，问「黄金目前有没有进场的机会」→ 先取实时行情：
  - `curl https://shujian.cc/api/sina` → 实时价（hf_XAU.price）
  - `curl "https://shujian.cc/api/kline?symbol=XAU&interval=4h&limit=N"` → 实时 K 线
- 基于实时价 + 判断框三线（观察/止损/目标）给出进场判断并写进「判断段·实时」。

### 第 2 步. 发布由工具执行
用 `workflow/publish.py` 一键完成，禁止手改多个文件：

```bash
python3 workflow/publish.py drafts/xxx.json
# 预览: python3 workflow/publish.py drafts/xxx.json --dry-run
# 仅生成不推送: python3 workflow/publish.py drafts/xxx.json --no-push
```

草稿 JSON 字段见文件头注释。脚本会自动：
- 生成 `logs/NNN.html`（基于 `logs/_template.html`）
- 同步 `search.html`（featured + grid 卡片 + JS data 数组 + 统计+1）
- 同步 `index.html`（最新发布预览卡链接与判断/结果行）
- git add/commit/push → Cloudflare Pages 自动部署

### 第 3 步. 一条铁律：logs 与 search 必须同批同步
发日志页只改了 `logs/NNN.html` 而漏了 `search.html` = 发布未完成。发布时用脚本同批更新，`search.html` data 数组永远与 `logs/` 一一对应。

## 七、防崩红线（最高优先级，谁都不许碰）

> 本站整站由 `strategy-journal` Worker + Workers Static Assets 共同服务。
> **任何部署若不带 assets，整站立即变成 JSON 404（曾两次发生）。**

### 红线规则（每次部署必须遵守）
1. **部署命令固定为**：
   ```bash
   npx wrangler deploy worker.js --name strategy-journal --assets .
   ```
   严禁不带 `--assets .` 的 deploy；严禁只 deploy worker 而不带静态站。
2. **`wrangler.toml` 已固化 `[assets]` 配置**（directory = ".", binding = "ASSETS"），理论上即使命令漏写 `--assets` 也会默认带上。但为保险，部署时必须核对输出里有 `env.ASSETS Assets` 绑定。
3. **git push ≠ 部署**。push 只是备份；线上内容完全由 `wrangler deploy` 决定。改完前端/worker 不 deploy = 线上没变。
4. **部署后必须立即验证**（用 curl 逐项确认，不能只靠感觉）：
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://shujian.cc/          # 期望 200
   curl -s -o /dev/null -w "%{http_code}\n" https://shujian.cc/js/ticker.js # 期望 200
   curl -s https://shujian.cc/api/ping                                     # 期望 {"ok":true,...}
   ```
   任一非 200 → 立即回滚/重部署，绝不放行。
5. **回滚方式**：`npx wrangler rollback` 或重新执行标准部署命令（带 assets）。
6. **涉及域名/DNS/zone 的操作 = 红线中的红线**：任何修改前先记录现状，改完立刻全面验证；不改则不碰。
7. **worker.js 兜底逻辑不得删**：worker.js 末尾 `if (env && env.ASSETS) return env.ASSETS.fetch(request)` 是最后防线，非 /api 请求必须交给 assets，禁止移除。

### 事故记录（2026-08-08）
- 事故一：本地 deploy 未带 assets → 整站 `{"error":"not_found"}`（application/json）。
- 事故二：修复 ticker（补回 doFetch 后）部署成功后 2 分钟内，又有一次不带 assets 的部署覆盖 → 再次整站 404。
- 结论：任何不带 assets 的部署都会杀死整站。此红线不可触碰。