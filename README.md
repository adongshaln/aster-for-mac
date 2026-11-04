# Aster for macOS

Aster 的 macOS 桌面客户端。使用 Electron + React + TypeScript 构建，界面、设计令牌与弹簧动效参考 [Caho1/open-claude-ui](https://github.com/Caho1/open-claude-ui)（CDS）。

当前版本：`0.1.0`，聊天 MVP 已完成并通过本机打包验证。

## 功能

- **多服务商配置**：OpenAI 兼容（Chat Completions / Responses）与 Anthropic Messages 两种协议；支持自定义 Base URL、路径、额外请求头与上下文预算。
- **模型管理**：从服务端拉取模型列表，选择默认模型与思考强度（`default / low / medium / high`），显示连接延迟。
- **流式对话**：SSE 流式正文与思考过程，首字延迟、耗时与 token 用量统计。
- **会话管理**：本地持久化、侧栏搜索、置顶、重命名、删除；首条消息自动作为标题。
- **消息操作**：停止、重试（重新生成）、从中断处继续；Markdown、GFM 表格、引用、代码高亮与一键复制。
- **图片附件**：粘贴、拖拽或选择图片，随消息发送；附件保存在本地并通过自定义协议读取。
- **图片生成**：顶部工具栏打开生成面板，支持 OpenAI Images 与 Gemini 多模态两种协议；结果落盘后直接插入当前对话。
- **macOS 原生体验**：隐藏标题栏、`under-window` Vibrancy、红绿灯位置、窗口尺寸记忆、原生菜单与快捷键。
- **用量仪表盘**：按天与模型聚合请求、token、缓存命中率和首字延迟，可从最近请求跳回会话。
- **主题**：浅色 / 深色 / 跟随系统。
- **安全**：API Key 通过 Electron `safeStorage`（macOS 钥匙串）加密，不写入 `config.json` / 对话文件；渲染进程开启 `contextIsolation`、禁用 `nodeIntegration` 并启用 sandbox。

## 技术栈

| 层 | 选型 |
| --- | --- |
| Shell | Electron 45 |
| UI | React 18、TypeScript、Tailwind CSS 3、Framer Motion |
| 状态 | Zustand |
| Markdown | react-markdown、remark-gfm、rehype-highlight |
| 构建 | Vite 6、electron-builder 26 |

## 开发

要求 Node.js ≥ 20（本机验证使用 Node 22.20.0）与 macOS 12+。

```bash
cd mac
npm install
npm run dev          # Vite + Electron，热更新
npm run typecheck    # 渲染进程与主进程类型检查
npm run build        # 构建 dist/ 与 dist-electron/
npm start            # 构建后以 Electron 启动
```

## 打包

```bash
npm run dist         # 生成 release/mac-arm64/Aster.app（当前架构）
npm run dist:dmg     # 生成 .dmg 安装包
```

产物位于 `release/`。当前构建未签名/未公证，首次打开如被 Gatekeeper 拦截，可执行：

```bash
xattr -dr com.apple.quarantine "release/mac-arm64/Aster.app"
```

## 本地数据

数据目录：`~/Library/Application Support/Aster/aster/`

| 文件 | 内容 |
| --- | --- |
| `config.json` | 服务商、模型、设置（不含密钥） |
| `conversations.json` | 会话与消息（含 token 用量、状态） |
| `secrets.json` | `safeStorage` 加密后的 API Key |
| `attachments/` | 图片附件 |
| `window-state.json` | 窗口位置与尺寸 |

删除该目录即可回到首次启动引导。也可以在设置 → 关于 → 打开数据目录。

## 快捷键

| 快捷键 | 动作 |
| --- | --- |
| `⌘ N` | 新对话 |
| `⌘ K` | 聚焦会话搜索 |
| `⌘ B` | 收起 / 展开侧栏 |
| `⌘ ,` | 打开设置 |
| `⌘ U` | 打开用量仪表盘 |
| `⌘ Enter` | 在生成图片面板中提交 |
| `Enter` / `Shift + Enter` | 发送 / 换行（可在设置中改为 ⌘ Enter 发送） |
| `Esc` | 关闭设置或弹层 |

## 本地联调

仓库内附带一个不依赖外网的 mock 服务，覆盖 OpenAI Chat、Responses、Anthropic Messages 三种流式协议：

```bash
python3 tools/mock-api.py --port 8010
```

在设置 → 模型服务中新建服务：

- Base URL：`http://127.0.0.1:8010`
- OpenAI 兼容：任意 API Key（mock 不校验），拉取模型后选择 `mock-chat`
- Anthropic：路径使用 `/v1/messages`，模型可填 `mock-claude`

Mock 行为：

- 消息包含 `table`：返回 GFM 表格、Python 代码块与引用；
- 消息包含 `slow`：慢速长流，用于验证停止 / 继续；
- 默认：流式正文 + 思考过程 + 用量；
- `/v1/images/generations`：返回一张生成的测试图；Gemini 模型（名称含 `gemini` 与 `image`）走多模态流式图片。

## 目录结构

```
mac/
├─ electron/           主进程：窗口、菜单、IPC、SSE、密钥存储
│  ├─ main.ts
│  ├─ api.ts
│  ├─ preload.ts
│  └─ store.ts
├─ shared/            主进程 / 渲染进程共享类型与推理强度工具
├─ src/
│  ├─ components/     聊天、侧栏、输入胶囊、设置、Markdown 等
│  ├─ state/store.ts  会话、流式请求与持久化状态机
│  ├─ lib/            动效与工具函数
│  └─ styles/         CDS 令牌与全局样式
├─ tools/mock-api.py  本地联调 mock
└─ PROGRESS.md        开发进度与验证记录
```

## 已知限制

- 暂不实现故事模式（按需求暂缓）。
- 用量仪表盘只统计本机已上报的 token 用量，不做费用估算。
- 未做代码签名、公证与自动更新。
