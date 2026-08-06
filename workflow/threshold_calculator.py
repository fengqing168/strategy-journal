#!/usr/bin/env python3
"""
置信度阈值计算器

实现 Prompt #11「加权决策矩阵」中的核心数值计算逻辑。
可单独运行以测试不同参数组合的输出信号。

使用方法：
    python threshold_calculator.py --ai-conf 7 --human-conf 5 --ai-accuracy 0.65 --human-accuracy 0.55 --divergence 4
    python threshold_calculator.py --interactive  # 交互模式逐项输入
"""

import argparse
import json
from typing import Optional


def calculate_weighted_score(
    ai_confidence: float,
    human_confidence: float,
    ai_accuracy: float = 0.5,
    human_accuracy: float = 0.5,
    ai_weight: float = 0.5,
    human_weight: float = 0.5,
    divergence_score: float = 0,
    direction_match: bool = True,
    anti_rule_triggered: bool = False,
) -> dict:
    """
    计算加权决策得分。

    参数:
        ai_confidence      — AI 置信度 (1-10)
        human_confidence   — 人工置信度 (1-10)
        ai_accuracy        — AI 历史准确率 (0-1)
        human_accuracy     — 人工历史准确率 (0-1)
        ai_weight          — AI 权重 (默认 0.5)
        human_weight       — 人工权重 (默认 0.5)
        divergence_score   — 分歧严重度 (1-10，来自 Prompt #10)
        direction_match    — AI 和人工方向是否一致
        anti_rule_triggered — 是否触发反例排除规则

    返回:
        {decision, direction, weighted_score, score_breakdown, ...}
    """
    breakdown = {}

    # 规则 1: 方向不一致 → NO TRADE
    if not direction_match:
        return {
            "decision": "NO_TRADE",
            "direction": "NONE",
            "position_size": "零",
            "weighted_score": 0.0,
            "score_breakdown": {"reason": "AI与人工方向不一致"},
            "caution": "方向不一致，不生成交易信号。重新审视分歧来源后再次分析。"
        }

    # 规则 2: 置信度加权
    total_weight = ai_weight + human_weight
    ai_contribution = (ai_confidence * ai_accuracy * ai_weight) / total_weight
    human_contribution = (human_confidence * human_accuracy * human_weight) / total_weight
    raw_score = ai_contribution + human_contribution

    breakdown["ai_contribution"] = round(ai_contribution, 2)
    breakdown["human_contribution"] = round(human_contribution, 2)
    breakdown["raw_score"] = round(raw_score, 2)

    # 规则 3: 分歧惩罚
    if divergence_score >= 7:
        divergence_penalty = 0.5
    elif divergence_score >= 4:
        divergence_penalty = 0.8
    else:
        divergence_penalty = 1.0

    adjusted_score = raw_score * divergence_penalty
    breakdown["divergence_penalty"] = divergence_penalty
    breakdown["adjusted_score"] = round(adjusted_score, 2)

    # 规则 4: 信号阈值
    if adjusted_score >= 7.0:
        decision = "STRONG_SIGNAL"
        position = "标准(100%)"
    elif adjusted_score >= 5.0:
        decision = "WEAK_SIGNAL"
        position = "半仓(50%)"
    elif adjusted_score >= 3.0:
        decision = "MONITOR"
        position = "零"
    else:
        decision = "NO_TRADE"
        position = "零"

    # 规则 5: 反例排除（降一级）
    if anti_rule_triggered and decision == "STRONG_SIGNAL":
        decision = "WEAK_SIGNAL"
        position = "半仓(50%)"
    elif anti_rule_triggered and decision == "WEAK_SIGNAL":
        decision = "MONITOR"
        position = "零"

    breakdown["anti_rule_check"] = "触发(降一级)" if anti_rule_triggered else "通过"

    confidence_map = {"STRONG_SIGNAL": "高", "WEAK_SIGNAL": "中", "MONITOR": "低", "NO_TRADE": "低"}

    return {
        "decision": decision,
        "direction": "LONG",  # 方向由 Prompt #10 的方向判断决定
        "position_size": position,
        "weighted_score": round(adjusted_score, 2),
        "score_breakdown": breakdown,
        "confidence_rate": confidence_map[decision],
        "caution": (
            "⚠ 注意：反例排除规则触发，信号已降级" if anti_rule_triggered
            else "⚠ 注意：决策仅供参考，最终执行需结合实时风控条件" if decision != "NO_TRADE"
            else ""
        )
    }


