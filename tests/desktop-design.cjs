const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-visual-audit-'));
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
  for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await delay(50); }
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
  const profiles = ['a', 'b'].map(id => ({ id, name: '测试服务 ' + id.toUpperCase(), baseUrl: `http://127.0.0.1:${apiPort}/${id}`, apiFormat: 'openai', chatPath: '/chat', imagePath: '/images', chatModel: 'deepseek-chat', models: [{ id: 'deepseek-chat' }, { id: 'test-image' }], reasoningEffort: 'default', contextLimit: 128000, extraHeaders: '' }));
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ version: 1, activeProfileId: 'b', profiles, settings: { theme: 'light', systemPrompt: 'test', permissionMode: 'plan-only', webSearchEnabled: false, harnessToolsEnabled: true, promptInjectionEnabled: false } }));
  const message = (id, role, content) => ({ id, role, content, reasoning: '', createdAt: Date.now(), model: 'deepseek-chat', profileId: 'a', status: 'complete', attachments: [] });
  fs.writeFileSync(path.join(dataDir, 'conversations.json'), JSON.stringify([{ id: 'smoke', title: '桌面回归验证', createdAt: Date.now(), updatedAt: Date.now(), profileId: 'a', model: 'deepseek-chat', messages: [message('u', 'user', '准备验证'), { ...message('a', 'assistant', '这是一段用于检查 Aster 阅读体验的正文。温暖的纸张底色、清晰的文字层级和安静的操作区，应让用户专注于内容。\n\n## 审查示例\n\n- 验证任务执行结果\n- 检查界面设计一致性'), artifacts: [{ id: 'diagram', title: '任务流程图', kind: 'mermaid', content: 'graph TD; A[分析]-->B[执行]; B-->C[验证]' }, { id: 'html', title: '交互预览', kind: 'html', content: '<h1>Preview</h1>' }] }] }]));
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

  const metrics = async () => evaluate(`(() => {
    const p = document.querySelector('.markdown-body');
    const style = p ? getComputedStyle(p) : null;
    const pane = document.querySelector('aside');
    const send = document.querySelector('button[title="发送"]');
    const textarea = document.querySelector('textarea');
    const rect = el => {const r=el?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null};
    return {width:innerWidth,height:innerHeight,bodyFont:style?.fontFamily,bodySize:style?.fontSize,background:getComputedStyle(document.querySelector('.app-vibrancy')).backgroundColor,send:rect(send),textarea:rect(textarea),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,offscreenButtons:[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.x<0)}).map(b=>({text:b.textContent.trim().slice(0,35),title:b.title,rect:rect(b)})).slice(0,12)};
  })()`);
  const observations = {};
  async function capture(name) {await delay(120);const shot=await rpc('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(tmp,name+'.png'),Buffer.from(shot.data,'base64'));observations[name]=await metrics();}
  await capture('light-chat-1280');
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("任务流程图")).click()');
  await waitFor('!!document.querySelector(".mermaid-preview svg")');
  await capture('light-artifact-1280');
  observations['mermaid-rendering']=await evaluate('({iframes:document.querySelectorAll("iframe").length,codeShown:!!document.querySelector("aside pre")||document.body.innerText.includes("graph TD;")})');
  await rpc('Emulation.setDeviceMetricsOverride',{width:940,height:620,deviceScaleFactor:1,mobile:false});
  await capture('light-artifact-940');
  assert.deepEqual(observations['light-artifact-940'].offscreenButtons, []);
  const paneBounds = await evaluate('(() => {const r=document.querySelector(".artifact-pane").getBoundingClientRect();return {right:r.right,bottom:r.bottom}})()');
  assert.ok(paneBounds.right <= 940 && paneBounds.bottom <= 620);
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.title==="关闭预览栏").click()');
  await capture('light-chat-940');
  await evaluate('window.aster.config.load().then(c=>window.aster.config.save({...c,settings:{...c.settings,theme:"dark"}}))');
  await rpc('Page.reload');
  await waitFor('Boolean(window.aster && document.querySelector("textarea") && document.documentElement.classList.contains("dark"))');
  await capture('dark-chat-940');
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.title.startsWith("设置（")).click()');
  await waitFor('document.body.innerText.includes("自定义系统提示词")');
  await capture('dark-settings-940');
  for(let i=0;i<24;i++){ await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9}); assert.ok(await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)')); }
  assert.ok(await evaluate('document.getElementById("root").inert'));
  observations['modal-accessibility']=await evaluate('({dialogs:document.querySelectorAll("[role=dialog]").length,ariaModal:document.querySelectorAll("[aria-modal=true]").length,focusTag:document.activeElement.tagName})');
  await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor('!document.querySelector("[role=dialog]") && !document.getElementById("root").inert');
  fs.writeFileSync(path.join(tmp,'observations.json'),JSON.stringify(observations,null,2));
  console.log(JSON.stringify({tmp,observations},null,2));

})().catch(error => { console.error(error); console.error(logs.slice(-1800)); process.exitCode = 1; }).finally(async () => { ws?.close(); app?.kill('SIGTERM'); server.close(); });
