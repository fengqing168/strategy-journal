#!/usr/bin/env python3
"""
访问 Token 生成器
用于为买家创建专属的有效 Token，在 workflow.html 中验证。

Token 格式: HMAC_base64.timestamp_ms
- 使用 HMAC-SHA256 签名
- 有效期 90 天（可在 workflow.html 中调整）
- 只有知道 SECRET 的人才能生成有效 Token

用法：
  python generate_token.py
  → 输出一个新的 Token，复制到爱发电方案描述中
"""

import hmac
import hashlib
import base64
import time

# ── 密钥（不要分享！和 workflow.html 中的 SECRET 保持一致） ──
SECRET = "xau-workflow-secret-2026-sheyuyoujian"

def generate_token():
    ts = str(int(time.time() * 1000))
    sig = hmac.new(SECRET.encode(), ts.encode(), hashlib.sha256).digest()
    token = base64.b64encode(sig).decode().rstrip('=').replace('+','-').replace('/','_') + '.' + ts
    return token

if __name__ == "__main__":
    token = generate_token()
    print(f"\n  新 Token（复制此串到爱发电方案描述）：\n")
    print(f"  {token}\n")
    print(f"  有效期: 90 天（自生成时刻起）")
    print(f"  买家在 workflow.html 的 Token 输入框粘贴此串即可使用。\n")
    print(f"  提示：请将 workflow.html 中 const SECRET = '...' 设为和本脚本一致的密钥。")
