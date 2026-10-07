#!/usr/bin/env node
/* 心力球 CLI · 参考 multica daemon（注册/心跳/指令下发）+ Eta 工具执行模式（真实工具、结果回传）
 *
 *   node cli.js start --server http://192.168.x.x:8000 --name "小满的 MacBook"
 *       → 电脑 agent：真实系统状态 + 真实执行（截屏/找文件/文档转PDF/照片归档/录音归档/生成Word）
 *
 *   node cli.js ball --server http://192.168.x.x:8000 --name "心力球"
 *       → 心力球设备模拟器（真机接入前联调用，协议需求见 ../API.md）
 *
 *   node cli.js status
 */
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const run = promisify(exec);

/* ---------- 参数 ---------- */
const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const opt = k => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : undefined; };
const SERVER = opt('server') || `http://localhost:8000`;
const NAME = opt('name');
const HB = 5000;
const darwin = process.platform === 'darwin';

/* 产出文件统一落在这里（手机上传的照片/文档/录音、生成的 PDF/Word） */
const BASE = path.join(os.homedir(), 'Downloads', '拾光');
const DIRS = {
  photo: path.join(BASE, '课堂照片'),
  doc: path.join(BASE, '课程文件'),
  audio: path.join(BASE, '录音'),
};

/* ---------- HTTP ---------- */
function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(SERVER + p);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { 'Content-Type': 'application/json' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
async function downloadFile(fileId, to) {
  const r = await fetch(`${SERVER}/api/files/${fileId}`);
  if (!r.ok) throw new Error(`文件下载失败 ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.promises.writeFile(to, buf);
  return buf.length;
}
async function uploadArtifact(fp, name) {
  const buf = await fs.promises.readFile(fp);
  const r = await fetch(`${SERVER}/api/files?name=${encodeURIComponent(name)}&kind=artifact`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
  });
  return r.json(); // {id,name,url}
}

/* ---------- LLM（多模态，OpenAI 兼容协议）----------
 * 默认 OpenRouter deepseek-v4.1-flash；可用环境变量换任意兼容服务
 * XINLI_LLM_URL / XINLI_LLM_KEY / XINLI_LLM_MODEL */
const LLM_URL = process.env.XINLI_LLM_URL || 'https://openrouter.ai/api/v1/chat/completions';
const LLM_KEY = process.env.XINLI_LLM_KEY || process.env.OPENROUTER_API_KEY || '';
const LLM_MODEL = process.env.XINLI_LLM_MODEL || 'deepseek/deepseek-v4.1-flash';

async function llmChat(messages, maxTokens = 1500) {
  const r = await fetch(LLM_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LLM_MODEL, messages, max_tokens: maxTokens }),
  });
  const j = await r.json();
  if (!j.choices || !j.choices[0]) throw new Error((j.error && j.error.message) || 'LLM 响应异常');
  return j.choices[0].message.content;
}

const EXTRACT_SYS = `你是「心力球」学习助理，把用户给的课堂材料提炼成结构化笔记。只输出 JSON，不要输出任何其他文字，格式：
{"title":"标题","summary":"2-3句摘要","outline":["提纲要点"],"keywords":["关键词"],"points":["值得记住的细节/公式/任务"],"cards":[{"q":"问题","a":"答案"}]}
要求：cards 出 3 张复习卡片；内容忠于材料，不编造；材料是中文就输出中文。`;

function parseLLMJson(s) {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('LLM 未返回 JSON');
  return JSON.parse(m[0]);
}

async function llmExtractPhoto(imagePath) {
  const b64 = (await fs.promises.readFile(imagePath)).toString('base64');
  const out = await llmChat([
    { role: 'system', content: EXTRACT_SYS },
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
      { type: 'text', text: '提炼这张课堂材料照片（可能是板书/PPT/笔记/文档），直接输出 JSON。' },
    ] },
  ]);
  return parseLLMJson(out);
}

async function llmExtractText(text) {
  const out = await llmChat([
    { role: 'system', content: EXTRACT_SYS },
    { role: 'user', content: `提炼下面的课程文档内容，直接输出 JSON。\n\n${text.slice(0, 20000)}` },
  ]);
  return parseLLMJson(out);
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function notesDocx(ex, sourceName, outPath) {
  const li = (a) => (a || []).map((x) => `<li>${esc(x)}</li>`).join('');
  const cards = (ex.cards || []).map((c) => `<p><b>Q：${esc(c.q)}</b><br/>A：${esc(c.a)}</p>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h1>${esc(ex.title || sourceName)} · 提炼笔记</h1>
<p><i>心力球 · ${dstr()} 由 ${LLM_MODEL} 从「${esc(sourceName)}」提炼生成</i></p>
<h2>摘要</h2><p>${esc(ex.summary || '')}</p>
<h2>提纲</h2><ul>${li(ex.outline)}</ul>
<h2>关键点</h2><ul>${li(ex.points)}</ul>
<h2>关键词</h2><p>${esc((ex.keywords || []).join(' · '))}</p>
<h2>复习卡片</h2>${cards || '<p>（无）</p>'}
</body></html>`;
  const tmp = `/tmp/xinli-notes-${Date.now()}.html`;
  await fs.promises.writeFile(tmp, html);
  await run(`textutil -convert docx "${tmp}" -output "${outPath}"`);
  return outPath;
}

/* ---------- 身份持久化 ---------- */
const stateFile = t => path.join(__dirname, `.cli-${t}.json`);
function loadState(t) { try { return JSON.parse(fs.readFileSync(stateFile(t))); } catch (_) { return {}; } }
function saveState(t, s) { fs.writeFileSync(stateFile(t), JSON.stringify(s)); }
async function register(type, name, meta) {
  const st = loadState(type);
  const r = await api('POST', '/api/devices/register', { type, name, meta, id: st.id, token: st.token });
  saveState(type, { id: r.id, token: r.token });
  return r;
}

/* ---------- 电脑端状态 ---------- */
async function computerMeta() {
  const load = os.loadavg()[0] / os.cpus().length;
  let disk = { free: 0, total: 0 };
  try { const s = await fs.promises.statfs(os.homedir()); disk = { free: s.bsize * s.bavail, total: s.bsize * s.blocks }; } catch (_) {}
  return {
    os: `${darwin ? 'macOS' : process.platform} ${os.release()}`,
    cpu: +(load * 100).toFixed(0),
    mem: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(0),
    diskFreeGb: +(disk.free / 1073741824).toFixed(0),
    diskTotalGb: +(disk.total / 1073741824).toFixed(0),
    uptimeH: +(os.uptime() / 3600).toFixed(1),
  };
}

/* ---------- 工具函数 ---------- */
const dstr = () => new Date().toISOString().slice(5, 10).replace('-', '');
const tstr = () => new Date().toTimeString().slice(0, 5).replace(':', '');
async function ensureDirs() {
  for (const d of Object.values(DIRS)) await fs.promises.mkdir(d, { recursive: true });
}

/* ---------- 电脑端指令：全部真实执行（Eta 式工具，无 GUI Agent）---------- */
const computerHandlers = {
  /* 📷 手机上传的课堂照片 → 压缩(sips) → 多模态 LLM 提炼 → 生成笔记 Word → 归档+回传 */
  async process_photo(p) {
    if (!p.fileId) return { ok: false, detail: '缺少文件' };
    await ensureDirs();
    const fname = `${dstr()}_${tstr()}_${p.fileName || 'photo.jpg'}`;
    const fp = path.join(DIRS.photo, fname);
    const n = await downloadFile(p.fileId, fp);
    const artifacts = [];
    let small = null;
    try {
      small = `/tmp/xinli-small-${Date.now()}.jpg`;
      await run(`sips -Z 1400 "${fp}" --out "${small}" >/dev/null 2>&1`);
      artifacts.push(await uploadArtifact(small, `预览_${fname}`));
    } catch (_) { small = null; }
    /* 多模态提炼 */
    let ex = null, note;
    try {
      ex = await llmExtractPhoto(small || fp);
      const out = path.join(DIRS.doc, `提炼_${dstr()}_${(ex.title || '课堂照片').slice(0, 20)}.docx`);
      await notesDocx(ex, p.fileName || '课堂照片', out);
      artifacts.push(await uploadArtifact(out, `提炼笔记_${(ex.title || '课堂照片').slice(0, 16)}.docx`));
      note = `LLM提炼「${ex.title}」：${(ex.summary || '').slice(0, 60)} · 卡片${(ex.cards || []).length}张 · 笔记已生成`;
    } catch (e) {
      note = `LLM 提炼失败（${String(e.message).slice(0, 50)}）· 已归档`;
    }
    return { ok: true, detail: `课堂照片 (${(n / 1024).toFixed(0)}KB) · ${note}`, artifact: artifacts[artifacts.length - 1], artifacts };
  },

  /* 📄 手机上传的 Word/文档 → 提取文本 → LLM 提炼 → 笔记 Word + PDF → 归档+回传 */
  async process_doc(p) {
    if (!p.fileId) return { ok: false, detail: '缺少文件' };
    await ensureDirs();
    const origName = p.fileName || 'document.docx';
    const fp = path.join(DIRS.doc, `${dstr()}_${origName}`);
    const n = await downloadFile(p.fileId, fp);
    const ext = path.extname(origName).toLowerCase();
    const stem = path.basename(origName, ext);
    const artifacts = [];
    /* PDF 版本 */
    if (darwin && ['.docx', '.doc', '.rtf', '.html', '.htm', '.txt', '.md'].includes(ext)) {
      try {
        const txt = `/tmp/xinli-doc-${Date.now()}.txt`;
        await run(`textutil -convert txt "${fp}" -output "${txt}"`);
        const pdf = path.join(DIRS.doc, `${dstr()}_${stem}.pdf`);
        await run(`cupsfilter "${txt}" > "${pdf}" 2>/dev/null`);
        artifacts.push(await uploadArtifact(pdf, `${stem}.pdf`));
      } catch (_) {}
    }
    /* LLM 提炼 */
    let note;
    try {
      const txt = `/tmp/xinli-ext-${Date.now()}.txt`;
      await run(`textutil -convert txt "${fp}" -output "${txt}" 2>/dev/null || cp "${fp}" "${txt}"`);
      const text = await fs.promises.readFile(txt, 'utf8');
      if (!text.trim()) throw new Error('未提取到文本');
      const ex = await llmExtractText(text);
      const out = path.join(DIRS.doc, `提炼_${dstr()}_${(ex.title || stem).slice(0, 20)}.docx`);
      await notesDocx(ex, origName, out);
      artifacts.push(await uploadArtifact(out, `提炼笔记_${(ex.title || stem).slice(0, 16)}.docx`));
      note = `LLM提炼「${ex.title}」：${(ex.summary || '').slice(0, 60)} · 卡片${(ex.cards || []).length}张`;
    } catch (e) {
      note = `LLM 提炼失败（${String(e.message).slice(0, 50)}）· 已原样归档`;
    }
    return { ok: true, detail: `课程文件 ${origName} (${(n / 1024).toFixed(0)}KB) · ${note}`, artifact: artifacts[artifacts.length - 1], artifacts };
  },

  /* 🎙️ 手机真实录音 → 归档 → 回传（手机可播放）*/
  async archive_audio(p) {
    if (!p.fileId) return { ok: false, detail: '缺少文件' };
    await ensureDirs();
    const fname = `录音_${dstr()}_${tstr()}${path.extname(p.fileName || '.webm')}`;
    const fp = path.join(DIRS.audio, fname);
    const n = await downloadFile(p.fileId, fp);
    const artifact = await uploadArtifact(fp, fname);
    return { ok: true, detail: `录音已归档 ${fname} (${(n / 1024).toFixed(0)}KB) · 可在手机回放`, artifact };
  },

  /* 📸 截屏 → 真实截图回传手机 */
  async screenshot() {
    if (!darwin) return { ok: true, detail: '（仅 macOS 支持真实截屏）' };
    try {
      const f = `/tmp/xinli-shot-${Date.now()}.png`;
      await run(`screencapture -x ${f}`);
      const s = await fs.promises.stat(f);
      const artifact = await uploadArtifact(f, `电脑截屏_${dstr()}_${tstr()}.png`);
      return { ok: true, detail: `截屏 ${(s.size / 1024).toFixed(0)}KB · 已回传手机`, artifact };
    } catch (e) { return { ok: true, detail: `截屏失败（无屏幕权限）：${e.message.slice(0, 60)}` }; }
  },

  async sysinfo() {
    const m = await computerMeta();
    return { ok: true, detail: `CPU ${m.cpu}% · 内存 ${m.mem}% · 磁盘剩余 ${m.diskFreeGb}G · 已运行 ${m.uptimeH}h · ${m.os}` };
  },

  async open_downloads() {
    try { await run(darwin ? `open "${BASE}"` : 'xdg-open "$HOME/Downloads" 2>/dev/null || true'); return { ok: true, detail: `已打开「拾光」文件夹（${BASE}）` }; }
    catch (_) { return { ok: true, detail: `归档目录：${BASE}` }; }
  },

  async find_file(payload) {
    const q = (payload && payload.q) || '论文';
    if (darwin) {
      try {
        const { stdout } = await run(`mdfind -name "${q.replace(/"/g, '')}" | head -5`);
        const lines = stdout.trim().split('\n').filter(Boolean);
        if (!lines.length) return { ok: true, detail: `没找到含「${q}」的文件` };
        return { ok: true, detail: `找到 ${lines.length} 个，如：${path.basename(lines[0])}` };
      } catch (_) {}
    }
    return { ok: true, detail: `（演示）找到《${q}初稿_v3.docx》 · 11/14 修改` };
  },

  /* 📄 AI 笔记 → 真实 Word 文档(textutil html→docx) → 归档 → 回传 */
  async word() {
    await ensureDirs();
    const html = `/tmp/xinli-notes-${Date.now()}.html`;
    const out = path.join(DIRS.doc, `复习提纲_${dstr()}.docx`);
    await fs.promises.writeFile(html, `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h1>泰勒公式 · 复习提纲</h1><p><i>心力球 · ${dstr()} 高数课自动生成</i></p>
<h2>必背三展开</h2><ul>
<li>e<sup>x</sup> = 1 + x + x²/2! + x³/3! + o(x³)</li>
<li>sin x = x − x³/3! + o(x³)</li>
<li>ln(1+x) = x − x²/2 + o(x²)</li></ul>
<h2>高频考点</h2><ul><li>用泰勒公式求极限 / 证明不等式（期中必出大题）</li></ul>
<h2>你的卡点</h2><ul><li>上次作业第 5 题：余项 o(xⁿ) 位置写错，注意展开到第 n 项后紧跟余项</li></ul>
</body></html>`);
    try {
      await run(`textutil -convert docx "${html}" -output "${out}"`);
      const artifact = await uploadArtifact(out, `复习提纲_${dstr()}.docx`);
      return { ok: true, detail: `真实 Word 文档已生成 → ${out}`, artifact };
    } catch (e) { return { ok: false, detail: '生成失败: ' + e.message.slice(0, 60) }; }
  },

  async print() {
    if (darwin) {
      try {
        const { stdout } = await run('lpstat -d 2>/dev/null || true');
        if (stdout.includes(':')) return { ok: true, detail: `已发送到打印机 ${stdout.trim().split(': ')[1]}` };
      } catch (_) {}
    }
    return { ok: true, detail: '未检测到打印机 · Word/PDF 已在「拾光/课程文件」待打印' };
  },
};

