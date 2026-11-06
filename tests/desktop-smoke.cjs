const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-desktop-smoke-'));
const requests = [];
let app, ws, requestId = 0, logs = '', askSent = false;
const pending = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = http.createServer(async (req, res) => {
  let data = ''; for await (const chunk of req) data += chunk;
  const body = data ? JSON.parse(data) : {};
  requests.push({ url: req.url, body });
  if (req.url.endsWith('/images')) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a52kAAAAASUVORK5CYII=' }] })); return;
  }
  res.setHeader('content-type', 'text/event-stream');
  const send = payload => res.write('data: ' + (typeof payload === 'string' ? payload : JSON.stringify(payload)) + '\n\n');
  if (!askSent) {
    askSent = true;
    send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'questions', function: { name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ id: 'q1', question: '优先验证哪一项？', options: [{ label: '单元测试' }, { label: '类型检查' }] }, { id: 'q2', question: '接下来执行什么？', options: [{ label: '生产构建' }, { label: '界面检查' }] }] }) } }] }, finish_reason: 'tool_calls' }] });
  } else {
    send({ choices: [{ delta: { content: '验证完成：两个答案已合并，服务与用量正确。' }, finish_reason: null }] });
    send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
    send({ choices: [], usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 } });
  }
  send('[DONE]'); res.end();
});
function rpc(method, params = {}) {
  const id = ++requestId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const result = await rpc('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression) {
  for (let i = 0; i < 400; i++) { if (await evaluate(expression)) return; await delay(50); }
  throw new Error('UI timeout: ' + expression);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const apiPort = server.address().port;
  const debugProbe = net.createServer();
  await new Promise(resolve => debugProbe.listen(0, '127.0.0.1', resolve));
  const debugPort = debugProbe.address().port;
  await new Promise(resolve => debugProbe.close(resolve));
  const userData = path.join(tmp, 'profile'); const dataDir = path.join(userData, 'aster'); fs.mkdirSync(dataDir, { recursive: true });
  const profiles = ['a', 'b'].map(id => ({ id, name: '测试服务 ' + id.toUpperCase(), baseUrl: `http://127.0.0.1:${apiPort}/${id}`, apiFormat: 'openai', chatPath: '/chat', imagePath: '/images', chatModel: 'mock-chat', models: [{ id: 'mock-chat' }, { id: 'test-image' }], reasoningEffort: 'default', contextLimit: 128000, extraHeaders: '' }));
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ version: 1, activeProfileId: 'b', profiles, settings: { theme: 'light', systemPrompt: 'test', permissionMode: 'plan-only', webSearchEnabled: false, harnessToolsEnabled: true, promptInjectionEnabled: false } }));
  const message = (id, role, content) => ({ id, role, content, reasoning: '', createdAt: Date.now(), model: 'mock-chat', profileId: 'a', status: 'complete', attachments: [] });
  fs.writeFileSync(path.join(dataDir, 'conversations.json'), JSON.stringify([{ id: 'smoke', title: '桌面回归验证', createdAt: Date.now(), updatedAt: Date.now(), profileId: 'a', model: 'mock-chat', messages: [message('u', 'user', '准备验证'), message('a', 'assistant', '准备完成')] }]));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  app = spawn(path.join(root, 'release/mac-arm64/Aster.app/Contents/MacOS/Aster'), ['--user-data-dir=' + userData, '--remote-debugging-port=' + debugPort], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout.on('data', d => { logs += d }); app.stderr.on('data', d => { logs += d });
  let target;
  for (let i = 0; i < 150; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page'); if (target) break; } catch {}
    await delay(100);
  }
  if (!target) throw new Error('Electron startup failed: ' + logs.slice(-2500));
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); const waiter = pending.get(message.id); if (waiter) { pending.delete(message.id); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); } });
  await waitFor('Boolean(window.aster && document.querySelector("textarea"))');
  const actualDir = await evaluate('window.aster.app.info().then(info => info.dataDir)'); assert.equal(fs.realpathSync(actualDir), fs.realpathSync(dataDir));
  await evaluate('(() => { const el = document.querySelector("textarea"); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(el,"多问题验证"); el.dispatchEvent(new Event("input",{bubbles:true})); })()');
  await delay(80);
  await evaluate('document.querySelector("button[title=发送]").click()');
  await waitFor('document.body.innerText.includes("优先验证哪一项？")');
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "单元测试").click()');
  await waitFor('document.body.innerText.includes("已回答：单元测试") && document.body.innerText.includes("接下来执行什么？")');
  const screenshot = await rpc('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(tmp, 'multiple-questions.png'), Buffer.from(screenshot.data, 'base64'));
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "生产构建").click()');
  await waitFor('document.body.innerText.includes("验证完成：两个答案已合并") && !document.querySelector("button[title=停止生成]")');
  const toolResult = requests[1].body.messages.find(m => m.role === 'tool');
  assert.deepEqual(JSON.parse(toolResult.content).answers, [{id:'q1',selected:['单元测试']},{id:'q2',selected:['生产构建']}]);
  assert.ok(requests.every(r => r.url.startsWith('/a/')));
  await evaluate('window.aster.images.generate({profileId:"a",prompt:"测试图片",model:"test-image",size:"1024x1024"})');
  assert.equal(requests.at(-1).url, '/a/images');
  let saved;
  for (let i = 0; i < 100; i++) { saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'conversations.json'), 'utf8')); if (saved[0].messages.at(-1).usage?.totalTokens === 42) break; await delay(30); }
  assert.equal(saved[0].messages.at(-1).usage.totalTokens, 42);
  const finalShot = await rpc('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(tmp, 'completed.png'), Buffer.from(finalShot.data, 'base64'));
  console.log(JSON.stringify({ result: 'passed', tmp, checks: ['packaged app launch', 'multi-question UI keeps partial answer', 'combined answers resume generation', 'conversation service routing', 'image IPC service routing', 'tail usage persisted: 42 tokens'], screenshot: path.join(tmp, 'multiple-questions.png') }, null, 2));
})().catch(async error => { console.error('TEMP',tmp); console.error(error); console.error(logs.slice(-3000)); try { console.error('DOM',await evaluate('document.body.innerText')); console.error('REQUESTS',JSON.stringify(requests).slice(-6000)) } catch {} process.exitCode = 1; }).finally(async () => { ws?.close(); app?.kill('SIGTERM'); server.close(); });
