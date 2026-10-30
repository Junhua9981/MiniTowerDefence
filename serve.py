# 沒有 Node.js 時的備用伺服器：py serve.py [埠號=8080]
# 強制 .js 用 text/javascript（Windows 登錄檔有時會把 .js 設成 text/plain，導致 ES modules 載入失敗）。
import http.server, socketserver, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html; charset=utf-8'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as httpd:
    print(f'極簡塔防・日夜潮汐 → http://localhost:{PORT}/')
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('10.255.255.255', 1)); ip = s.getsockname()[0]; s.close()
        print(f'手機（同一個 Wi-Fi）→ http://{ip}:{PORT}/')
    except Exception:
        pass
    print(f'壓力測試     → http://localhost:{PORT}/?bench=12000')
    httpd.serve_forever()
