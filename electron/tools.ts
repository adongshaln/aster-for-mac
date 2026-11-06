import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Minimatch } from 'minimatch'
import { withAbort } from './async'
import type {
  ArtifactItem,
  AskUserQuestionItem,
  ChatCitation,
  InstalledSkill,
  PermissionMode,
  Profile,
  TodoItem,
  ToolActivity,
} from '../shared/types'

export interface HarnessToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface PendingToolCall {
  id: string
  name: string
  arguments: string
}

export interface ToolExecutionContext {
  workspaceDir: string
  profile: Profile
  apiKey: string
  permissionMode: PermissionMode
  allowedToolNames: ReadonlySet<string>
  skills: InstalledSkill[]
  signal: AbortSignal
  emitActivity: (activity: ToolActivity) => void
  emitCitations: (citations: ChatCitation[]) => void
  emitTodos: (todos: TodoItem[]) => void
  emitArtifact: (artifact: ArtifactItem) => void
  requestApproval: (callId: string, activity: ToolActivity) => Promise<'allow_once' | 'always_allow' | 'deny'>
  requestAskUser: (callId: string, questions: AskUserQuestionItem[]) => Promise<Record<string, string>>
  runSubagent?: (description: string, prompt: string, cwd: string) => Promise<string>
}

const alwaysAllowedTools = new Set<string>()
const DESTRUCTIVE_TOOLS = new Set(['bash', 'write', 'edit'])
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export function resolveWorkspaceDir(configured?: string): string {
  const candidate = configured?.trim()
  if (candidate && fs.existsSync(candidate)) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate
    } catch {
      // fall through
    }
  }
  return os.homedir()
}

export function resolveTargetPath(workspaceDir: string, filePath: string): string {
  const trimmed = filePath.trim()
  if (!trimmed) throw new Error('文件路径不能为空')
  if (trimmed.startsWith('~/')) {
    return path.join(os.homedir(), trimmed.slice(2))
  }
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed)
  return path.resolve(workspaceDir, trimmed)
}

