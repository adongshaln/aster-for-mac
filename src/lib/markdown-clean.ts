import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)/g
const ZERO_WIDTH = /[\u200b\ufeff\u2060]/g
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(ANSI, '')
    .replace(ZERO_WIDTH, '')
    .replace(CONTROL, '')
    .replace(/\u00a0/g, ' ')
}

function cleanInline(value: string): string {
  return cleanText(value).replace(/\s*\n\s*/g, ' ')
}

function prepareSource(markdown: string): string {
  let source = cleanText(markdown).replace(/^\uFEFF/, '')
  // YAML front matter is not part of the answer people want to read.
  source = source.replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*\n?/, '')
  // Keep explicit line breaks, drop every other raw tag here; the AST pass
  // removes inline HTML that survives Markdown parsing.
  source = source.replace(/<br\s*\/?>/gi, '\n')
  source = source.replace(/<!--[\s\S]*?-->/g, '')
  return source.trimEnd()
}

/**
 * A deterministic, offline Markdown cleanup for the image exporter.
 *
 * It intentionally does not use a model. The source is parsed as GFM, unsafe /
 * non-portable nodes are removed, and the result is serialized back to a small
 * predictable Markdown subset that the export template can lay out.
 */
export function cleanMarkdownForExport(markdown: string): string {
  if (!markdown.trim()) return ''
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(() => (tree: Root) => {
      visit(tree, (node, index, parent) => {
        if (!parent || index == null) return
        if (node.type === 'yaml' || node.type === 'definition') {
          parent.children.splice(index, 1)
          return index
        }
        if (node.type === 'html') {
          const value = cleanText(node.value)
          if (/^\s*<br\s*\/?>\s*$/i.test(value)) {
            parent.children[index] = { type: 'text', value: '\n' }
            return
          }
          parent.children.splice(index, 1)
          return index
        }
        if (node.type === 'image' || node.type === 'imageReference') {
          const alt = node.alt ? `：${cleanInline(node.alt)}` : ''
          parent.children[index] = { type: 'text', value: `［图片${alt}］` }
          return
        }
        if (node.type === 'linkReference') {
          const children = node.children?.length ? node.children : [{ type: 'text' as const, value: node.label ?? node.identifier }]
          parent.children.splice(index, 1, ...children)
          return index + children.length
        }
        if (node.type === 'text') {
          node.value = cleanText(node.value)
          if (!node.value.trim() && node.value.includes('\n')) node.value = '\n'
        } else if (node.type === 'inlineCode') {
          node.value = cleanInline(node.value)
        } else if (node.type === 'code') {
          node.value = cleanText(node.value).replace(/[ \t]+$/gm, '').trimEnd()
          if (!node.value) {
            parent.children.splice(index, 1)
            return index
          }
        } else if (node.type === 'link') {
          if (!node.url || !/^(https?:\/\/|mailto:|\/|#)/i.test(node.url)) {
            const children = node.children?.length ? node.children : [{ type: 'text' as const, value: node.url ?? '' }]
            parent.children.splice(index, 1, ...children)
            return index + children.length
          }
        } else if (node.type === 'heading') {
          node.depth = Math.min(4, Math.max(1, node.depth)) as 1 | 2 | 3 | 4
        } else if (node.type === 'paragraph') {
          if (!node.children.some(child => child.type === 'break' || (child.type === 'text' && child.value.trim()) || child.type !== 'text')) {
            parent.children.splice(index, 1)
            return index
          }
        }
        return
      })
    })
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      listItemIndent: 'one',
      rule: '-',
      ruleRepetition: 3,
      ruleSpaces: false,
      setext: false,
      strong: '*',
      emphasis: '*',
      tightDefinitions: true,
    })
  try {
    const output = String(processor.processSync(prepareSource(markdown)))
    return output.replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    // If a malformed document cannot be parsed, still produce readable plain text.
    return prepareSource(markdown).replace(/[#>*`~]/g, '').replace(/\n{3,}/g, '\n\n').trim()
  }
}

/** A light preview for the round picker; never renders Markdown. */
export function plainPreview(markdown: string, limit = 120): string {
  const text = cleanText(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '［图片$1］')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/**
 * User messages are usually plain prose, but people do type light Markdown.
 * Strip formatting markers without turning the question into a full document.
 */
export function cleanQuestionText(markdown: string): string {
  let value = prepareSource(markdown)
  value = value.replace(/```[^\n]*\n?/g, '')
  value = value.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt: string) => `［图片${alt ? `：${alt}` : ''}］`)
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  value = value.replace(/`([^`\n]+)`/g, '$1')
  value = value.replace(/\*\*([^*\n]+)\*\*/g, '$1')
  value = value.replace(/__([^_\n]+)__/g, '$1')
  value = value.replace(/~~([^~\n]+)~~/g, '$1')
  value = value.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
  value = value.replace(/^#{1,6}[ \t]+/gm, '')
  value = value.replace(/^>[ \t]?/gm, '')
  value = value.replace(/^([ \t]*)[-*+][ \t]+/gm, '$1• ')
  value = value.replace(/^[ \t]*([-*_])[ \t]*\1[ \t]*\1[ \t]*$/gm, '')
  value = value.replace(/<[^>]+>/g, '')
  return value.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}
