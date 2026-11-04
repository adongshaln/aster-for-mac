# Aster for macOS — 进度与上下文检查点

> 这是跨会话的持久化检查点。新会话先读本文件与 `README.md`，再检查 `git status`，不要重新通读历史对话。
> 每完成一个里程碑就更新这里，并保持条目简短。

## 当前状态

- 阶段：**Mac 端 v4.3.0 完整版（含 DeepSeek Harness 原生工具链、dsh-claude-style 用量与推理滑块、Artifact 右侧工作台、以及 Ny-Gemini 1.4.3 提示词按需注入引擎）**
- 版本：`4.3.0`
- 最后更新：2026-11-04
- 工作目录：`mac/`（整个目录尚未提交到 git）

## 已完成

- Electron + React + TypeScript + Vite + Tailwind 工程；CDS 令牌与 Framer Motion 弹簧动效。
- 主进程：隐藏标题栏（`hiddenInset`）、Vibrancy、窗口尺寸记忆、原生菜单、单窗口生命周期。
- 服务商：OpenAI Chat / Responses / Anthropic Messages 三种 SSE 解析；模型拉取、延迟、额外请求头、路径与上下文预算。
- 会话：本地 JSON 持久化、搜索、置顶、重命名、删除、首条消息自动标题。
- 对话：思考面板、停止、重试、继续、Markdown/GFM 表格/代码高亮/复制、token 用量与耗时。
- 图片附件：粘贴/拖拽/选择，落盘 + `aster-media://` 协议读取。
- 设置：通用、模型服务、外观、关于；密钥经 `safeStorage` 加密。
- 打包：`release/mac-arm64/Aster.app`（约 315 MB，arm64，未签名）；`package.json` 已固定 `electronDist=node_modules/electron/dist`，打包不再联网下载 Electron。
- 用量仪表盘：侧栏「用量」/ `⌘ U` 打开；按天柱状图、模型用量表、最近请求、缓存命中率与平均首字延迟；区分已上报 / 未上报用量的请求。
- 图片生成：顶部工具栏图片按钮；OpenAI Images 与 Gemini 多模态两种协议；支持尺寸选择、模型输入；结果保存到附件目录并作为助手消息插入对话。

## 验证记录

| 项目 | 结果 | 方式 |
| --- | --- | --- |
| `tsc`（渲染 + 主进程） | 通过 | `npm run typecheck` |
| Vite / electron-builder 打包 | 通过 | `npm run dist` |
| 打包产物启动 | 通过 | Finder / LaunchServices 启动，菜单栏显示 Aster |
| 首次启动引导 | 通过 | 空数据目录显示“先连接一个模型”，设置→模型服务表单正常 |
| 模型拉取 | 通过 | mock：4 个模型，20 ms |
| 流式正文 + 思考 | 通过 | mock Chat / Responses / Anthropic 三种协议 |
| Markdown 表格 / 代码块 / 引用 | 通过 | mock `table` 场景 |
| 停止 / 继续 | 通过 | mock `slow` 场景，停止后出现“继续” |
| 图片附件 | 通过 | 旧会话已验证粘贴与发送 |
| 外观 | 通过 | 浅色 / 深色截图 |
| 用量仪表盘 | 通过 | 空状态、浅色 / 深色、按天与模型聚合、最近请求跳转 |
| 图片生成（OpenAI Images） | 通过 | mock `/v1/images/generations`，图片插入对话 |
| 图片生成（Gemini 多模态） | 通过 | mock SSE `image_url`，流式解析到 `[DONE]` |
| 打包产物（含用量页） | 通过 | 315 MB，`⌘U` 可打开，空/有数据两种状态 |
| 打包产物（图片生成） | 通过 | 打包后生成图片并插入对话，重启后仍显示 |
| 图片持久化 | 通过 | 附件落盘，重启后图片与模型标记仍在 |

## 环境注意

- 本机 Node 使用 `~/.local/aster-mac/node-v22.20.0-darwin-arm64/bin`（不是系统 PATH）。
- 在 DSH 的 workspace-write 沙箱里直接启动 Electron 会因 Chromium sandbox 报 `Operation not permitted`。验证时使用：
  - 在沙箱外通过 Finder / `open` 启动；或
  - `--no-sandbox --user-data-dir=/tmp/...` 仅用于自动化测试。
- 自动化 UI 测试：Electron `--remote-debugging-port=9223` + `/tmp/cdp.mjs`（`Runtime.evaluate` / `Page.captureScreenshot`）。

## 下一步

1. 打包签名与公证（可选）；补齐 `README` 截图。
2. 将 `mac/` 纳入 git（先确认 `.gitignore` 生效，不要提交 `node_modules/`、`dist/`、`release/`）。
3. 如需继续：图片编辑（imageEditPath 已预留但未接入 UI）、多图并排、生成历史。

## 上下文策略

- 不把大段源码、完整日志、长截图塞进对话；只读需要的片段。
- 每个里程碑后更新本文件；会话过长时直接开新会话，以本文件 + `git diff` 为权威状态。
