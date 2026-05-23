"""
用保存的 cookies 打开后台 console 页，免登录方便充值/查日志等操作。
循环里每 10s 把当前 cookies + localStorage.user 回写到 session-file，
这样用户在窗口里若被动重新登录过，新 cookies 也会被保留下来，
下次「刷新余额」不会再报过期。

使用：
    python newapi_open_console.py \
        --console-url https://yunwu.ai/console \
        --domain yunwu.ai \
        --session-file <path>

退出码：
    0 = 用户关闭窗口（正常退出）
    1 = 浏览器异常 / session 文件不可读
    2 = 参数错误
"""
import argparse
import datetime
import io
import json
import sys
import time
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright


def write_session_snapshot(session_path: Path, base_session: dict, ctx, page, domain: str) -> None:
    """把当前 ctx 的 cookies + localStorage.user 回写。
    出错就静默跳过 —— 我们宁可继续等用户操作也不要中断会话。"""
    try:
        all_cookies = ctx.cookies()
        cookies = [c for c in all_cookies if domain in c.get("domain", "")]
        ls = page.evaluate("() => Object.fromEntries(Object.entries(localStorage))")
        user_raw = ls.get("user")
        user_obj = {}
        if user_raw:
            try:
                user_obj = json.loads(user_raw)
            except Exception:
                pass

        merged = dict(base_session)
        if cookies:
            merged["cookies"] = cookies
        if user_obj.get("id"):
            merged["userId"] = user_obj["id"]
            merged["username"] = user_obj.get("username") or merged.get("username")
            merged["displayName"] = user_obj.get("display_name") or merged.get("displayName")
        # quota_per_unit 也可能变（极少见）
        try:
            qpu = int(ls.get("quota_per_unit") or merged.get("quotaPerUnit") or 500000)
            merged["quotaPerUnit"] = qpu
        except (TypeError, ValueError):
            pass
        merged["savedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

        session_path.write_text(
            json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except Exception:
        # 浏览器可能正在关闭，读不到就算了
        pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--console-url", required=True)
    parser.add_argument("--domain", required=True)
    parser.add_argument("--session-file", required=True)
    args = parser.parse_args()

    session_path = Path(args.session_file)
    if not session_path.exists():
        print(f"[!] session 文件不存在：{session_path}", flush=True)
        return 1

    try:
        base_session = json.loads(session_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[!] session 文件损坏：{e}", flush=True)
        return 1

    cookies = base_session.get("cookies") or []
    user_id = base_session.get("userId")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--start-maximized"])
        ctx = browser.new_context(viewport=None, locale="zh-CN")
        if cookies:
            try:
                ctx.add_cookies(cookies)
                print(f"[1] 已注入 {len(cookies)} 条 cookies", flush=True)
            except Exception as e:
                print(f"[!] 注入 cookies 失败：{e}", flush=True)

        # 关键修复：在页面 JS 执行前注入 localStorage.user，让 React 端能拿到
        # user.id 并写入 New-Api-User 请求头。否则 React 启动时调 /api/user/self
        # 会带 New-Api-User: -1 被服务端拒绝，强行回到登录态。
        if user_id:
            minimal_user = {
                "id": user_id,
                "username": base_session.get("username") or "",
                "display_name": base_session.get("displayName") or "",
                "role": 1,
                "status": 1,
            }
            user_json = json.dumps(minimal_user)
            init_script = (
                f"try {{ localStorage.setItem('user', {json.dumps(user_json)}); }} "
                "catch(e) { console.error('inject user failed', e); }"
            )
            ctx.add_init_script(init_script)
            print(f"[1b] 已注入 localStorage.user (id={user_id})", flush=True)

        page = ctx.new_page()
        print(f"[2] 打开 {args.console_url}", flush=True)
        try:
            page.goto(args.console_url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            print(f"[!] 打开页面失败：{e}", flush=True)

        print("[3] 浏览器已打开，关闭窗口后此程序自动退出。", flush=True)

        # 每 10s 回写一次 session（捕获用户在窗口里可能发生的重新登录）
        last_snapshot = 0
        while browser.is_connected():
            now = time.time()
            if now - last_snapshot > 10:
                write_session_snapshot(session_path, base_session, ctx, page, args.domain)
                last_snapshot = now
            time.sleep(1)

        print("[4] 浏览器已关闭", flush=True)
        return 0


if __name__ == "__main__":
    sys.exit(main())