def interactive():
    """交互模式：逐项输入参数"""
    print("\n=== 置信度阈值计算器 · 交互模式 ===\n")

    ai_conf = float(input("AI 置信度 (1-10): "))
    human_conf = float(input("人工置信度 (1-10): "))
    ai_acc = float(input("AI 历史准确率 (0-1, 默认0.5): ") or "0.5")
    human_acc = float(input("人工历史准确率 (0-1, 默认0.5): ") or "0.5")
    ai_w = float(input("AI 权重 (默认0.5): ") or "0.5")
    human_w = float(input("人工权重 (默认0.5): ") or "0.5")
    div = float(input("分歧严重度 (1-10): "))
    match = input("方向是否一致？(y/n): ").lower().startswith("y")
    anti = input("是否触发反例排除？(y/n): ").lower().startswith("y")

    result = calculate_weighted_score(
        ai_confidence=ai_conf, human_confidence=human_conf,
        ai_accuracy=ai_acc, human_accuracy=human_acc,
        ai_weight=ai_w, human_weight=human_w,
        divergence_score=div, direction_match=match,
        anti_rule_triggered=anti
    )

    print(f"\n{'='*50}")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"{'='*50}\n")


def test_scenarios():
    """运行一组测试场景"""
    scenarios = [
        ("高确信一致",      8, 8, 0.7, 0.65, 1, True,  False),
        ("中等分歧",         6, 5, 0.6, 0.55, 5, True,  False),
        ("AI准但人不准",    8, 3, 0.75, 0.4, 6, True,  False),
        ("严重分歧",         7, 6, 0.6, 0.6, 8, True,  False),
        ("方向不一致",       7, 5, 0.65, 0.5, 3, False, False),
        ("反例排除触发",     8, 8, 0.7, 0.65, 1, True,  True),
        ("低确信低准确",     3, 2, 0.4, 0.35, 3, True,  False),
    ]

    print("\n=== 测试场景 ===\n")
    for name, ac, hc, aa, ha, div, match, anti in scenarios:
        result = calculate_weighted_score(
            ai_confidence=ac, human_confidence=hc,
            ai_accuracy=aa, human_accuracy=ha,
            divergence_score=div, direction_match=match,
            anti_rule_triggered=anti
        )
        print(f"  {name:20s} → {result['decision']:15s} 得分:{result['weighted_score']:.1f} 仓位:{result['position_size']}")


# ── CLI ──
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="置信度阈值计算器")
    parser.add_argument("--ai-conf", type=float, help="AI 置信度 (1-10)")
    parser.add_argument("--human-conf", type=float, help="人工置信度 (1-10)")
    parser.add_argument("--ai-accuracy", type=float, default=0.5, help="AI 历史准确率 (0-1)")
    parser.add_argument("--human-accuracy", type=float, default=0.5, help="人工历史准确率 (0-1)")
    parser.add_argument("--ai-weight", type=float, default=0.5, help="AI 权重")
    parser.add_argument("--human-weight", type=float, default=0.5, help="人工权重")
    parser.add_argument("--divergence", type=float, default=0, help="分歧严重度 (1-10)")
    parser.add_argument("--no-match", action="store_true", help="方向不一致")
    parser.add_argument("--anti-rule", action="store_true", help="触发反例排除")
    parser.add_argument("--interactive", action="store_true", help="交互模式")
    parser.add_argument("--test", action="store_true", help="运行测试场景")
    args = parser.parse_args()

    if args.test:
        test_scenarios()
    elif args.interactive:
        interactive()
    elif args.ai_conf is not None and args.human_conf is not None:
        result = calculate_weighted_score(
            ai_confidence=args.ai_conf, human_confidence=args.human_conf,
            ai_accuracy=args.ai_accuracy, human_accuracy=args.human_accuracy,
            ai_weight=args.ai_weight, human_weight=args.human_weight,
            divergence_score=args.divergence, direction_match=not args.no_match,
            anti_rule_triggered=args.anti_rule
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        parser.print_help()
