/* 心力球 · 同步后台（参考 multica daemon + Eta Agent Runtime 的工具执行回传模式）
 * 启动: node server.js  →  手机 http://<本机IP>:8000
 *
 * 链路: cli.js(电脑agent) --注册/心跳--> 本后台 --SSE--> 手机 Web(RN)
 *       手机 Web --POST 指令--> 本后台 --随心跳下发--> cli.js --执行+产出文件回传--> 全端广播
 *       手机/CLI --POST 真实文件--> /api/files ；GET /api/files/:id 双向取回
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 8000;
const HB_TIMEOUT = 15000;

/* ---------- 状态 ---------- */
const devices = new Map();
const sseClients = new Set();
const filesDir = path.join(__dirname, 'files');
fs.mkdirSync(filesDir, { recursive: true });

/* ---------- 工具 ---------- */
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise(resolve => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      try { resolve(b ? JSON.parse(b) : {}); } catch (_) { resolve({}); }
    });
  });
}
function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const c of sseClients) { try { c.write(`data: ${s}\n\n`); } catch (_) {} }
}
function publicDevice(d) {
  return { id: d.id, type: d.type, name: d.name, online: d.online, status: d.status, meta: d.meta, lastSeen: d.lastSeen };
}
const FILE_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic',
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword', '.rtf': 'text/rtf', '.html': 'text/html',
  '.webm': 'audio/webm', '.mp4': 'audio/mp4', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.txt': 'text/plain', '.md': 'text/markdown; charset=utf-8',
};