export function buildHarnessToolDefinitions(options: {
  webSearchEnabled: boolean
  harnessToolsEnabled: boolean
  permissionMode: PermissionMode
  skills: InstalledSkill[]
}): HarnessToolDefinition[] {
  const defs: HarnessToolDefinition[] = []
  const enabledSkills = options.skills.filter(s => s.enabled)

  if (options.webSearchEnabled) {
    defs.push({
      name: 'web_search',
      description:
        'Search the web in real time for current information, events, versions, or external facts. Pass 1-4 focused queries in `queries` to run them concurrently in parallel.',
      parameters: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: { type: 'string' },
            description: '1 to 4 search queries; their results are merged.',
          },
          query: {
            type: 'string',
            description: 'Optional single query fallback.',
          },
        },
        additionalProperties: false,
      },
    })
    defs.push({
      name: 'web_fetch',
      description: 'Fetch the content of a specific HTTP(S) URL and return its readable text.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The HTTP(S) URL to fetch.' },
        },
        required: ['url'],
        additionalProperties: false,
      },
    })
  }

  if (options.harnessToolsEnabled) {
    defs.push({
      name: 'read',
      description: 'Read a UTF-8 text file from the local filesystem and return line-numbered content.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to read (relative to workspace or absolute).' },
          offset: { type: 'number', description: '1-based first line to return. Defaults to 1.' },
          limit: { type: 'number', description: 'Maximum number of lines to return. Defaults to 400.' },
        },
        required: ['file_path'],
        additionalProperties: false,
      },
    })

    defs.push({
      name: 'glob',
      description: 'Find files whose paths match a glob or substring pattern inside the workspace.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern to match file paths against (e.g. "**/*.ts", "*.json").' },
          path: { type: 'string', description: 'Optional directory to search in. Defaults to workspace.' },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    })

    defs.push({
      name: 'grep',
      description: 'Search file contents with a regular expression and return matching lines with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regular expression to search for.' },
          path: { type: 'string', description: 'File or directory to search. Defaults to workspace.' },
          include: { type: 'string', description: 'Optional file extension/glob filter (e.g. "*.ts").' },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    })

    if (options.permissionMode !== 'plan-only') {
      defs.push({
        name: 'write',
        description: 'Create or fully replace a UTF-8 text file in the workspace.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to write.' },
            content: { type: 'string', description: 'Full UTF-8 text content to write.' },
          },
          required: ['file_path', 'content'],
          additionalProperties: false,
        },
      })

      defs.push({
        name: 'edit',
        description: 'Edit an existing UTF-8 text file by replacing literal text.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to edit.' },
            old_string: { type: 'string', description: 'Literal text to replace.' },
            new_string: { type: 'string', description: 'Literal replacement text.' },
            replace_all: { type: 'boolean', description: 'Replace all occurrences. Defaults to false.' },
          },
          required: ['file_path', 'old_string', 'new_string'],
          additionalProperties: false,
        },
      })

      defs.push({
        name: 'bash',
        description: 'Execute a bash command (`bash -c`) on macOS and return its stdout/stderr and exit code.',
        parameters: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Concise 5-10 word description of what this command does.' },
            command: { type: 'string', description: 'The bash command to execute.' },
            workdir: { type: 'string', description: 'Optional working directory.' },
          },
          required: ['description', 'command'],
          additionalProperties: false,
        },
      })
    }

    defs.push({
      name: 'todo_write',
      description: 'Record and update a structured task list to plan multi-step work and show live progress in the UI.',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'Short imperative task description.' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
              },
              required: ['content', 'status'],
              additionalProperties: false,
            },
          },
        },
        required: ['todos'],
        additionalProperties: false,
      },
    })

    defs.push({
      name: 'ask_user_question',
      description: 'Ask the user a concise multiple-choice question when you need confirmation or a decision.',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                header: { type: 'string' },
                question: { type: 'string' },
                options: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      description: { type: 'string' },
                    },
                    required: ['label'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['id', 'question'],
              additionalProperties: false,
            },
          },
        },
        required: ['questions'],
        additionalProperties: false,
      },
    })

    defs.push({
      name: 'subagent',
      description: 'Delegate a focused, self-contained research or analysis subtask to an independent subagent.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Short 3-5 word description of the delegated task.' },
          prompt: { type: 'string', description: 'Complete, self-contained instructions for the subagent.' },
        },
        required: ['description', 'prompt'],
        additionalProperties: false,
      },
    })

    defs.push({
      name: 'create_artifact',
      description: 'Render an interactive HTML, SVG, Mermaid diagram, or Markdown document in Aster’s right-hand Artifact Split Pane.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of the artifact.' },
          kind: { type: 'string', enum: ['html', 'svg', 'mermaid', 'markdown', 'code'] },
          content: { type: 'string', description: 'Complete self-contained source code or markup.' },
          language: { type: 'string', description: 'Optional language identifier for code artifacts.' },
        },
        required: ['title', 'kind', 'content'],
        additionalProperties: false,
      },
    })
  }

  if (enabledSkills.length > 0) {
    defs.push({
      name: 'skill',
      description: `Load full instructions for an installed skill. Available skills: ${enabledSkills.map(s => `${s.name} (${s.description})`).join('; ')}`,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            enum: enabledSkills.map(s => s.name),
            description: 'The exact skill name to load.',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    })
  }

  return defs
}

