#!/usr/bin/env python3
"""
XAUUSD 宏观信息源抓取器

从多个信息源获取最新财经新闻/数据，支持 RSS、API 请求和手动输入。
抓取结果可直接喂给 Prompt #1（信息源筛选）。

使用方法：
    python news_scraper.py               # 抓取全部已配置源，打印到 stdout
    python news_scraper.py --source rss  # 只抓 RSS 源
    python news_scraper.py --json        # 输出 JSON 格式

前置条件：
    pip install feedparser requests
"""

import json
import argparse
import sys
from datetime import datetime

# ── 配置：在此修改你的信息源 ──
RSS_FEEDS = [
    {"name": "Reuters Business",   "url": "https://feeds.reuters.com/reuters/businessNews"},
    {"name": "MarketWatch Economy","url": "https://feeds.marketwatch.com/marketwatch/topstories"},
    {"name": "Investing.com Gold", "url": "https://www.investing.com/rss/news_14.rss"},
]

# 如果你有 API 密钥（如 NewsAPI），在这里配置
API_SOURCES = [
    # {"name": "NewsAPI", "url": "https://newsapi.org/v2/top-headlines?category=business&apiKey=YOUR_KEY"},
]

# ── 抓取逻辑 ──

def fetch_rss(feed_url):
    """抓取单个 RSS 源，返回标题+摘要列表"""
    try:
        import feedparser
        parsed = feedparser.parse(feed_url)
        return [
            {"title": e.get("title", ""), "summary": e.get("summary", ""), "source": parsed.feed.get("title", feed_url)}
            for e in parsed.entries[:10]  # 最近 10 条
        ]
    except ImportError:
        print("[!] 需要安装 feedparser: pip install feedparser", file=sys.stderr)
        return []
    except Exception as e:
        print(f"[!] RSS 抓取失败 {feed_url}: {e}", file=sys.stderr)
        return []


def fetch_api(source):
    """抓取 API 源"""
    try:
        import requests
        resp = requests.get(source["url"], timeout=10)
        resp.raise_for_status()
        data = resp.json()
        articles = data.get("articles", [])
        return [
            {"title": a.get("title", ""), "summary": a.get("description", ""), "source": source["name"]}
            for a in articles[:10]
        ]
    except ImportError:
        print("[!] 需要安装 requests: pip install requests", file=sys.stderr)
        return []
    except Exception as e:
        print(f"[!] API 抓取失败 {source['name']}: {e}", file=sys.stderr)
        return []


def scrape_all(as_json=False):
    """抓取所有已配置源，合并输出"""
    all_articles = []
    all_articles.append(f"\n{'='*60}\n采集时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n{'='*60}\n")

    for feed in RSS_FEEDS:
        label = f"[RSS] {feed['name']}"
        print(f"[*] 抓取 {label} ...", file=sys.stderr)
        articles = fetch_rss(feed["url"])
        all_articles.append(f"\n--- {label} ({len(articles)} 条) ---\n")
        for a in articles:
            all_articles.append(f"  • {a['title']}\n    {a['summary'][:120]}...\n")

    for source in API_SOURCES:
        label = f"[API] {source['name']}"
        print(f"[*] 抓取 {label} ...", file=sys.stderr)
        articles = fetch_api(source)
        all_articles.append(f"\n--- {label} ({len(articles)} 条) ---\n")
        for a in articles:
            all_articles.append(f"  • {a['title']}\n    {a['summary'][:120]}...\n")

    output = "".join(all_articles)

    if as_json:
        print(json.dumps({"timestamp": datetime.now().isoformat(), "text": output}, ensure_ascii=False))
    else:
        print(output)


# ── 手动输入模式 ──
def manual_input():
    """逐条手动输入新闻（Ctrl+D 结束）"""
    lines = []
    print("逐条粘贴新闻标题+摘要，每行一条。按 Ctrl+D (Linux/Mac) 或 Ctrl+Z (Win) 结束输入:")
    try:
        while True:
            line = input()
            lines.append(line)
    except EOFError:
        pass

    output = "\n\n".join([f"  • {l}" for l in lines if l.strip()])
    print(f"\n{'='*60}")
    print(f"手动输入 · {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")
    print(output)


# ── CLI ──
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="XAUUSD 宏观信息源抓取器")
    parser.add_argument("--source", choices=["rss", "api"], default="all", help="只抓取特定类型源")
    parser.add_argument("--json", action="store_true", help="输出 JSON 格式")
    parser.add_argument("--manual", action="store_true", help="逐条手动输入新闻")
    args = parser.parse_args()

    if args.manual:
        manual_input()
    else:
        scrape_all(as_json=args.json)
