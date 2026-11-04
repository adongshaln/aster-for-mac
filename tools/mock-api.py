from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json, time, argparse

MOCK_IMAGE_B64 = "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"

MODELS = [
    {"id": "mock-chat", "owned_by": "mock"},
    {"id": "mock-claude", "owned_by": "mock"},
    {"id": "mock-gpt", "owned_by": "mock"},
    {"id": "mock-deepseek", "owned_by": "mock"},
]

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, fmt, *args):
        print("[mock]", fmt % args, flush=True)
    def _json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        if self.path == "/v1/models":
            self._json({"data": MODELS})
        else:
            self._json({"error": {"message": "not found"}}, 404)
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n)
        body = json.loads(raw or b"{}")
        if self.path == "/v1/chat/completions":
            return self.chat(body)
        if self.path == "/v1/messages":
            return self.anthropic(body)
        if self.path == "/v1/images/generations":
            return self.images(body)
        if self.path == "/v1/responses":
            return self.responses_api(body)
        self._json({"error": {"message": "not found"}}, 404)
    def sse(self, obj):
        self.wfile.write(("data: " + json.dumps(obj, ensure_ascii=False) + "\n\n").encode())
        self.wfile.flush()
    def images(self, body):
        time.sleep(1.0)
        self._json({"created": int(time.time()), "data": [{"b64_json": MOCK_IMAGE_B64}]})

    def chat(self, body):
        if "image" in (body.get("modalities") or []):
            return self.gemini_image(body)
        messages = body.get("messages", [])
        prompt = ""
        for m in reversed(messages):
            c = m.get("content")
            if isinstance(c, str):
                prompt = c
            elif isinstance(c, list):
                prompt = "".join(x.get("text", "") for x in c if isinstance(x, dict))
            if prompt:
                break
        slow = "slow" in prompt
        table = "table" in prompt
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if "reason" not in prompt or body.get("reasoning_effort") or body.get("thinking"):
            for chunk in ["先拆解问题，", "确认上下文，", "再组织一个清晰的回答。"]:
                self.sse({"choices": [{"delta": {"reasoning_content": chunk}}]})
                time.sleep(0.12)
        if table:
            text = "## 对比表\n\n| 方案 | 延迟 | 特点 |\n| :--- | ---: | :--- |\n| Chat | `0.4s` | 简单直接 |\n| Responses | `0.6s` | 保留推理 |\n\n```python\nprint(\"hello aster\")\n```\n\n> 引用测试：界面应当正常渲染。"
        elif slow:
            text = "".join("这是第 %d 段流式内容，用来验证滚动锁定与停止生成。\n\n" % i for i in range(1, 60))
        else:
            text = "你好，我是 Aster。收到你的消息：**" + prompt[:120] + "**\n\n这是一段用于验证 Markdown、流式输出和思考面板的回复。\n\n- 支持列表\n- 支持 `inline code`\n- 支持 [链接](https://example.com)"
        for i in range(0, len(text), 12):
            self.sse({"choices": [{"delta": {"content": text[i:i+12]}}]})
            time.sleep(0.01 if not slow else 0.3)
        self.sse({"choices": [], "usage": {"prompt_tokens": 1820, "prompt_tokens_details": {"cached_tokens": 900}, "completion_tokens": 420, "completion_tokens_details": {"reasoning_tokens": 120}, "total_tokens": 2240}})
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()
    def gemini_image(self, body):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        for _ in range(2):
            self.sse({"choices": [{"delta": {"content": [{"type": "image_url", "image_url": {"url": "data:image/png;base64," + MOCK_IMAGE_B64}}]}}]})
            time.sleep(0.4)
        self.sse({"choices": [{"delta": {}, "finish_reason": "stop"}]})
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def anthropic(self, body):
        slow = "slow" in json.dumps(body, ensure_ascii=False)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.sse({"type": "message_start", "message": {"usage": {"input_tokens": 900, "cache_read_input_tokens": 400}}})
        self.sse({"type": "content_block_start", "index": 0, "content_block": {"type": "thinking"}})
        for chunk in ["让我先想一想。", "检查请求结构。"]:
            self.sse({"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": chunk}})
            time.sleep(0.12)
        self.sse({"type": "content_block_start", "index": 1, "content_block": {"type": "text"}})
        text = "**Anthropic Messages** 流式回复正常。\n\n```js\nconsole.log('aster')\n```"
        for i in range(0, len(text), 8):
            self.sse({"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": text[i:i+8]}})
            time.sleep(0.02 if not slow else 1.0)
        self.sse({"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 220}})
        self.sse({"type": "message_stop"})
        self.wfile.flush()
    def responses_api(self, body):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.end_headers()
        self.sse({"type": "response.created", "response": {"id": "resp_mock"}})
        for chunk in ["先读取输入，", "再整理推理摘要。"]:
            self.sse({"type": "response.reasoning_summary_text.delta", "delta": chunk})
            time.sleep(0.12)
        text = "**Responses API** 流式回复正常。\n\n- 推理摘要单独展示\n- 正文独立渲染"
        for i in range(0, len(text), 10):
            self.sse({"type": "response.output_text.delta", "delta": text[i:i+10]})
            time.sleep(0.02)
        self.sse({"type": "response.completed", "response": {"status": "completed", "usage": {"input_tokens": 1200, "output_tokens": 300, "total_tokens": 1500, "output_tokens_details": {"reasoning_tokens": 80}}}})
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8010)
    a = ap.parse_args()
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()
