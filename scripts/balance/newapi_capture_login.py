"""
New-API（one-api 衍生）框架通用登录捕获脚本。
适用于：line2(yunwu.ai)、line4(newapi.pockgo.com) 以及其它同框架站点。

打开 headed 浏览器到 --login-url → 等用户手动登录（轮询 .login-card/input[type=password] 消失）
→ 抓 cookies + localStorage.user → 写入 --session-file。

使用：
    python newapi_capture_login.py \
        --login-url https://yunwu.ai/console \
        --domain    yunwu.ai \
        --session-file <path>

session-file 格式：
    {
      "cookies": [...playwright cookies (limited to --domain)],
      "userId": 114217,
      "username": "...",
      "displayName": "...",
      "quotaPerUnit": 500000,
      "savedAt": "2026-..."
    }

退出码：
    0 = 登录成功并写入 session-file
    1 = 用户超时未登录 / 浏览器异常
    2 = 参数错误
"""
import argparse
import datetime
import io
import json
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

LOGIN_TIMEOUT_SECONDS = 240


def is_logged_in(page) -> bool:
    try:
        return page.evaluate(
            "() => document.querySelectorAll('.login-card, .login-panel, input[type=\"password\"]').length === 0"
        )
    except Exception:
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--login-url", required=True, help="登录页 URL（未登录时会自动跳转到登录页）")
    parser.add_argument("--domain", required=True, help="该站点的 cookie 域，比如 yunwu.ai")
    parser.add_argument("--session-file", required=True, help="保存 session 的 JSON 文件路径")
    args = parser.parse_args()

    session_path = Path(args.session_file)
    session_path.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--start-maximized"])
        ctx = browser.new_context(viewport=None, locale="zh-CN")
        page = ctx.new_page()

        print(f"[1] 打开 {args.login_url}", flush=True)
        try:
            page.goto(args.login_url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            print(f"[!] 打开页面失败：{e}", flush=True)
            browser.close()
            return 1
        page.wait_for_timeout(1500)

        print(f"[2] 请在浏览器里手动登录（最长 {LOGIN_TIMEOUT_SECONDS}s）…", flush=True)
        polled = 0
        interval_ms = 1500
        success = False
        while polled * interval_ms < LOGIN_TIMEOUT_SECONDS * 1000:
            if is_logged_in(page):
                success = True
                break
            page.wait_for_timeout(interval_ms)
            polled += 1

        if not success:
            print("[!] 超时未检测到登录成功", flush=True)
            browser.close()
            return 1

        print(f"[3] 检测到登录成功，URL = {page.url}", flush=True)
        page.wait_for_timeout(3000)  # 给 React 时间把 user 写进 localStorage

        all_cookies = ctx.cookies()
        # 只保留 args.domain 相关的 cookie
        cookies = [c for c in all_cookies if args.domain in c.get("domain", "")]
        ls = page.evaluate("() => Object.fromEntries(Object.entries(localStorage))")
        user_raw = ls.get("user")
        if not user_raw:
            print("[!] localStorage.user 缺失，无法保存", flush=True)
            browser.close()
            return 1
        try:
            user_obj = json.loads(user_raw)
        except json.JSONDecodeError as e:
            print(f"[!] 解析 localStorage.user 失败：{e}", flush=True)
            browser.close()
            return 1

        # quota_per_unit 也存 localStorage，每站不一定一样
        try:
            quota_per_unit = int(ls.get("quota_per_unit") or 500000)
        except (TypeError, ValueError):
            quota_per_unit = 500000

        session = {
            "cookies": cookies,
            "userId": user_obj.get("id"),
            "username": user_obj.get("username"),
            "displayName": user_obj.get("display_name"),
            "quotaPerUnit": quota_per_unit,
            "domain": args.domain,
            "savedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        session_path.write_text(
            json.dumps(session, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(
            f"[4] session 已保存 → {session_path}  "
            f"(userId={session['userId']}, quotaPerUnit={quota_per_unit})",
            flush=True,
        )

        browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(main())
