#!/usr/bin/env python3
"""
shujian.cc 网站自动 QA 检查脚本 v2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
智能检查：只有页面真的用了某个功能但缺少依赖时才报错。

用法:  python3 qa_check.py
"""

import re
import sys
import os
from pathlib import Path

ROOT = Path(__file__).parent
PAGES = [
    "index.html", "about.html", "library.html", "subscribe.html",
    "search.html", "product.html", "purchase.html", "admin.html",
    "workflow.html", "logs/001.html"
]
STYLES = "styles.css"

FAIL = 0
WARN = 0
PASS = 0

def ok(msg):
    global PASS; PASS += 1
    print(f"  ✓ {msg}")

def warn(msg):
    global WARN; WARN += 1
    print(f"  ⚠ {msg}")

def fail(msg):
    global FAIL; FAIL += 1
    print(f"  ✗ {msg}")

def load(path):
    p = ROOT / path
    if not p.exists(): return None
    return p.read_text(encoding="utf-8")

# ═══════════════════════════════════════════════════════
print("\n══════════════════════════════════════════")
print("  shujian.cc QA 检查 v2")
print("══════════════════════════════════════════\n")

# ── 1. 文件存在性 ──
print("── 1. 文件存在性 ──")
for p in PAGES + [STYLES, "js/main.js", "js/ticker.js", "images/pay-wechat.png.jpg", "images/pay-zhifubao.png.jpg"]:
    if (ROOT / p).exists(): ok(p)
    else: fail(f"文件不存在: {p}")

# ── 2. 有 ticker-bar 就必须有 ticker.js ──
print("\n── 2. ticker-bar ↔ ticker.js ──")
for page in PAGES:
    html = load(page)
    if not html: continue
    has_bar = 'ticker-bar' in html
    has_js = 'js/ticker.js' in html
    if has_bar and not has_js:
        fail(f"{page}: 有行情条但没有 ticker.js")
    elif has_bar and has_js:
        ok(f"{page}: ticker 完整 ✓")
    else:
        pass  # no bar = no need

# ── 3. 有 fade-in 就必须有 main.js ──
print("\n── 3. fade-in ↔ main.js ──")
for page in PAGES:
    html = load(page)
    if not html: continue
    has_fade = 'fade-in' in html
    has_main = 'js/main.js' in html
    if has_fade and not has_main:
        fail(f"{page}: 有 fade-in 但没有 main.js → 元素永远透明！")
    elif has_fade and has_main:
        ok(f"{page}: fade-in + main.js ✓")

# ── 4. 导航栏顺序 ──
print("\n── 4. 导航栏顺序 ──")
for page in PAGES:
    html = load(page)
    if not html: continue
    nav = re.search(r'<nav class="nav">(.*?)</nav>', html, re.DOTALL)
    if not nav:
        pass  # admin.html and workflow.html don't have standard nav
        continue
    hrefs = re.findall(r'href="([^"]+)"', nav.group(1))
    is_logs = page == "logs/001.html"
    expected = ['../index.html','../search.html','../about.html','../subscribe.html','../purchase.html'] if is_logs else ['/','search.html','about.html','subscribe.html','purchase.html']
    if hrefs == expected:
        ok(f"{page}: 导航正确 ✓")
    else:
        fail(f"{page}: 导航错 → 实际 {hrefs}")

# ── 4.5 订阅表单 ↔ main.js ──
print("\n── 4.5 订阅表单 ↔ main.js ──")
for page in PAGES:
    html = load(page)
    if not html: continue
    if 'sub-form' not in html: continue
    if 'js/main.js' in html:
        ok(f"{page}: 订阅表单 + main.js ✓")
    else:
        fail(f"{page}: 订阅表单缺 main.js（subscribeForm 未定义 → 点击无反应）")