export async function executeHarnessToolCall(
  call: PendingToolCall,
  ctx: ToolExecutionContext,
): Promise<string> {
  ctx.signal.throwIfAborted()
  const aliases: Record<string, string> = { search_web: 'web_search', fetch_web: 'web_fetch' }
  const toolName = aliases[call.name] ?? call.name
  if (
    !ctx.allowedToolNames.has(toolName) ||
    (ctx.permissionMode === 'plan-only' && DESTRUCTIVE_TOOLS.has(toolName))
  ) {
    const error = `当前权限或工具设置不允许执行 ${call.name}`
    ctx.emitActivity({ id: call.id, name: call.name, label: error, status: 'failed', output: error })
    return JSON.stringify({ ok: false, error: 'tool_not_allowed', message: error })
  }
  const startedAt = performance.now()
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(call.arguments || '{}') as Record<string, unknown>
  } catch {
    args = {}
  }

  const label = describeToolCall(call.name, args)
  const initialActivity: ToolActivity = {
    id: call.id,
    name: call.name,
    label,
    status: 'running',
    input: args,
  }

  // Check if approval is required under 'ask-destructive' mode
  if (
    ctx.permissionMode === 'ask-destructive' &&
    DESTRUCTIVE_TOOLS.has(call.name) &&
    !alwaysAllowedTools.has(call.name)
  ) {
    const pendingActivity: ToolActivity = { ...initialActivity, status: 'pending_approval' }
    ctx.emitActivity(pendingActivity)
    const decision = await withAbort(ctx.requestApproval(call.id, pendingActivity), ctx.signal)
    ctx.signal.throwIfAborted()
    if (decision === 'always_allow') {
      alwaysAllowedTools.add(call.name)
    } else if (decision === 'deny') {
      const deniedActivity: ToolActivity = {
        ...initialActivity,
        label: `已拒绝执行：${label}`,
        status: 'failed',
        output: 'User denied tool execution.',
        durationMs: Math.round(performance.now() - startedAt),
      }
      ctx.emitActivity(deniedActivity)
      return JSON.stringify({ ok: false, error: 'user_denied', message: 'User denied tool execution.' })
    }
  }

  ctx.signal.throwIfAborted()
  ctx.emitActivity(initialActivity)

  try {
    switch (call.name) {
      case 'web_search':
      case 'search_web': {
        const queries = extractQueries(args)
        const { output, citations, summaryLabel } = await executeConcurrentWebSearch(
          ctx.profile,
          ctx.apiKey,
          queries,
          ctx.signal,
        )
        if (citations.length > 0) ctx.emitCitations(citations)
        ctx.emitActivity({
          ...initialActivity,
          label: summaryLabel,
          status: 'completed',
          output: output.slice(0, 1200),
          durationMs: Math.round(performance.now() - startedAt),
        })
        return output
      }

      case 'web_fetch':
      case 'fetch_web': {
        const url = String(args.url ?? '').trim()
        const { title, content } = await fetchWebPageContent(ctx.profile, ctx.apiKey, url, ctx.signal)
        const out = JSON.stringify({ ok: true, url, title, content: content.slice(0, 14_000) })
        ctx.emitActivity({
          ...initialActivity,
          label: `已读取网页：${(title || url).slice(0, 28)}`,
          status: 'completed',
          output: content.slice(0, 800),
          durationMs: Math.round(performance.now() - startedAt),
        })
        return out
      }

      case 'read': {
        const filePath = resolveTargetPath(ctx.workspaceDir, String(args.file_path ?? ''))
        const offset = Math.max(1, Number(args.offset) || 1)
        const limit = Math.max(1, Math.min(2000, Number(args.limit) || 400))
        const raw = fs.readFileSync(filePath, 'utf8')
        const lines = raw.split(/\r?\n/)
        const slice = lines.slice(offset - 1, offset - 1 + limit)
        const numbered = slice.map((line, i) => `${offset + i}: ${line}`).join('\n')
        ctx.emitActivity({
          ...initialActivity,
          label: `已读取 ${path.basename(filePath)} (${slice.length} 行)`,
          status: 'completed',
          output: numbered.slice(0, 1200),
          durationMs: Math.round(performance.now() - startedAt),
        })
        return `<path>${filePath}</path>\n<content>\n${numbered}\n</content>`
      }

      case 'write': {
        const filePath = resolveTargetPath(ctx.workspaceDir, String(args.file_path ?? ''))
        const content = String(args.content ?? '')
        const oldText = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, content, 'utf8')
        const diff = { filename: path.basename(filePath), oldText, newText: content }
        ctx.emitArtifact({
          id: `diff-${call.id}`,
          title: `写入 ${path.basename(filePath)}`,
          kind: 'diff',
          filename: filePath,
          content,
          oldText,
          newText: content,
        })
        ctx.emitActivity({
          ...initialActivity,
          label: `已写入文件 ${path.basename(filePath)}`,
          status: 'completed',
          diff,
          durationMs: Math.round(performance.now() - startedAt),
        })
        return JSON.stringify({ ok: true, file_path: filePath, bytes: Buffer.byteLength(content, 'utf8') })
      }

      case 'edit': {
        const filePath = resolveTargetPath(ctx.workspaceDir, String(args.file_path ?? ''))
        const oldString = String(args.old_string ?? '')
        const newString = String(args.new_string ?? '')
        const replaceAll = Boolean(args.replace_all)
        const oldText = fs.readFileSync(filePath, 'utf8')
        if (!oldText.includes(oldString)) {
          throw new Error(`未在 ${path.basename(filePath)} 中找到待替换的文本`)
        }
        const newText = replaceAll
          ? oldText.split(oldString).join(newString)
          : oldText.replace(oldString, () => newString)
        fs.writeFileSync(filePath, newText, 'utf8')
        const diff = { filename: path.basename(filePath), oldText, newText }
        ctx.emitArtifact({
          id: `diff-${call.id}`,
          title: `修改 ${path.basename(filePath)}`,
          kind: 'diff',
          filename: filePath,
          content: newText,
          oldText,
          newText,
        })
        ctx.emitActivity({
          ...initialActivity,
          label: `已编辑文件 ${path.basename(filePath)}`,
          status: 'completed',
          diff,
          durationMs: Math.round(performance.now() - startedAt),
        })
        return JSON.stringify({ ok: true, file_path: filePath })
      }

      case 'glob': {
        const rootDir = args.path ? resolveTargetPath(ctx.workspaceDir, String(args.path)) : ctx.workspaceDir
        const pattern = String(args.pattern ?? '*')
        const matched = walkFiles(rootDir, pattern, 120)
        const output = matched.join('\n') || 'No matching files found.'
        ctx.emitActivity({
          ...initialActivity,
          label: `查找文件 ${pattern} · ${matched.length} 项`,
          status: 'completed',
          output: output.slice(0, 1000),
          durationMs: Math.round(performance.now() - startedAt),
        })
        return output
      }

      case 'grep': {
        const rootDir = args.path ? resolveTargetPath(ctx.workspaceDir, String(args.path)) : ctx.workspaceDir
        const pattern = String(args.pattern ?? '')
        const include = args.include ? String(args.include) : undefined
        const matches = grepFiles(rootDir, pattern, include, 100)
        const output = matches.join('\n') || 'No matches found.'
        ctx.emitActivity({
          ...initialActivity,
          label: `搜索内容 "${pattern.slice(0, 22)}" · ${matches.length} 处匹配`,
          status: 'completed',
          output: output.slice(0, 1200),
          durationMs: Math.round(performance.now() - startedAt),
        })
        return output
      }

      case 'bash': {
        const command = String(args.command ?? '')
        const workdir = args.workdir ? resolveTargetPath(ctx.workspaceDir, String(args.workdir)) : ctx.workspaceDir
        const desc = String(args.description ?? command.slice(0, 32))
        const result = await runBashCommand(command, workdir, ctx.signal)
        ctx.emitActivity({
          ...initialActivity,
          label: `${desc} [exit: ${result.exitCode}]`,
          status: result.exitCode === 0 ? 'completed' : 'failed',
          output: result.output.slice(0, 2000),
          durationMs: Math.round(performance.now() - startedAt),
        })
        return `${result.output}\n[exit code: ${result.exitCode}]`
      }

      case 'todo_write': {
        const rawTodos = Array.isArray(args.todos) ? args.todos : []
        const todos: TodoItem[] = rawTodos
          .map(item => {
            const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
            const status = ['pending', 'in_progress', 'completed'].includes(String(obj.status))
              ? (String(obj.status) as TodoItem['status'])
              : 'pending'
            return {
              content: String(obj.content ?? '').trim(),
              status,
            }
          })
          .filter(t => t.content.length > 0)
        ctx.emitTodos(todos)
        const doneCount = todos.filter(t => t.status === 'completed').length
        ctx.emitActivity({
          ...initialActivity,
          label: `更新任务清单 (${doneCount}/${todos.length} 已完成)`,
          status: 'completed',
          durationMs: Math.round(performance.now() - startedAt),
        })
        return JSON.stringify({
          ok: true,
          summary: `Updated todo list: ${todos.filter(t => t.status === 'pending').length} pending, ${todos.filter(t => t.status === 'in_progress').length} in progress, ${doneCount} completed.`,
        })
      }

      case 'ask_user_question': {
        const rawQuestions = Array.isArray(args.questions) ? args.questions : []
        const questions: AskUserQuestionItem[] = rawQuestions.map((q, idx) => {
          const obj = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>
          const opts = Array.isArray(obj.options)
            ? obj.options.map(o => {
                const oRec = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>
                return { label: String(oRec.label ?? ''), description: oRec.description ? String(oRec.description) : undefined }
              })
            : undefined
          return {
            id: String(obj.id ?? `q-${idx}`),
            header: obj.header ? String(obj.header) : undefined,
            question: String(obj.question ?? '请选择'),
            options: opts,
          }
        })
        ctx.emitActivity({
          ...initialActivity,
          label: `等待你的选择：${questions[0]?.question.slice(0, 22) ?? ''}`,
          status: 'running',
        })
        if (!questions.length) throw new Error('至少需要提供一个问题')
        const answers = await withAbort(ctx.requestAskUser(call.id, questions), ctx.signal)
        ctx.signal.throwIfAborted()
        ctx.emitActivity({
          ...initialActivity,
          label: `已收到回答`,
          status: 'completed',
          output: JSON.stringify(answers),
          durationMs: Math.round(performance.now() - startedAt),
        })
        return JSON.stringify({ ok: true, answers })
      }

      case 'subagent': {
        const desc = String(args.description ?? '子任务分析').trim()
        const prompt = String(args.prompt ?? '').trim()
        if (!ctx.runSubagent) {
          throw new Error('当前未启用子智能体执行器')
        }
        const subResult = await ctx.runSubagent(desc, prompt, ctx.workspaceDir)
        ctx.emitActivity({
          ...initialActivity,
          label: `已完成子智能体任务：${desc}`,
          status: 'completed',
          output: subResult.slice(0, 1200),
          durationMs: Math.round(performance.now() - startedAt),
        })
        return JSON.stringify({ ok: true, description: desc, result: subResult })
      }

      case 'create_artifact': {
        const title = String(args.title ?? '预览产物').trim() || '预览产物'
        const kind = (['html', 'svg', 'mermaid', 'markdown', 'code'].includes(String(args.kind))
          ? String(args.kind)
          : 'html') as ArtifactItem['kind']
        const content = String(args.content ?? '')
        const artifact: ArtifactItem = {
          id: `art-${call.id}`,
          title,
          kind,
          content,
          language: args.language ? String(args.language) : undefined,
        }
        ctx.emitArtifact(artifact)
        ctx.emitActivity({
          ...initialActivity,
          label: `已生成产物：${title}`,
          status: 'completed',
          durationMs: Math.round(performance.now() - startedAt),
        })
        return JSON.stringify({ ok: true, artifactId: artifact.id, title })
      }

      case 'skill': {
        const skillName = String(args.name ?? '').trim()
        const matched = ctx.skills.find(s => s.name === skillName && s.enabled)
        if (!matched) throw new Error(`未找到已启用的技能：${skillName}`)
        ctx.emitActivity({
          ...initialActivity,
          label: `已加载技能：${matched.name}`,
          status: 'completed',
          output: matched.content.slice(0, 800),
          durationMs: Math.round(performance.now() - startedAt),
        })
        return JSON.stringify({
          ok: true,
          name: matched.name,
          description: matched.description,
          sourceUrl: matched.sourceUrl,
          instructions: matched.content,
        })
      }

      default:
        throw new Error(`未知工具：${call.name}`)
    }
  } catch (error) {
    if (ctx.signal.aborted) throw error
    const msg = error instanceof Error ? error.message : String(error)
    ctx.emitActivity({
      ...initialActivity,
      label: `${label} 失败：${msg.slice(0, 36)}`,
      status: 'failed',
      output: msg,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return JSON.stringify({ ok: false, error: msg })
  }
}

function describeToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'web_search':
    case 'search_web': {
      const qs = extractQueries(args)
      return qs.length > 1
        ? `并发搜索「${qs[0].slice(0, 16)}」等 ${qs.length} 项`
        : `正在搜索「${(qs[0] ?? '').slice(0, 22)}」`
    }
    case 'web_fetch':
    case 'fetch_web':
      return `正在读取网页 ${String(args.url ?? '').slice(0, 28)}`
    case 'read':
      return `读取文件 ${path.basename(String(args.file_path ?? ''))}`
    case 'write':
      return `写入文件 ${path.basename(String(args.file_path ?? ''))}`
    case 'edit':
      return `编辑文件 ${path.basename(String(args.file_path ?? ''))}`
    case 'glob':
      return `查找文件 ${String(args.pattern ?? '*')}`
    case 'grep':
      return `搜索代码 "${String(args.pattern ?? '').slice(0, 20)}"`
    case 'bash':
      return String(args.description ?? `执行命令 ${String(args.command ?? '').slice(0, 24)}`)
    case 'todo_write':
      return '更新任务规划清单'
    case 'ask_user_question':
      return '向你发起提问'
    case 'subagent':
      return `委派子智能体：${String(args.description ?? '')}`
    case 'create_artifact':
      return `创建预览产物：${String(args.title ?? '')}`
    case 'skill':
      return `加载技能：${String(args.name ?? '')}`
    default:
      return `调用工具 ${name}`
  }
}