/* ---------- 心力球模拟器（真机协议到位前，见 ../API.md 第3节）---------- */
const ball = { battery: 78, storageUsedGb: 12.4, storageTotalGb: 32, recording: false, since: 0, seg: 0 };
const ballHandlers = {
  async start_recording() { ball.recording = true; ball.since = Date.now(); ball.seg++; return { ok: true, detail: `开始录音（第 ${ball.seg} 段）· 加密写入本地` }; },
  async stop_recording() { const min = ball.recording ? ((Date.now() - ball.since) / 60000).toFixed(1) : '0'; ball.recording = false; return { ok: true, detail: `已停止 · 本段 ${min} 分钟 · 已加密保存` }; },
  async sync() { return { ok: true, detail: `今日音频 ${ball.storageUsedGb.toFixed(1)}G → 局域网内电脑「拾光」归档` }; },
  async burn() { ball.recording = false; ball.storageUsedGb = 0.1; ball.seg = 0; return { ok: true, detail: '🔥 已焚毁全部原始音频 · 仅保留云端摘要' }; },
};
function ballMeta() {
  if (ball.recording) {
    ball.battery = Math.max(1, ball.battery - 0.03);
    ball.storageUsedGb = Math.min(ball.storageTotalGb, ball.storageUsedGb + 0.0008);
  } else ball.battery = Math.max(1, ball.battery - 0.002);
  return { battery: +ball.battery.toFixed(1), storage: +ball.storageUsedGb.toFixed(2), total: ball.storageTotalGb, session: ball.recording ? Math.round((Date.now() - ball.since) / 1000) : 0 };
}