/* ---------- 路由 ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  /* CORS 预检（Metro 开发模式 :8081 跨域用） */
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  /* SSE */
  if (req.method === 'GET' && p === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write('retry: 2000\n\n');
    sseClients.add(res);
    res.write(`data: ${JSON.stringify({ type: 'hello', devices: [...devices.values()].map(publicDevice) })}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  /* ---- 设备 API ---- */
  if (req.method === 'POST' && p === '/api/devices/register') {
    const b = await readBody(req);
    if (b.id && devices.has(b.id) && devices.get(b.id).token === b.token) {
      const d = devices.get(b.id);
      d.lastSeen = Date.now(); d.online = true;
      if (b.name) d.name = b.name;
      broadcast({ type: 'device', device: publicDevice(d) });
      return json(res, 200, { ok: true, id: d.id, token: d.token });
    }
    const id = (b.type === 'ball' ? 'ball-' : 'pc-') + crypto.randomBytes(3).toString('hex');
    const token = crypto.randomBytes(8).toString('hex');
    devices.set(id, { id, type: b.type || 'computer', name: b.name || '未命名设备', token, status: 'idle', meta: b.meta || {}, lastSeen: Date.now(), online: true, pending: [] });
    broadcast({ type: 'device', device: publicDevice(devices.get(id)) });
    console.log(`[+] 设备注册 ${id} (${b.type}) ${b.name}`);
    return json(res, 200, { ok: true, id, token });
  }

  let m = p.match(/^\/api\/devices\/([\w-]+)\/heartbeat$/);
  if (req.method === 'POST' && m) {
    const d = devices.get(m[1]);
    if (!d) return json(res, 404, { ok: false, error: 'unknown device' });
    const b = await readBody(req);
    if (b.token !== d.token) return json(res, 403, { ok: false, error: 'bad token' });
    d.lastSeen = Date.now();
    if (!d.online) { d.online = true; broadcast({ type: 'device', device: publicDevice(d) }); }
    if (b.status) d.status = b.status;
    if (b.meta) d.meta = Object.assign(d.meta, b.meta);
    const commands = d.pending.splice(0);
    broadcast({ type: 'device', device: publicDevice(d) });
    return json(res, 200, { ok: true, commands });
  }

  m = p.match(/^\/api\/devices\/([\w-]+)\/commands\/([\w-]+)\/result$/);
  if (req.method === 'POST' && m) {
    const d = devices.get(m[1]);
    if (!d) return json(res, 404, { ok: false });
    const b = await readBody(req);
    if (b.token !== d.token) return json(res, 403, { ok: false });
    broadcast({ type: 'command_result', cmdId: m[2], deviceId: d.id, deviceName: d.name, cmd: b.cmd, ok: b.ok !== false, detail: b.detail || '', artifact: b.artifact || null, artifacts: b.artifacts || (b.artifact ? [b.artifact] : []) });
    console.log(`[✓] ${d.name} 完成 ${b.cmd}${b.artifacts && b.artifacts.length ? ' → 产出 ' + b.artifacts.length + ' 个文件' : (b.artifact ? ' → 产出 ' + b.artifact.name : '')}`);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && p === '/api/devices') {
    return json(res, 200, { devices: [...devices.values()].map(publicDevice) });
  }

  m = p.match(/^\/api\/devices\/([\w-]+)\/commands$/);
  if (req.method === 'POST' && m) {
    const d = devices.get(m[1]);
    if (!d) return json(res, 404, { ok: false, error: 'unknown device' });
    const b = await readBody(req);
    const cmdId = 'c' + crypto.randomBytes(3).toString('hex');
    d.pending.push({ id: cmdId, cmd: b.cmd, payload: b.payload || {} });
    broadcast({ type: 'command', cmdId, deviceId: d.id, deviceName: d.name, cmd: b.cmd });
    console.log(`[→] ${d.name} 收到指令 ${b.cmd}`);
    return json(res, 200, { ok: true, cmdId });
  }

  /* ---- 文件传输（手机 ⇄ 后台 ⇄ 电脑，真实文件）---- */
  if (req.method === 'POST' && p === '/api/files') {
    const q = url.searchParams;
    const id = 'f' + crypto.randomBytes(4).toString('hex');
    const name = String(q.get('name') || 'file').replace(/[/\\]/g, '_').slice(0, 100);
    const kind = String(q.get('kind') || 'file');
    const ws = fs.createWriteStream(path.join(filesDir, `${id}__${name}`));
    req.pipe(ws);
    ws.on('finish', () => {
      console.log(`[📎] 收到文件 ${name} (${(ws.bytesWritten / 1024).toFixed(0)}KB)`);
      json(res, 200, { ok: true, id, name, kind, size: ws.bytesWritten, url: `/api/files/${id}` });
    });
    ws.on('error', () => json(res, 500, { ok: false }));
    return;
  }

  m = p.match(/^\/api\/files\/([\w-]+)$/);
  if (req.method === 'GET' && m) {
    const entry = fs.readdirSync(filesDir).find(f => f.startsWith(m[1] + '__'));
    if (!entry) { res.writeHead(404); return res.end('not found'); }
    const mime = FILE_MIME[path.extname(entry).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*', 'Content-Disposition': `inline; filename="${encodeURIComponent(entry.split('__').slice(1).join('__') || 'file')}"` });
    fs.createReadStream(path.join(filesDir, entry)).pipe(res);
    return;
  }

  /* ---- 静态文件：优先 RN Web 构建产物（xinli-app/dist），否则根目录 index.html ---- */
  let f = p === '/' ? '/index.html' : p;
  const candidates = [
    p === '/' ? path.join(__dirname, 'xinli-app', 'dist', 'index.html') : path.join(__dirname, 'xinli-app', 'dist', path.normalize(f).replace(/^(\.\.[\/\\])+/, '')),
    path.join(__dirname, path.normalize(f).replace(/^(\.\.[\/\\])+/, '')),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const data = fs.readFileSync(file);
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    return res.end(data);
  }
  res.writeHead(404);
  res.end('not found');
});

/* 离线扫描 */
setInterval(() => {
  const now = Date.now();
  for (const d of devices.values()) {
    if (d.online && now - d.lastSeen > HB_TIMEOUT) {
      d.online = false;
      if (d.type === 'ball') d.status = 'offline';
      broadcast({ type: 'device', device: publicDevice(d) });
      console.log(`[-] 设备离线 ${d.id} ${d.name}`);
    }
  }
}, 5000);

server.listen(PORT, () => {
  const nets = require('os').networkInterfaces();
  const ips = Object.values(nets).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log('\n心力球 · 同步后台已启动\n');
  ips.forEach(ip => console.log(`  手机 Web:  http://${ip}:${PORT}`));
  console.log('\n接入设备（另开终端）:');
  console.log('  心力球模拟:  node cli.js ball');
  console.log('  电脑 agent:  node cli.js start --name "我的电脑"\n');
});