# ── 5. CSS 色值残留 ──
print("\n── 5. CSS 色值残留 ──")
css = load(STYLES)
if css:
    purple_rgba = re.findall(r'rgba\(139,92,246,[^)]+\)', css)
    purple_hex = ['#6366F1','#8B5CF6','#A855F7','#5255E8','#7C3AED','#4F46E5','#4338CA']
    found_hex = [c for c in purple_hex if c in css]
    light_bg = ['#EDF0F7','#F6F8FC','#FCFDFF','#EEF1FB','#E5E8F3']
    found_light = [c for c in light_bg if c in css]
    if purple_rgba: fail(f"残留紫色 rgba: {purple_rgba}")
    if found_hex: warn(f"残留紫色 hex: {found_hex}")
    if found_light: warn(f"残留浅色背景: {found_light}")
    if not (purple_rgba or found_hex or found_light):
        ok("CSS 无色值残留 ✓")

# ── 6. 对比度粗略检查 ──
print("\n── 6. 对比度检查 ──")
root_m = re.search(r':root\{(.*?)\}', css, re.DOTALL)
if root_m:
    root = root_m.group(1)
    t = re.search(r'--text:\s*([^;]+)', root)
    b = re.search(r'--bg:\s*([^;]+)', root)
    if t and b:
        tv, bv = t.group(1).strip(), b.group(1).strip()
        if tv.startswith('#') and bv.startswith('#'):
            b_sum = sum(int(bv[i:i+2],16) for i in (1,3,5))
            t_sum = sum(int(tv[i:i+2],16) for i in (1,3,5))
            if b_sum < 200 and t_sum > 600:
                ok(f"深底({bv}) 亮字({tv}) → 对比好 ✓")
            else:
                warn(f"对比可能不足: {tv} on {bv}")

# ── 7. HTML 结构 ──
print("\n── 7. HTML 标签平衡 ──")
VOID = {'meta','link','br','hr','img','input','source','area','base','col','embed','track','wbr'}
for page in PAGES:
    html = load(page)
    if not html: continue
    # Count non-void open tags
    tags = re.findall(r'<(\w+)([^>]*?)(/?)>', html)
    non_void = [t for t, attrs, slash in tags if t not in VOID]
    self_closed = sum(1 for _, _, s in tags if s == '/')
    closes = len(re.findall(r'</(\w+)>', html)) + self_closed
    diff = abs(len(non_void) - closes)
    if diff <= 3:
        ok(f"{page}: 标签平衡 ✓")
    else:
        warn(f"{page}: 标签偏差 {diff}（非void开{len(non_void)} 闭{closes}）")

# ── 8. 内部链接 ──
print("\n── 8. 内部链接 ──")
all_files = set()
for root_d, dirs, files in os.walk(ROOT):
    for f in files:
        rel = os.path.relpath(os.path.join(root_d, f), ROOT)
        if not any(rel.startswith(x) for x in ['.git','color-preview','workflow/output','__pycache__','qa_check']):
            all_files.add(rel)

for page in PAGES:
    html = load(page)
    if not html: continue
    hrefs = re.findall(r'href="([^"]+)"', html)
    page_dir = os.path.dirname(page)
    for h in hrefs:
        # Skip external, anchors, mailto, js-generated templates
        if any(h.startswith(x) for x in ['http','#','mailto:','javascript:']) or '{' in h or '}' in h or "'" in h or '+' in h: continue
        h = h.split('#')[0]  # strip anchor
        if not h: continue
        if h == '/' or h == '': continue  # root link = index.html, valid
        resolved = h if h.startswith('/') else os.path.normpath(os.path.join(page_dir, h))
        resolved = resolved.lstrip('/')
        if resolved not in all_files and resolved != page:
            fail(f"{page}: 链接 '{h}' → 文件 '{resolved}' 不存在")

# ═══════════════════════════════════════════════════════
print(f"\n══════════════════════════════════════════")
print(f"  结果: ✓ {PASS}  ⚠ {WARN}  ✗ {FAIL}")
if FAIL == 0 and WARN == 0:
    print(f"  🎉 全部通过！")
elif FAIL == 0:
    print(f"  ⚠ {WARN} 个提示，建议检查")
else:
    print(f"  ✗ {FAIL} 个错误，需要修复")
print(f"══════════════════════════════════════════\n")
sys.exit(0 if FAIL == 0 else 1)
