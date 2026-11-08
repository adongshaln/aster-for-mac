require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { cleanMarkdownForExport, cleanQuestionText } = require('../src/lib/markdown-clean.ts')
const {
  buildExportRounds,
  exportImageFilename,
  exportPixelRatio,
} = require('../src/lib/export-image.ts')

const message = (id, role, content, extra = {}) => ({
  id,
  role,
  content,
  reasoning: '',
  createdAt: Number(id.replace(/\D/g, '')) || 1,
  model: 'deepseek-chat',
  profileId: 'test',
  status: 'complete',
  attachments: [],
  ...extra,
})

test('export Markdown removes unsafe or non-portable nodes but keeps readable structure', () => {
  const output = cleanMarkdownForExport(`---
title: hidden
---
# 标题

**粗体** 与 *斜体*，[坏链接](javascript:alert(1))，[好链接](https://example.com)。

![图](https://example.com/a.png)

<script>alert(1)</script>

| A | B |
| --- | --- |
| 1 | 2 |

\`\`\`ts
const x = 1
\`\`\`

> 引用`)

  assert.doesNotMatch(output, /title: hidden/)
  assert.doesNotMatch(output, /<script|javascript:/i)
  assert.match(output, /［图片：图］/)
  assert.match(output, /\| A \| B \|/)
  assert.match(output, /```ts\nconst x = 1\n```/)
  assert.match(output, /\*\*粗体\*\*/)
  assert.match(output, /> 引用/)
})

test('question cleanup removes light Markdown markers while keeping line breaks', () => {
  const output = cleanQuestionText('重点看**同步**和`导出`，\n# 标题\n- 项目\n> 引用')
  assert.doesNotMatch(output, /\*\*|`|#|^\-/m)
  assert.match(output, /重点看同步和导出/)
  assert.match(output, /\n标题\n/)
  assert.match(output, /• 项目/)
})

test('export rounds group assistant messages under their user question', () => {
  const rounds = buildExportRounds([
    message('u1', 'user', '问题一'),
    message('a1', 'assistant', '回答一'),
    message('a2', 'assistant', '回答一续'),
    message('u2', 'user', '   '),
    message('a3', 'assistant', '   '),
  ])
  assert.equal(rounds.length, 1)
  assert.equal(rounds[0].id, 'u1')
  assert.equal(rounds[0].assistants.length, 2)
  assert.deepEqual(rounds[0].assistants.map(item => item.id), ['a1', 'a2'])
})

test('export image sizing stays inside the canvas limit', () => {
  assert.equal(exportPixelRatio(1000), 2)
  assert.equal(exportPixelRatio(20_000), 1.5)
  assert.equal(exportPixelRatio(30_000), 1)
  assert.equal(exportPixelRatio(0), 2)
})

test('export filename removes path separators and keeps a useful title', () => {
  const name = exportImageFilename('a/b:c*? "标题"', 2)
  assert.match(name, /^Aster-a-b-c/)
  assert.match(name, /2轮-\d{8}-\d{4}\.png$/)
  assert.doesNotMatch(name, /[/\\:*?"<>|]/)
})