function extractQueries(args: Record<string, unknown>): string[] {
  const list: string[] = []
  if (typeof args.query === 'string' && args.query.trim()) list.push(args.query.trim())
  if (Array.isArray(args.queries)) {
    for (const q of args.queries) {
      if (typeof q === 'string' && q.trim()) list.push(q.trim())
    }
  }
  return [...new Set(list)].slice(0, 4)
}

async function executeConcurrentWebSearch(
  profile: Profile,
  apiKey: string,
  queries: string[],
  signal: AbortSignal,
): Promise<{ output: string; citations: ChatCitation[]; summaryLabel: string }> {
  const cleanQueries = queries.filter(Boolean).slice(0, 4)
  if (cleanQueries.length === 0) {
    return {
      output: JSON.stringify({ ok: false, error: 'empty_query' }),
      citations: [],
      summaryLabel: '搜索词为空',
    }
  }

  const host = profile.baseUrl.toLowerCase()
  const isOfficialDeepSeek = host.includes('api.deepseek.com') && Boolean(apiKey)

  const perQuery = await Promise.all(
    cleanQueries.map(async q => {
      if (isOfficialDeepSeek) {
        const ds = await tryDeepSeekNativeSearch(profile, apiKey, q, signal)
        if (ds.length > 0) return { q, items: ds }
      }
      const rss = await fetchBingRss(q, signal)
      return { q, items: rss }
    }),
  )

  const citationsMap = new Map<string, ChatCitation>()
  const notes: string[] = []

  for (const { q, items } of perQuery) {
    if (cleanQueries.length > 1) notes.push(`### 搜索词：${q}`)
    items.forEach((item, idx) => {
      if (item.url && !citationsMap.has(item.url)) {
        citationsMap.set(item.url, {
          title: item.title || item.url,
          url: item.url,
          siteName: item.siteName,
          publishedDate: item.publishedDate,
        })
      }
      notes.push(
        `[${idx + 1}] ${item.title}${item.siteName ? ` (${item.siteName})` : ''}${item.publishedDate ? ` · ${item.publishedDate}` : ''}\nURL: ${item.url}\n摘要: ${item.snippet}\n`,
      )
    })
  }

  const citations = [...citationsMap.values()]
  const qPreview = cleanQueries.length === 1 ? cleanQueries[0].slice(0, 20) : `${cleanQueries[0].slice(0, 14)} 等 ${cleanQueries.length} 项`
  const summaryLabel = citations.length > 0
    ? `已搜索「${qPreview}」· ${citations.length} 个来源`
    : `已搜索「${qPreview}」`

  return {
    output: JSON.stringify({
      ok: true,
      queries: cleanQueries,
      research: notes.join('\n'),
      sources: citations,
    }),
    citations,
    summaryLabel,
  }
}

