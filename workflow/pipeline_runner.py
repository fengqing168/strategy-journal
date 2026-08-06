#!/usr/bin/env python3
"""
Prompt 串联执行器

按照 1→2→3→4→5→6→7→8→9→10→11→12 的顺序运行工作流。
每个 Prompt 的输出自动成为下一个 Prompt 的输入。

使用方法：
    python pipeline_runner.py --event-id 001 --raw-text "会议声明全文.txt"
    python pipeline_runner.py --step 4                 # 只运行到 Prompt #4
    python pipeline_runner.py --dry-run                # 仅打印流程，不实际调用 API

前置条件：
    pip install anthropic  (或 openai, google-generativeai 等)
    需要设置环境变量: ANTHROPIC_API_KEY=sk-ant-xxx  (或其他模型提供商的 API Key)
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path


# ── 配置 ──
API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-20250514"  # 或 "claude-opus-4-20250514"
PROMPTS_DIR = Path(__file__).parent / "prompts"

# Prompt 1-12 的输入模板文件名
PROMPT_FILES = {
    1:  "prompt-01-信息源筛选.md",
    2:  "prompt-02-事件关键点提取.md",
    3:  "prompt-03-结构化格式化.md",
    4:  "prompt-04-鹰鸽打分.md",
    5:  "prompt-05-多维影响评估.md",
    6:  "prompt-06-历史语境对比.md",
    7:  "prompt-07-矛盾与异常检测.md",
    8:  "prompt-08-AI初判输出.md",
    9:  "prompt-09-人工判断输入.md",
    10: "prompt-10-人机分歧对比.md",
    11: "prompt-11-加权决策矩阵.md",
    12: "prompt-12-事后复盘模板.md",
}

# 状态管理文件
STATE_FILE = Path("workflow_state.json")


def load_prompt(prompt_id):
    """从 markdown 文件加载 Prompt 模板"""
    filename = PROMPT_FILES.get(prompt_id)
    if not filename:
        raise ValueError(f"找不到 Prompt #{prompt_id}")

    path = PROMPTS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"找不到文件: {path}")

    text = path.read_text(encoding="utf-8")

    # 提取 "## 完整 Prompt" 之后的内容，移除 markdown 格式标记
    parts = text.split("## 完整 Prompt")
    if len(parts) < 2:
        raise ValueError(f"Prompt #{prompt_id} 缺少'## 完整 Prompt'节")

    prompt = parts[1]
    # 移除开头的 ``` 一行
    prompt = prompt.strip().removeprefix("```").strip()

    return prompt


def fill_placeholders(prompt_text, variables):
    """替换 Prompt 中的 {{variable}} 占位符"""
    for key, value in variables.items():
        prompt_text = prompt_text.replace(f"{{{{{key}}}}}", str(value))
    return prompt_text


def save_state(event_id, step, outputs):
    """保存工作流中间状态"""
    state = {
        "event_id": event_id,
        "last_step": step,
        "outputs": outputs,
        "updated_at": datetime.now().isoformat()
    }
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def load_state(event_id):
    """加载工作流中间状态"""
    if not STATE_FILE.exists():
        return None
    state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    if state.get("event_id") != event_id:
        return None
    return state


def call_claude(prompt_text, system="你是一个专业的金融市场分析师。"):
    """调用 Claude API"""
    if not API_KEY:
        raise RuntimeError("请设置环境变量 ANTHROPIC_API_KEY")

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=API_KEY)
        message = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": prompt_text}]
        )
        return message.content[0].text
    except ImportError:
        print("[!] 需要安装 anthropic: pip install anthropic", file=sys.stderr)
        raise
    except Exception as e:
        print(f"[!] API 调用失败: {e}", file=sys.stderr)
        raise


def run_pipeline(event_id, raw_text, max_step=12, dry_run=False, resume=False):
    """运行完整工作流"""

    # 上下文变量，在步骤间传递
    ctx = {
        "event_id": event_id or f"auto-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        "raw_text": raw_text,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "current_price": "查询中...",  # 可接入行情 API
    }

    outputs = {}
    start_step = 1

    # 恢复之前的进度
    if resume:
        state = load_state(ctx["event_id"])
        if state:
            start_step = state["last_step"] + 1
            outputs = state["outputs"]
            ctx.update(state.get("context", {}))
            print(f"[*] 从步骤 {start_step} 恢复...")

    for step in range(start_step, max_step + 1):
        print(f"\n{'='*60}")
        print(f"  Step {step}/{max_step}: Prompt #{step}")

        if step == 9:
            print("  ⚠ Prompt #9 需要人工填写。")
            print("  请打开 prompt-09-人工判断输入.md 手动填写后，将内容粘贴到下方。")
            print("  完成后按 Ctrl+D 继续...")
            human_input = sys.stdin.read().strip()
            ctx["human_judgment"] = human_input
            outputs[step] = human_input
            save_state(ctx["event_id"], step, outputs)
            continue

        try:
            prompt_template = load_prompt(step)
        except FileNotFoundError:
            print(f"  [!] Prompt #{step} 文件不存在，跳过")
            continue

        # 填充变量
        prompt_text = fill_placeholders(prompt_template, ctx)

        if dry_run:
            print(f"  [DRY RUN] 将调用 API，Prompt 长度: {len(prompt_text)} 字符")
            outputs[step] = "[DRY RUN]"
            continue

        try:
            response = call_claude(prompt_text)
            outputs[step] = response
            # 尝试将 JSON 响应解析为上下文，供下一步使用
            try:
                parsed = json.loads(response)
                ctx[f"output_{step}"] = parsed
            except json.JSONDecodeError:
                ctx[f"output_{step}_text"] = response

            save_state(ctx["event_id"], step, outputs)
            print(f"  ✓ 完成 ({len(response)} 字符)")

        except Exception as e:
            print(f"  ✗ 失败: {e}")
            save_state(ctx["event_id"], step - 1, outputs)
            break

    print(f"\n{'='*60}")
    print(f"工作流结束。输出已保存到 {STATE_FILE}")

    # 输出最终结果
    final = outputs.get(12) or outputs.get(11) or outputs.get(8)
    if final and not dry_run:
        print(f"\n最终决策:\n{final}")


# ── CLI ──
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI 智能体工作流 · Prompt 串联执行器")
    parser.add_argument("--event-id", default="", help="事件编号（可选，自动生成）")
    parser.add_argument("--raw-text", default="", help="事件原始文本（讲话/报告全文）")
    parser.add_argument("--step", type=int, default=12, help="运行到第几步为止（默认全部 12 步）")
    parser.add_argument("--dry-run", action="store_true", help="仅打印流程不调用 API")
    parser.add_argument("--resume", action="store_true", help="从上次中断处继续")
    args = parser.parse_args()

    if not args.dry_run and not API_KEY:
        print("错误: 请设置 ANTHROPIC_API_KEY 环境变量", file=sys.stderr)
        sys.exit(1)

    if not args.raw_text and not args.dry_run and not args.resume:
        print("提示: 使用 --raw-text 传入分析文本，或 --dry-run 查看流程", file=sys.stderr)
        print("示例: python pipeline_runner.py --event-id 001 --raw-text FOMC声明.txt", file=sys.stderr)
        sys.exit(1)

    run_pipeline(
        event_id=args.event_id,
        raw_text=args.raw_text,
        max_step=args.step,
        dry_run=args.dry_run,
        resume=args.resume
    )
