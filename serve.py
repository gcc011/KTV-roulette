#!/usr/bin/env python3
"""麦浪点唱 · 本地预览服务器

在电脑和手机上同时打开这个转盘：
1. 运行 python serve.py
2. 让手机和电脑连接同一个 Wi-Fi
3. 在手机浏览器输入终端里打印的「手机访问」地址

注意：局域网 HTTP 地址无法启用 Service Worker / 安装 PWA，
但页面和转盘的所有功能都能正常使用。
"""

from __future__ import annotations

import os
import socket
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "5173"))
HOST = "0.0.0.0"


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".js": "text/javascript",
        ".css": "text/css",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # 方便修改文件后刷新即可看到效果；离线由 Service Worker 在 HTTPS 下负责
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


def get_lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def main() -> None:
    lan_ip = get_lan_ip()
    print("")
    print("  ================================================")
    print("   麦浪点唱 · KTV 转盘点歌")
    print("  ================================================")
    print(f"   电脑访问   http://localhost:{PORT}")
    print(f"   手机访问   http://{lan_ip}:{PORT}")
    print("")
    print("   手机与电脑请连接同一个 Wi-Fi")
    print("   按 Ctrl+C 停止服务器")
    print("  ================================================")
    print("")

    if "--open" in sys.argv:
        threading.Timer(
            0.8, lambda: webbrowser.open(f"http://localhost:{PORT}")
        ).start()

    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as error:
        print(f"启动失败：{error}")
        print(f"端口 {PORT} 可能已被占用，可以尝试：set PORT=5174 && python serve.py")
        return

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