interface RawSearchItem {
  title: string
  url: string
  snippet: string
  siteName?: string
  publishedDate?: string
}

async function tryDeepSeekNativeSearch(
  profile: Profile,
  apiKey: string,
  query: string,
  signal: AbortSignal,
): Promise<RawSearchItem[]> {
  try {
    const base = profile.baseUrl.trim().replace(/\/+$/, '').replace(/\/(v1|beta|anthropic)$/i, '')
    const res = await fetch(`${base}/v1/tools/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: query.slice(0, 128), count: 8, need_content: false }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(4500)]),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { results?: Array<Record<string, unknown>> }
    if (!Array.isArray(data.results)) return []
    return data.results
      .map(r => ({
        title: String(r.title ?? r.url ?? '').trim(),
        url: String(r.url ?? '').trim(),
        snippet: String(r.summary ?? r.snippet ?? '').trim().slice(0, 600),
        siteName: r.site_name ? String(r.site_name) : undefined,
        publishedDate: r.date ? String(r.date).slice(0, 10) : undefined,
      }))
      .filter(r => r.url.startsWith('http'))
  } catch {
    return []
  }
}

async function fetchBingRss(query: string, signal: AbortSignal): Promise<RawSearchItem[]> {
  for (const host of ['https://cn.bing.com', 'https://www.bing.com']) {
    try {
      const url = `${host}/search?q=${encodeURIComponent(query)}&format=rss&count=10`
      const res = await fetch(url, {
        headers: {
          'User-Agent': DESKTOP_UA,
          Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.any([signal, AbortSignal.timeout(4500)]),
      })
      if (!res.ok) continue
      const xml = await res.text()
      const items = parseBingRssXml(xml)
      if (items.length > 0) return items
    } catch {
      // try next host
    }
  }
  return []
}

function parseBingRssXml(xml: string): RawSearchItem[] {
  if (!xml.includes('<item>')) return []
  const items: RawSearchItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const rawUrl = decodeXml(/<link>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? '').trim()
    if (!rawUrl.startsWith('http')) continue
    const title = cleanHtml(/<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? '') || rawUrl
    const snippet = cleanHtml(/<description>([\s\S]*?)<\/description>/.exec(block)?.[1] ?? '')
    const pubDate = cleanHtml(/<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1] ?? '')
    let siteName = ''
    try {
      siteName = new URL(rawUrl).hostname.replace(/^www\./, '')
    } catch {
      // ignore
    }
    items.push({
      title,
      url: rawUrl,
      snippet: snippet.slice(0, 450),
      siteName,
      publishedDate: pubDate,
    })
    if (items.length >= 8) break
  }
  return items
}

async function fetchWebPageContent(
  profile: Profile,
  apiKey: string,
  url: string,
  signal: AbortSignal,
): Promise<{ title: string; content: string }> {
  const host = profile.baseUrl.toLowerCase()
  if (host.includes('api.deepseek.com') && apiKey) {
    try {
      const base = profile.baseUrl.trim().replace(/\/+$/, '').replace(/\/(v1|beta|anthropic)$/i, '')
      const res = await fetch(`${base}/v1/tools/fetch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      })
      if (res.ok) {
        const data = (await res.json()) as { title?: string; content?: string }
        if (data.content) return { title: data.title ?? url, content: data.content }
      }
    } catch {
      // fall through to direct fetch
    }
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': DESKTOP_UA,
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = (await res.text()).slice(0, 260_000)
  const title = cleanHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '') || url
  const content = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|footer|header|aside|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|br|article|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map(line => decodeXml(line).replace(/\s+/g, ' ').trim())
    .filter(line => line.length >= 10)
    .join('\n')
    .slice(0, 12_000)
  return { title, content }
}

