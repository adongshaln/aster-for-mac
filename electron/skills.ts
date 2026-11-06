import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { InstalledSkill } from '../shared/types'

const MAX_FILE = 4 * 1024 * 1024
const MAX_TOTAL = 32 * 1024 * 1024

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { 'User-Agent': 'Aster', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`拉取 Skill 失败（HTTP ${response.status}）`)
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body!) {
    size += chunk.byteLength
    if (size > MAX_FILE) throw new Error('Skill 单个文件超过 4 MB，安装已取消')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** Install the complete skill directory, including referenced scripts and assets. */
export async function installSkillFromUrl(rawUrl: string, skillsRoot: string): Promise<InstalledSkill> {
  const source = new URL(rawUrl.trim())
  if (!['http:', 'https:'].includes(source.protocol)) throw new Error('请输入有效的 HTTP/HTTPS Skill 地址')
  const parts = source.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  let github: { owner: string; repo: string; ref: string; directory: string } | undefined
  if (source.hostname === 'github.com') {
    const [owner, repo, kind, ref, ...rest] = parts
    if (!owner || !repo) throw new Error('GitHub 仓库地址不完整')
    const defaultRef = kind ? ref : JSON.parse((await download(`https://api.github.com/repos/${owner}/${repo}`)).toString()).default_branch as string
    if (kind && !['tree', 'blob'].includes(kind)) throw new Error('请使用仓库、tree 目录或 SKILL.md 的 blob 地址')
    const location = rest.join('/').replace(/\/?SKILL\.md$/i, '')
    github = { owner, repo, ref: defaultRef, directory: location }
  } else if (source.hostname === 'raw.githubusercontent.com') {
    const [owner, repo, ref, ...rest] = parts
    if (!owner || !repo || !ref || rest.at(-1)?.toLowerCase() !== 'skill.md') throw new Error('请使用完整的 SKILL.md 原始文件地址')
    github = { owner, repo, ref, directory: rest.slice(0, -1).join('/') }
  }
  const id = `skill-${randomUUID()}`
  const localPath = path.join(skillsRoot, id)
  fs.mkdirSync(localPath, { recursive: true })
  let count = 0
  let total = 0
  const save = (relative: string, data: Buffer) => {
    const destination = path.resolve(localPath, relative)
    if (!destination.startsWith(`${path.resolve(localPath)}${path.sep}`)) throw new Error('Skill 包含无效文件路径')
    if (++count > 256 || (total += data.length) > MAX_TOTAL) throw new Error('Skill 超过 256 个文件或 32 MB，安装已取消')
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, data)
  }
  try {
    if (github) {
      const { owner, repo, ref, directory } = github
      const visit = async (remote: string, relative: string, depth: number): Promise<void> => {
        if (depth > 12) throw new Error('Skill 目录层级超过 12 层，安装已取消')
        const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${remote.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`
        const entries = JSON.parse((await download(endpoint)).toString()) as Array<{ type: string; name: string; path: string; download_url: string | null }>
        if (!Array.isArray(entries)) throw new Error('该地址不是 Skill 目录')
        if (depth === 0 && !entries.some(entry => entry.name === 'SKILL.md' && entry.type === 'file')) throw new Error('该目录没有 SKILL.md，请使用具体技能目录的 GitHub 地址')
        for (const entry of entries) {
          if (!entry.name || /[/\\]/.test(entry.name) || ['.', '..', '.git'].includes(entry.name)) throw new Error('Skill 包含无效目录项')
          const target = path.join(relative, entry.name)
          if (entry.type === 'dir') await visit(entry.path, target, depth + 1)
          else if (entry.type === 'file' && entry.download_url) save(target, await download(entry.download_url))
          else throw new Error(`不支持的 Skill 文件：${entry.name}`)
        }
      }
      await visit(directory, '', 0)
    } else save('SKILL.md', await download(source.href))
    const content = fs.readFileSync(path.join(localPath, 'SKILL.md'), 'utf8')
    if (!content.trim()) throw new Error('Skill 内容为空')
    const name = /^name:\s*(.+)$/m.exec(content)?.[1] ?? /^#\s+(.+)$/m.exec(content)?.[1] ?? 'custom-skill'
    const description = /^description:\s*(.+)$/m.exec(content)?.[1] ?? '自定义扩展技能'
    return { id, name: name.trim().replace(/^['"]|['"]$/g, '').slice(0, 80), description: description.trim().replace(/^['"]|['"]$/g, '').slice(0, 512), content, localPath, sourceUrl: source.href, enabled: true, installedAt: Date.now() }
  } catch (error) {
    fs.rmSync(localPath, { recursive: true, force: true })
    throw error
  }
}
