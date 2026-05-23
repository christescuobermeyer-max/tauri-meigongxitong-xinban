"""
New-API（one-api 衍生）框架通用余额刷新脚本。
读 --session-file → 用 cookies + New-Api-User header 调 --api-url（默认 /api/user/self）拿余额 → 输出 JSON。

使用：
    python newapi_fetch_balance.py \
        --api-url https://yunwu.ai/api/user/self \
        --referer https://yunwu.ai/console \
        --session-file <path>

stdout 输出（单行 JSON）：
    成功：{"ok": true, "balance": 25.32, "history_used": 8842.79, "unit": "⚡", ...}
    cookie 失效：{"ok": false, "reason": "expired"}
    其它错误：{"ok": false, "reason": "...", "detail": "..."}
"""
import argparse
import io
import json
import sys
from pathlib import Path
import urllib.request
import urllib.error

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def emit(d: dict, code: int = 0) -> int:
    print(json.dumps(d, ensure_ascii=False))
    return code


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", required=True, help="GET 余额的 API URL")
    parser.add_argument("--referer", required=True, help="Referer 头（一般是 console 页面 URL）")
    parser.add_argument("--session-file", required=True)
    parser.add_argument("--unit-symbol", default="⚡", help="显示单位（apimart 用 $，newapi 用 ⚡）")
    args = parser.parse_args()

    session_path = Path(args.session_file)
    if not session_path.exists():
        return emit({"ok": False, "reason": "no_session",
                     "detail": "未找到 session 文件，请先登录"}, 2)

    try:
        session = json.loads(session_path.read_text(encoding="utf-8"))
    except Exception as e:
        return emit({"ok": False, "reason": "bad_session", "detail": f"session 文件损坏：{e}"}, 2)

    cookies = session.get("cookies") or []
    user_id = session.get("userId")
    quota_per_unit = session.get("quotaPerUnit") or 500000
    if not cookies or not user_id:
        return emit({"ok": False, "reason": "incomplete_session"}, 2)

    cookie_header = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
    if not cookie_header:
        return emit({"ok": False, "reason": "no_cookies"}, 2)

    req = urllib.request.Request(
        args.api_url,
        headers={
            "Cookie": cookie_header,
            "New-Api-User": str(user_id),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": args.referer,
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        if e.code in (401, 403):
            return emit({"ok": False, "reason": "expired", "detail": f"HTTP {e.code}"}, 3)
        return emit({"ok": False, "reason": "http_error", "detail": f"HTTP {e.code}", "body": body[:200]}, 4)
    except Exception as e:
        return emit({"ok": False, "reason": "network_error", "detail": str(e)}, 5)

    if not data.get("success"):
        msg = data.get("message", "")
        if any(kw in msg for kw in ("未登录", "未提供", "无权", "expired", "login")):
            return emit({"ok": False, "reason": "expired", "detail": msg}, 3)
        return emit({"ok": False, "reason": "api_error", "detail": msg}, 6)

    payload = data.get("data", {})
    quota = payload.get("quota", 0)
    used = payload.get("used_quota", 0)
    return emit({
        "ok": True,
        "balance": round(quota / quota_per_unit, 6) if isinstance(quota, (int, float)) else None,
        "history_used": round(used / quota_per_unit, 6) if isinstance(used, (int, float)) else None,
        "unit": args.unit_symbol,
        "userId": user_id,
        "username": payload.get("username"),
        "displayName": payload.get("display_name"),
        "rawQuota": quota,
        "rawUsedQuota": used,
    }, 0)


if __name__ == "__main__":
    sys.exit(main())