function cleanHtml(raw: string): string {
  return decodeXml(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeXml(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function walkFiles(rootDir: string, pattern: string, maxResults: number): string[] {
  const results: string[] = []
  const matcher = new Minimatch(pattern.replace(/^\.\//, '') || '**/*', {
    matchBase: true,
    dot: true,
    nocomment: true,
    nonegate: true,
  })
  const skipDirs = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release', 'build', '.next', '.gradle'])

  function visit(dir: string, depth: number) {
    if (depth > 6 || results.length >= maxResults) return
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (results.length >= maxResults) break
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) visit(full, depth + 1)
      } else if (entry.isFile()) {
        const rel = path.relative(rootDir, full)
        if (matcher.match(rel)) {
          results.push(rel)
        }
      }
    }
  }

  visit(rootDir, 0)
  return results
}

function grepFiles(rootDir: string, pattern: string, include: string | undefined, maxMatches: number): string[] {
  const matches: string[] = []
  let regex: RegExp
  try {
    regex = new RegExp(pattern, 'i')
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  }
  const isFile = fs.statSync(rootDir).isFile()
  const baseDir = isFile ? path.dirname(rootDir) : rootDir
  const files = isFile
    ? [path.basename(rootDir)].filter(file => !include || new Minimatch(include, { matchBase: true, dot: true }).match(file))
    : walkFiles(rootDir, include || '**/*', 300)

  for (const rel of files) {
    if (matches.length >= maxMatches) break
    const full = path.join(baseDir, rel)
    try {
      const stat = fs.statSync(full)
      if (stat.size > 512_000) continue
      const text = fs.readFileSync(full, 'utf8')
      if (text.includes('\u0000')) continue
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push(`${rel}:${i + 1}: ${lines[i].slice(0, 180)}`)
          if (matches.length >= maxMatches) break
        }
      }
    } catch {
      // skip unreadable files
    }
  }
  return matches
}

