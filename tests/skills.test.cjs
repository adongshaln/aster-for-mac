require('./register.cjs')
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { installSkillFromUrl } = require('../electron/skills.ts')
const { buildLineDiff } = require('../src/lib/diff.ts')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-skills-test-'))
const originalFetch = global.fetch
after(() => { global.fetch = originalFetch; fs.rmSync(root, { recursive: true, force: true }) })
test('GitHub tree skills install scripts and assets without a duplicate main segment', async () => {
  const urls = []
  global.fetch = async url => {
    urls.push(url)
    if (url.includes('/contents/skills/demo/scripts?ref=main')) return Response.json([{ type: 'file', name: 'run.py', path: 'skills/demo/scripts/run.py', download_url: 'https://raw.githubusercontent.com/test/repo/main/skills/demo/scripts/run.py' }])
    if (url.includes('/contents/skills/demo?ref=main')) return Response.json([{ type: 'file', name: 'SKILL.md', path: 'skills/demo/SKILL.md', download_url: 'https://raw.githubusercontent.com/test/repo/main/skills/demo/SKILL.md' }, { type: 'dir', name: 'scripts', path: 'skills/demo/scripts' }])
    return new Response(url.endsWith('run.py') ? 'print("resource loaded")' : '---\nname: demo\ndescription: Test resources\n---\nUse scripts/run.py.\n' + 'full instructions\n'.repeat(2400))
  }
  const skill = await installSkillFromUrl('https://github.com/test/repo/tree/main/skills/demo', root)
  assert.ok(skill.content.length > 32000)
  assert.match(fs.readFileSync(path.join(skill.localPath, 'scripts/run.py'), 'utf8'), /resource loaded/)
  assert.ok(urls.every(url => !url.includes('/main/main/')))
})
test('an incomplete skill installation removes its partial directory', async () => {
  const before = fs.readdirSync(root)
  global.fetch = async () => new Response('x'.repeat(4 * 1024 * 1024 + 1))
  await assert.rejects(installSkillFromUrl('https://example.com/SKILL.md', root), /超过/)
  assert.deepEqual(fs.readdirSync(root), before)
})
test('line diff aligns context after a leading insertion', () => {
  const rows = buildLineDiff('alpha\nbeta\ngamma\n', 'new\nalpha\nbeta\ngamma\n')
  assert.equal(rows.filter(row => row.type === 'del').length, 0)
  assert.equal(rows.filter(row => row.type === 'add').length, 1)
  assert.deepEqual(rows.at(-1), { type: 'context', oldNum: 3, newNum: 4, text: 'gamma' })
})