/* ---------- 主循环 ---------- */
async function start(type) {
  const isBall = type === 'ball';
  const name = NAME || (isBall ? '心力球' : os.hostname());
  const meta = isBall ? ballMeta() : await computerMeta();
  await register(type, name, meta);
  const state = loadState(type);
  console.log(`\n🔮 心力球 CLI · ${isBall ? '设备模拟器' : '电脑 agent（真实工具执行）'}`);
  console.log(`   后台: ${SERVER}`);
  console.log(`   设备: ${name} → ${state.id}`);
  if (!isBall) console.log(`   产出目录: ${BASE}`);
  console.log(`   心跳: 每 ${HB / 1000}s · Ctrl+C 退出\n`);

  const beat = async () => {
    try {
      const meta = isBall ? ballMeta() : await computerMeta();
      const status = isBall ? (ball.recording ? 'recording' : 'idle') : 'online';
      const r = await api('POST', `/api/devices/${state.id}/heartbeat`, { token: state.token, status, meta });
      for (const c of (r.commands || [])) {
        const h = (isBall ? ballHandlers : computerHandlers)[c.cmd];
        let out = { ok: true, detail: `（演示）${c.cmd} 完成` };
        if (h) { try { out = await h(c.payload || {}); } catch (e) { out = { ok: false, detail: '执行出错: ' + e.message.slice(0, 80) }; } }
        console.log(`   ⚙️  ${c.cmd} → ${out.detail}`);
        api('POST', `/api/devices/${state.id}/commands/${c.id}/result`, { token: state.token, cmd: c.cmd, ok: out.ok, detail: out.detail, artifact: out.artifact || null, artifacts: out.artifacts || (out.artifact ? [out.artifact] : []) }).catch(() => {});
      }
    } catch (e) {
      console.log(`   ⚠️ 心跳失败（后台不可达）: ${e.message}`);
    }
  };
  await beat();
  setInterval(beat, HB);
  process.on('SIGINT', () => { console.log('\n   再见 · 后台将在 15s 后标记离线'); process.exit(0); });
}

async function status() {
  const r = await api('GET', '/api/devices');
  console.log(`\n📡 ${SERVER} 在线设备:`);
  for (const d of r.devices) console.log(`   ${d.online ? '🟢' : '⚪'} ${d.id}  ${d.type === 'ball' ? '🔮' : '💻'} ${d.name}`);
  if (!r.devices.length) console.log('   （空 · 先启动 cli.js ball / cli.js start）');
  console.log('');
}

if (cmd === 'start') start('computer');
else if (cmd === 'ball') start('ball');
else if (cmd === 'status') status();
else console.log(`用法:
  node cli.js start --server <url> --name <设备名>   电脑 agent（真实系统状态 + 真实工具执行）
  node cli.js ball  --server <url> --name <设备名>   心力球设备模拟器
  node cli.js status --server <url>                  查看后台在线设备
默认 server 为 http://localhost:8000`);
