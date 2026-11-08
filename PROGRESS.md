# Aster for macOS — 进度与上下文检查点

> 这是跨会话的持久化检查点。新会话先读本文件与 `README.md`，再检查 `git status`，不要重新通读历史对话。
> 每完成一个里程碑就更新这里，并保持条目简短。

## 当前状态

- 阶段：**Mac 端 v4.4.0（含 DeepSeek Harness 原生工具链、dsh-claude-style 用量与推理滑块、Artifact 右侧工作台、Ny-Gemini 1.4.3 提示词按需注入引擎，以及对话图片导出）**
- 版本：`4.4.0`
- 最后更新：2026-11-08
- 工作目录：`aster for mac/`（4.4.0 已提交 `fda0859`；本轮对话图片导出随本次提交）

## 2026-11-08 对话图片导出

- 新增「导出对话为图片」：顶部栏或助手消息操作入口；左侧勾选一轮或多轮，右侧实时预览。
- 三套内置模板：暖纸（衬线）、夜墨（深色）、素白（无衬线）；可切换是否包含思考过程、参考来源和图片附件。
- Markdown 在本地用 unified / remark 清洗后重排：去掉原始 HTML、远程图片、危险链接、front matter 和多余空行；表格固定宽度换行、代码块自动折行，用户提问里的轻量 Markdown 标记也会被清掉。
- 渲染使用 html-to-image 在本地生成 PNG（默认 2×，长图自动降采样并限制高度），支持保存文件与复制到剪贴板；不调用任何模型。
- 新增 5 项清洗/轮次/尺寸/filename 回归测试；`npm run typecheck`、`npm test`（42 项）通过；打包版待重打。

## 2026-11-06 设置/用量弹窗闪烁修复

- 根因：Modal 面板的 Framer opacity 动画结束后（约 0.4s），macOS + Electron 的合成层偶发复用旧表面一帧，整个弹窗消失一帧；缩放/位移动画和遮罩淡入不受影响。
- 修复：`motionModalDialog` 不再驱动面板 opacity，仅保留缩放/位移弹簧；遮罩仍由 CSS 淡入。
- 同时修复遮罩 `bg-black/32` 未生成（Tailwind 不识别 32），改用 `bg-black/[0.32]`，浅色模式恢复压暗。
- 实测：设置、用量在浅色与深色 1280×840 下逐帧录屏检查无闪帧；类型检查与 37 项回归通过。

## 2026-11-06 第二阶段：官方运行时与界面整改

- 普通任务接入官方 dsh 0.2.2-rc.1 SDK；随应用分发 Node 24.11.1，解决 Electron 原生依赖兼容问题。
- 使用完整原生历史、检查点分支、上下文压缩、后台 jobs、子智能体和提供商重试；工作区切换同步至原生会话，删除对话同时清理执行历史。
- 密钥留在主进程，子进程使用回环代理临时令牌；模型地址、路径、请求头与推理设置继续生效。
- 修复工作台溢出；提供 Markdown/Mermaid 预览、正确行差异、另存为；统一暖纸张/深色令牌、16px 衬线正文、核心圆角、工具菜单和弹窗焦点。
- GitHub 技能安装保留整个目录及资源；提示词注入模块保持原样，其会话仍使用原兼容执行路径。
- 最终 37 项隔离回归、类型检查与打包通过；打包 App 的多问题续轮、窄窗口、Mermaid、Tab 焦点与 Esc 验收通过，证据见审查目录 after/。
- 验收与边界记录：`docs/audits/2026-11-06/remediation.md`；没有宣称真实模型成功率或整个 dsh 产品等价性。

## 2026-11-06 第一阶段审查整改

- 修复审查发现的 14 类问题；提示词注入预设、过滤与序列化逻辑保持原样。
- Harness 执行端校验工具白名单和只读权限；停止操作取消交互等待并清理终端进程组，重试等待取消完成。
- 修复流式尾部用量、部分响应完成判断、Anthropic 思考签名回传及缓存输入统计。
- 图片显式绑定会话服务商；失效服务禁止静默回退，可在模型服务设置中明确切换当前会话。
- 模型刷新合并最新配置；多问题独立保存答案，答完后继续，问题卡片支持滚动。
- 新增 `npm test`：24 项隔离回归测试通过；`npm run typecheck`、`npm run build` 通过。
- `npm run dist` 通过；独立用户数据目录启动打包产物，实际验证多问题选答/续轮、会话与图片服务路由、42 tokens 尾帧持久化，并检查界面截图。

## 已完成

- Electron + React + TypeScript + Vite + Tailwind 工程；CDS 令牌与 Framer Motion 弹簧动效。
- 主进程：隐藏标题栏（`hiddenInset`）、Vibrancy、窗口尺寸记忆、原生菜单、单窗口生命周期。
- 服务商：OpenAI Chat / Responses / Anthropic Messages 三种 SSE 解析；模型拉取、延迟、额外请求头、路径与上下文预算。
- 会话：本地 JSON 持久化、搜索、置顶、重命名、删除、首条消息自动标题。
- 对话：思考面板、停止、重试、继续、Markdown/GFM 表格/代码高亮/复制、token 用量与耗时。
- 图片附件：粘贴/拖拽/选择，落盘 + `aster-media://` 协议读取。
- 设置：通用、模型服务、外观、关于；密钥经 `safeStorage` 加密。
- 打包：`release/mac-arm64/Aster.app`（约 1.1 GB，arm64，含独立 Node/dsh，未签名）；`package.json` 已固定 `electronDist=node_modules/electron/dist`，打包不再联网下载 Electron。
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
2. 提交本轮整改；保持 `node_modules/`、`dist/`、`release/` 等构建产物在 git 外。
3. 如需继续：图片编辑（imageEditPath 已预留但未接入 UI）、多图并排、生成历史。

## 上下文策略

- 不把大段源码、完整日志、长截图塞进对话；只读需要的片段。
- 每个里程碑后更新本文件；会话过长时直接开新会话，以本文件 + `git diff` 为权威状态。
