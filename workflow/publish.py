#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一键发布运行日志。

用法:
    python workflow/publish.py drafts/003.json            # 生成日志 + 同步 search/index + git 提交推送
    python workflow/publish.py drafts/003.json --dry-run  # 只预览,不改文件

草稿 JSON 字段(必填 *):
  id           * 日志编号,如 "003"
  title        * 文章大标题
  date_line    * 正文时间戳行,如 "2026.08.08 预判 · 08.10 复盘"
  search_date    search.html 卡片日期,如 "2026.08.08"(缺省取 date_line 第一段)
  excerpt      * 卡片摘要
  judge_time, judge_html    判断段
  end_day, cut_ts            判断框 K 线参数
  live_title, live_hint      判断框 K 线标题/提示
  real_title, real_hint      双K线标题/提示
  marks                       三线 data-mark JSON
  decide                      决策条 {ai, human, entry, stop, target, dir}
  fact_time, fact_html       结果段
  start_day                  双K线起始日(默认=end_day)
  review_time, review_html   复盘段
  takeaway_h1, takeaway_body takeaway
  tags                        数组
  node                        对应工作流节点
"""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, "logs", "_template.html")
SEARCH = os.path.join(ROOT, "search.html")
INDEX = os.path.join(ROOT, "index.html")


def esc(s):
    return (s.replace("&", "&amp;").replace('"', "&quot;")
            .replace("<", "&lt;").replace(">", "&gt;"))


def num_delta(num, delta):
    n = int(num) + delta
    return "%03d" % n if n >= 0 else "NNN"


def decide_html(dc):
    def cell(label, cls, val):
        return ('<div class="dc"><div class="dc-label">%s</div>'
                '<div class="dc-value %s">%s</div></div>') % (label, cls, val)
    return "".join([
        cell("AI 初判", "ai", dc.get("ai", "")),
        cell("我的决定", "", dc.get("human", "")),
        cell("入场", "up" if dc.get("dir") == "long" else "down", dc.get("entry", "")),
        cell("止损 / 目标", "", "%s / %s" % (dc.get("stop", ""), dc.get("target", ""))),
    ])


def render(tpl, vals):
    html = tpl
    for k, v in vals.items():
        html = html.replace("{{" + k + "}}", v)
    return html


def sync_search(d, num):
    s = open(SEARCH, encoding="utf-8").read()
    title, tags = d["title"], d.get("tags", [])
    date = d.get("search_date", d["date_line"].split(" ")[0].replace("-", "."))
    excerpt = d.get("excerpt", "")

    # featured 块整体重建
    f = ('<div class="log-featured" id="featuredLog">'
         '<div class="lf-badge">LATEST · 最新发布</div>'
         '<div class="lf-title"><a href="logs/%s.html">%s</a></div>'
         '<div class="lf-excerpt">%s</div>'
         '<div class="lf-tags">%s</div>'
         '<a href="logs/%s.html" class="lf-link">阅读全文 →</a>'
         '</div>') % (num, title, excerpt,
                      "".join('<span>%s</span>' % t for t in tags), num)
    s = re.sub(r'<div class="log-featured".*?</div>\s*</div>', f, s, count=1, flags=re.S)

    # grid 卡片去重 + 新卡片插到最前
    s = re.sub(r'<div class="log-card"><div class="lc-num">#%s' % re.escape(num), '<div class="log-card-invalid">', s)
    s = re.sub(r'(<div class="log-grid" id="logGrid">)', r'\1' + card(num, date, title, excerpt), s, count=1)

    # JS data 数组追加
    entry = ('{n:"%s",t:"%s",d:"%s",e:"%s",k:"%s",u:"logs/%s.html"}'
             ) % (num, title, date, excerpt, " ".join(tags), num)
    s = re.sub(r'(var data=\[)(.*?)(\])',
               lambda m: m.group(1) + entry + ("," + m.group(2) if m.group(2) else "") + m.group(3),
               s, count=1, flags=re.S)

    # 统计数字 +1
    s = re.sub(r'(<div class="ls-stat"><b>)(\d+)(</b><span>已发布</span></div>)',
               lambda m: m.group(1) + str(int(m.group(2)) + 1) + m.group(3), s, count=1)

    open(SEARCH, "w", encoding="utf-8").write(s)
    print("✓ search.html 已同步 featured / grid / data / 统计")


def card(num, date, title, excerpt):
    return ('<div class="log-card"><div class="lc-num">#%s</div>'
            '<span class="lc-date">%s</span>'
            '<div class="lc-title"><a href="logs/%s.html">%s</a></div>'
            '<div class="lc-excerpt">%s</div></div>'
            ) % (num, date, num, title, excerpt)


def sync_index(d, num):
    s = open(INDEX, encoding="utf-8").read()
    s = re.sub(r'(<a href="logs/)\d+(\.html" class="jr-link"[^>]*>)', r'\g<1>%s\g<2>' % num, s)
    s = re.sub(r'(<div class="jr-line"><strong>判断：</strong>)[^<]*(</div>)',
               r'\g<1>%s\g<2>' % d.get("hi_summary", ""), s)
    s = re.sub(r'(<div class="jr-result">)[^<]*(</div>)',
               r'\g<1>%s\g<2>' % d.get("jic", "预判在途 · 实时盯盘"), s)
    open(INDEX, "w", encoding="utf-8").write(s)
    print("✓ index.html 最新发布预览已同步")


def main():
    a = _Args().parse_args()

    with open(a.draft, encoding="utf-8") as f:
        d = json.load(f)
    num = d["id"]

    tpl = open(TEMPLATE, encoding="utf-8").read()
    dc = d.get("decide", {})
    vals = {
        "NUM": num,
        "TITLE": d["title"],
        "META_DESC": d.get("meta_desc", d["title"]),
        "H1": d["title"],
        "NODE": d.get("node", "#8 AI 初判 → #9 人判 → #10 分歧标注"),
        "DATE_LINE": d["date_line"],
        "JUDGE_TIME": d["judge_time"],
        "JUDGE_HTML": d["judge_html"],
        "END_DAY": d["end_day"],
        "CUT_TS": d.get("cut_ts", ""),
        "LIVE_TITLE": esc(d.get("live_title", "")),
        "LIVE_HINT": esc(d.get("live_hint", "")),
        "MARKS": d.get("marks", ""),
        "DECIDE_HTML": decide_html(dc),
        "FACT_TIME": d["fact_time"],
        "FACT_HTML": d["fact_html"],
        "START_DAY": d.get("start_day", d["end_day"]),
        "REAL_TITLE": esc(d.get("real_title", "")),
        "REAL_HINT": esc(d.get("real_hint", "")),
        "REVIEW_TIME": d["review_time"],
        "REVIEW_HTML": d["review_html"],
        "TAKEAWAY_H1": d["takeaway_h1"],
        "TAKEAWAY_BODY": d["takeaway_body"],
        "TAGS_HTML": "".join('<span class="tag">%s</span>' % t for t in d.get("tags", [])),
        "PREV": "./%s.html" % num_delta(num, -1),
        "PREV_LABEL": "#%s" % num_delta(num, -1),
        "NEXT": "./%s.html" % num_delta(num, +1),
        "NEXT_LABEL": "#%s" % num_delta(num, +1),
    }
    html = render(tpl, vals)

    if a.dry_run:
        print(">>> DRY-RUN")
        print("将生成 logs/%s.html (%d 字符)" % (num, len(html)))
        left = re.findall(r"\{\{[A-Z0-9_]+}}", html)
        print("剩余占位符:", left if left else "无")
        return

    os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
    out = os.path.join(ROOT, "logs", num + ".html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print("✓ 生成 logs/%s.html" % num)

    sync_search(d, num)
    sync_index(d, num)

    if not a.no_push:
        subprocess.run(["git", "add", "-A"], cwd=ROOT)
        subprocess.run(["git", "commit", "-m", "发布运行日志 #%s: %s" % (num, d["title"])], cwd=ROOT)
        subprocess.run(["git", "push", "origin", "master"], cwd=ROOT)
        print(">>> 已推送 origin/master → Cloudflare Pages 自动部署")


class _Args(object):
    """迷你参数解析: 不依赖 argparse 的默认参数"""

    def __init__(self):
        self.draft = None
        self.dry_run = False
        self.no_push = False

    def parse_args(self):
        import sys
        args = sys.argv[1:]
        for i, x in enumerate(args):
            if x == "--dry-run":
                self.dry_run = True
            elif x == "--no-push":
                self.no_push = True
            elif not x.startswith("-") and self.draft is None:
                self.draft = x
            elif not x.startswith("-") and self.draft is not None:
                raise SystemExit("只接受一个草稿文件")
        if self.draft is None:
            raise SystemExit("用法: python publish.py drafts/003.json [--dry-run] [--no-push]")
        return self


if __name__ == "__main__":
    main()