function runBashCommand(
  command: string,
  workdir: string,
  signal: AbortSignal,
): Promise<{ output: string; exitCode: number }> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cleanEnv: NodeJS.ProcessEnv = { ...process.env, TERM: 'dumb' }
    delete cleanEnv.ELECTRON_RUN_AS_NODE
    const child = spawn('/bin/bash', ['-c', command], {
      cwd: workdir,
      env: cleanEnv,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let outputBytes = 0
    let failure = ''
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const killGroup = (killSignal: NodeJS.Signals) => {
      if (!child.pid) return
      try { process.kill(-child.pid, killSignal) } catch { /* process group already exited */ }
    }
    const terminate = () => {
      if (killTimer) return
      killGroup('SIGTERM')
      killTimer = setTimeout(() => killGroup('SIGKILL'), 250)
    }
    const onAbort = () => terminate()
    const timeout = setTimeout(() => { failure = '命令执行超过 30 秒'; terminate() }, 30_000)
    const collect = (data: string) => {
      outputBytes += Buffer.byteLength(data, 'utf8')
      output = (output + data).slice(-8000)
      if (outputBytes > 2 * 1024 * 1024) { failure = '命令输出超过 2 MB'; terminate() }
    }
    child.stdout.setEncoding('utf8').on('data', collect)
    child.stderr.setEncoding('utf8').on('data', collect)
    const cleanup = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      if (killTimer) {
        // A shell can exit before its descendants. Finish the process group too.
        clearTimeout(killTimer)
        killGroup('SIGKILL')
      }
    }
    child.once('error', error => { cleanup(); reject(error) })
    child.once('close', code => {
      cleanup()
      if (signal.aborted) { reject(signal.reason); return }
      resolve({ output: [output.trim(), failure].filter(Boolean).join('\n') || '(no output)', exitCode: failure ? 1 : code ?? 1 })
    })
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
}
