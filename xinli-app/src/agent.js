/* 团子 Agent Runtime（参考 Eta AgentLoop）：
 * 工具循环：LLM 决策 → 本地执行工具 → 结果回填 → 再决策（≤8轮）→ 最终回答
 * 执行轨迹实时上抛（onStep），支持取消 */
import { getState, setState, uid, parseDue, todayKeyISO, dueLabel } from './store';
import { llmChatRaw } from './api';
import { writeMemoryFile } from './exporter';

/* ---------- 工具目录（JSON Schema）----------
 * 手帐与待办的完整 AI 增删改查接口 + 联网检索（参考 Eta：不绑定单一搜索服务） */
export const TOOLS = [
  { type: 'function', function: { name: 'web_search', description: '联网搜索（时效性问题、记忆里没有的外部信息先用这个）', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索词' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'web_fetch', description: '抓取网页正文（配合 web_search 结果深入阅读）', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'search_memory', description: '关键词检索全部记忆（转写/笔记/日结/待办/卡片），返回命中列表', parameters: { type: 'object', properties: { query: { type: 'string', description: '关键词' }, scope: { type: 'string', enum: ['all', 'transcripts', 'notes', 'todos', 'dailies'] } }, required: ['query'] } } },
  { type: 'function', function: { name: 'read_transcript', description: '读取指定记录的完整转写原文', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'list_records', description: '枚举最近的记录（含标题/时间/摘要）', parameters: { type: 'object', properties: { days: { type: 'number', description: '最近N天，默认7' } } } } },
  { type: 'function', function: { name: 'read_course_note', description: '读取某课程完整笔记', parameters: { type: 'object', properties: { course: { type: 'string' } }, required: ['course'] } } },
  { type: 'function', function: { name: 'list_courses', description: '列出全部课程笔记目录（课程名+字数+更新时间）' } },
  { type: 'function', function: { name: 'update_course_note', description: '更新某课程笔记（完整重写版，≤150字）', parameters: { type: 'object', properties: { course: { type: 'string' }, full: { type: 'string' } }, required: ['course', 'full'] } } },
  { type: 'function', function: { name: 'delete_course_note', description: '删除某课程的整份笔记（用户明确要求时才用）', parameters: { type: 'object', properties: { course: { type: 'string' } }, required: ['course'] } } },
  { type: 'function', function: { name: 'get_todos', description: '获取待办清单（含id，供修改/删除/完成引用）', parameters: { type: 'object', properties: { pending_only: { type: 'boolean' } } } } },
  { type: 'function', function: { name: 'add_todo', description: '添加一条待办（用户口头交办时用）', parameters: { type: 'object', properties: { text: { type: 'string' }, due: { type: 'string', description: '截止，支持 周五/明天/11月2日 等，可空' } }, required: ['text'] } } },
  { type: 'function', function: { name: 'update_todo', description: '修改一条待办（改内容或截止时间）。先用 get_todos 拿 id', parameters: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string', description: '新内容，可空=不改' }, due: { type: 'string', description: '新截止（支持 周五/明天/11月2日）；传 "无" 清除截止' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'complete_todo', description: '按内容模糊匹配并完成一条待办', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } } },
  { type: 'function', function: { name: 'reopen_todo', description: '把一条已完成的待办恢复为未完成。先用 get_todos(pending_only=false) 拿 id', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'delete_todo', description: '删除一条待办（用户明确要求删除时才用）', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'get_cards', description: '获取复习卡片清单（含id）', parameters: { type: 'object', properties: { topic: { type: 'string', description: '按主题过滤，可空' }, active_only: { type: 'boolean', description: '只看活跃卡，默认true' } } } } },
  { type: 'function', function: { name: 'add_card', description: '新增一张复习卡片（用户明确要求记忆某知识点时用）', parameters: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' }, topic: { type: 'string', description: '主题/课程，可空' } }, required: ['q', 'a'] } } },
  { type: 'function', function: { name: 'update_card', description: '订正某张卡片的答案。先用 get_cards 拿 id', parameters: { type: 'object', properties: { id: { type: 'string' }, a: { type: 'string', description: '新答案' }, reason: { type: 'string', description: '订正原因' } }, required: ['id', 'a'] } } },
  { type: 'function', function: { name: 'archive_card', description: '归档一张卡片（不再出现在复习中，知识保留可搜索）', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'delete_card', description: '彻底删除一张卡片（用户明确要求时才用）', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'get_dailies', description: '获取每日小结列表' } },
  { type: 'function', function: { name: 'get_moods', description: '获取最近的心情记录（emoji/分数/标签/时刻），回答心情相关问题用', parameters: { type: 'object', properties: { n: { type: 'number', description: '最近N条，默认7' } } } } },
  { type: 'function', function: { name: 'update_profile', description: '更新用户画像（滚动重写后的完整新画像，≤120字）', parameters: { type: 'object', properties: { full: { type: 'string' } }, required: ['full'] } } },
];

/* ---------- L0+L1 常驻上下文：画像 + 记忆目录 ---------- */
function buildIndex(st) {
  const notes = Object.entries(st.courseNotes || {}).map(([k, v]) => `- ${k}（${String(v.content || '').length}字）`).join('\n') || '（无）';
  const dls = (st.dailies || []).slice(0, 5).map((d) => d.date).join('、') || '（无）';
  return `【画像】${(st.profile && st.profile.text) || '（暂无）'}
【课程笔记目录】（详情用 read_course_note 获取）
${notes}
【最近日结】${dls}`;
}

const AGENT_SYS = `你是「团团」，「团子」App 里用户手机上的私人记忆助理。用户主要是大学生，用她们的录音/照片/文档构建了记忆库。
规则：
1. 先用工具查证，再回答；个人记忆用 search_memory 等，记忆里没有就明说，禁止编造；
2. 时效性/外部信息（新闻、百科、不确定的常识）→ 先 web_search，需要细节再 web_fetch，回答注明〔来源: 网页标题〕；
3. 回答引用来源，格式如〔10.7 高数录音〕；
4. 待办与手帐支持全套增删改查：添加/修改（含改截止）/完成/恢复/删除待办，新增/订正/归档/删除卡片，读取/重写/删除课程笔记——用户要求变更时直接调工具执行并告知结果，先查后改（拿 id 再操作）；
5. 对话中获得新的长期信息（习惯/课程/考试）→ 调 update_profile / update_course_note 沉淀；
6. 删除类操作必须先向用户复述对象确认过再做（对话上文用户已明确说删即可直接执行）；
7. 中文，口语化，简洁（≤6句），除非用户要求详细。`;

/* ---------- 工具实现 ---------- */
function snippet(text, q, n) {
  const s = String(text || '');
  const i = s.indexOf(q);
  if (i < 0) return s.slice(0, n);
  return (i > 20 ? '…' : '') + s.slice(Math.max(0, i - 20), i + n);
}

/* ---------- 联网工具（纯 fetch，无 SDK 依赖；参考 Eta 不绑定单一搜索服务）---------- */
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const html2text = (html) => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const decodeDDG = (href) => { try { const m = String(href).match(/uddg=([^&]+)/); return m ? decodeURIComponent(m[1]) : href; } catch (_) { return href; } };

async function webSearch(q) {
  const key = (getState().settings && getState().settings.searchKey) || '';
  if (key) {
    /* 博查 API（国内可达，用户配了 key 就优先） */
    const r = await fetch('https://api.bochaai.com/v1/web-search', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, summary: true, count: 6 }),
    });
    const j = await r.json();
    const list = ((j.data && j.data.webPages && j.data.webPages.value) || []).map((p) => ({ title: p.name, url: p.url, snippet: String(p.snippet || '').slice(0, 140) }));
    return { engine: 'bocha', results: list.slice(0, 6) };
  }
  /* 默认 DuckDuckGo HTML（零配置；不可达时明确告知） */
  const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) return { error: `搜索不可达（HTTP ${r.status}）；可在「我的」配置搜索 Key 走博查，或改用 web_fetch` };
  const html = await r.text();
  const links = [...html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snips = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/g)];
  const results = links.slice(0, 6).map((m, i) => ({ title: html2text(m[2]), url: decodeDDG(m[1]), snippet: snips[i] ? html2text(snips[i][1]).slice(0, 140) : '' }));
  return { engine: 'duckduckgo', results };
}

export async function executeTool(name, args) {
  const st = getState();
  const today = new Date();
  const A = args || {};
  switch (name) {
    case 'web_search': {
      const q = String(A.query || '').trim();
      if (!q) return { error: 'query 为空' };
      try { return await webSearch(q); } catch (e) { return { error: '搜索失败: ' + String((e && e.message) || e).slice(0, 80) }; }
    }
    case 'web_fetch': {
      let url = String(A.url || '').trim();
      if (!url) return { error: 'url 为空' };
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        const html = await r.text();
        return { url, title: html2text((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''), text: html2text(html).slice(0, 5000) };
      } catch (e) { return { error: '抓取失败: ' + String((e && e.message) || e).slice(0, 80) }; }
    }
    case 'search_memory': {
      const q = String(A.query || '').trim();
      if (!q) return { error: 'query 为空' };
      const hits = [];
      st.jobs.filter((j) => j.status === 'done').forEach((j) => {
        const hay = `${(j.extract && (j.extract.title || '') + (j.extract.summary || '')) || ''} ${j.asrText || ''}`;
        if (hay.includes(q)) {
          const d = new Date(j.createdAt);
          hits.push({ id: j.id, date: `${d.getMonth() + 1}.${d.getDate()}`, title: (j.extract && j.extract.title) || j.title, snippet: snippet(j.asrText || (j.extract && j.extract.summary), q, 120), kind: j.kind });
        }
      });
      Object.entries(st.courseNotes || {}).forEach(([k, v]) => {
        if (String(v.content || '').includes(q) || k.includes(q)) hits.push({ type: 'note', course: k, snippet: snippet(v.content, q, 120) });
      });
      (st.dailies || []).forEach((d) => { if ((d.summary || '').includes(q)) hits.push({ type: 'daily', date: d.date, snippet: snippet(d.summary, q, 100) }); });
      (st.todos || []).forEach((t) => { if (t.text.includes(q)) hits.push({ type: 'todo', text: t.text, done: t.done }); });
      (st.cards || []).forEach((c) => { if (String(c.q).includes(q) || String(c.a || '').includes(q)) hits.push({ type: 'card', q: c.q, snippet: snippet(c.a, q, 80), status: c.status || 'active' }); });
      return { query: q, total: hits.length, hits: hits.slice(0, 8) };
    }
    case 'read_transcript': {
      const j = st.jobs.find((x) => x.id === A.id);
      if (!j) return { error: '记录不存在' };
      return { id: j.id, title: (j.extract && j.extract.title) || j.title, createdAt: new Date(j.createdAt).toLocaleString('zh-CN'), transcript: String(j.asrText || '').slice(0, 3000) };
    }
    case 'list_records': {
      const days = A.days || 7;
      const since = Date.now() - days * 86400000;
      return st.jobs.filter((j) => j.createdAt > since).slice(0, 15).map((j) => {
        const d = new Date(j.createdAt);
        return { id: j.id, date: `${d.getMonth() + 1}.${d.getDate()}`, kind: j.kind, title: (j.extract && j.extract.title) || j.title, summary: (j.extract && j.extract.summary || '').slice(0, 80) };
      });
    }
    case 'read_course_note': {
      const key = Object.keys(st.courseNotes || {}).find((k) => k.includes(String(A.course || '')));
      return key ? { course: key, content: st.courseNotes[key].content } : { error: '无该课程笔记' };
    }
    case 'get_todos': {
      const list = (A.pending_only !== false ? st.todos.filter((t) => !t.done && !t.archived) : st.todos).slice(0, 20);
      return list.map((t) => { const l = dueLabel(t.dueAt); return { id: t.id, text: t.text, due: t.due || '', dueText: l ? l.text : '', done: t.done }; });
    }
    case 'get_dailies':
      return (st.dailies || []).slice(0, 7).map((d) => ({ date: d.date, emoji: d.emoji, summary: d.summary }));
    case 'get_moods':
      return (st.moods || []).slice(0, A.n || 7).map((m) => {
        const d = new Date(m.createdAt);
        return { date: `${d.getMonth() + 1}.${d.getDate()}`, emoji: m.emoji, score: m.score || 3, tags: m.tags || [], moment: (m.moments && m.moments[0] && m.moments[0].text) || '' };
      });
    case 'add_todo': {
      const text = String(A.text || '').trim();
      if (!text) return { error: 'text 为空' };
      const { due, dueAt } = parseDue(String(A.due || ''));
      const t = { id: uid(), text, due, dueAt, from: '团团(对话)', done: false, archived: false, createdAt: Date.now(), visibleFrom: todayStr() };
      setState((s2) => ({ ...s2, todos: [t, ...s2.todos] }));
      return { ok: true, added: text, due: due || '', dueAt };
    }
    case 'complete_todo': {
      const q = String(A.text || '');
      const t = getState().todos.find((x) => !x.done && !x.archived && x.text.includes(q));
      if (!t) return { error: '未匹配到待办' };
      setState((s2) => ({ ...s2, todos: s2.todos.map((x) => (x.id === t.id ? { ...x, done: true } : x)) }));
      return { ok: true, completed: t.text };
    }
    case 'update_profile': {
      const full = String(A.full || '').slice(0, 400);
      setState((s2) => ({ ...s2, profile: { text: full, updatedAt: Date.now() } }));
      writeMemoryFile().catch(() => {});
      return { ok: true };
    }
    case 'update_course_note': {
      const course = String(A.course || '日常');
      setState((s2) => ({ ...s2, courseNotes: { ...s2.courseNotes, [course]: { content: String(A.full || '').slice(0, 400), updatedAt: Date.now() } } }));
      writeMemoryFile().catch(() => {});
      return { ok: true, course, note: String(A.full || '').slice(0, 400) };
    }
    case 'list_courses':
      return Object.entries(st.courseNotes || {}).map(([k, v]) => ({ course: k, chars: String(v.content || '').length, updatedAt: new Date(v.updatedAt || Date.now()).toLocaleDateString('zh-CN') }));
    case 'delete_course_note': {
      const key = Object.keys(st.courseNotes || {}).find((k) => k.includes(String(A.course || '')));
      if (!key) return { error: '无该课程笔记' };
      setState((s2) => { const n = { ...s2.courseNotes }; delete n[key]; return { ...s2, courseNotes: n }; });
      writeMemoryFile().catch(() => {});
      return { ok: true, deleted: key };
    }
    case 'update_todo': {
      const t = st.todos.find((x) => x.id === A.id);
      if (!t) return { error: '待办不存在，请先 get_todos 查 id' };
      const patch = {};
      if (A.text != null && String(A.text).trim()) patch.text = String(A.text).trim();
      if (A.due !== undefined) { const du = String(A.due).trim(); const { due, dueAt } = parseDue(du === '无' || du === '清除' ? '' : du); patch.due = due; patch.dueAt = dueAt; }
      setState((s2) => ({ ...s2, todos: s2.todos.map((x) => (x.id === A.id ? { ...x, ...patch } : x)) }));
      return { ok: true, updated: patch.text || t.text, due: patch.due !== undefined ? patch.due : t.due };
    }
    case 'reopen_todo': {
      const t = st.todos.find((x) => x.id === A.id);
      if (!t) return { error: '待办不存在' };
      setState((s2) => ({ ...s2, todos: s2.todos.map((x) => (x.id === A.id ? { ...x, done: false } : x)) }));
      return { ok: true, reopened: t.text };
    }
    case 'delete_todo': {
      const t = st.todos.find((x) => x.id === A.id);
      if (!t) return { error: '待办不存在' };
      setState((s2) => ({ ...s2, todos: s2.todos.filter((x) => x.id !== A.id) }));
      return { ok: true, deleted: t.text };
    }
    case 'get_cards': {
      const list = st.cards.filter((c) => (A.active_only === false ? true : c.status === 'active'))
        .filter((c) => !A.topic || String(c.topic || '').includes(String(A.topic)))
        .slice(0, 30);
      return list.map((c) => ({ id: c.id, q: c.q, a: String(c.a || '').slice(0, 60), topic: c.topic || '', status: c.status || 'active' }));
    }
    case 'add_card': {
      const q = String(A.q || '').trim();
      if (!q) return { error: 'q 为空' };
      const id = uid();
      const now = Date.now();
      setState((s2) => ({ ...s2, cards: [{ id, q, a: String(A.a || ''), topic: String(A.topic || '日常'), from: '团团(对话)', status: 'active', version: 1, history: [], createdAt: now, updatedAt: now }, ...s2.cards] }));
      return { ok: true, added: q };
    }
    case 'update_card': {
      const c = st.cards.find((x) => x.id === A.id);
      if (!c) return { error: '卡片不存在，请先 get_cards 查 id' };
      const now = Date.now();
      setState((s2) => ({ ...s2, cards: s2.cards.map((x) => (x.id === A.id ? { ...x, a: String(A.a || x.a), version: (x.version || 1) + 1, updatedAt: now, history: [...(x.history || []), { a: x.a, at: now, reason: A.reason || '团团订正' }] } : x)) }));
      return { ok: true, updated: c.q };
    }
    case 'archive_card': {
      const c = st.cards.find((x) => x.id === A.id);
      if (!c) return { error: '卡片不存在' };
      setState((s2) => ({ ...s2, cards: s2.cards.map((x) => (x.id === A.id ? { ...x, status: 'archived', archivedReason: '对话中归档' } : x)) }));
      return { ok: true, archived: c.q };
    }
    case 'delete_card': {
      const c = st.cards.find((x) => x.id === A.id);
      if (!c) return { error: '卡片不存在' };
      setState((s2) => ({ ...s2, cards: s2.cards.filter((x) => x.id !== A.id) }));
      return { ok: true, deleted: c.q };
    }
    default:
      return { error: `未知工具 ${name}` };
  }
}

export const todayStr = todayKeyISO;

/* ---------- Agent Loop ---------- */
export async function runAgent(question, { onStep, cancelled } = {}) {
  const st = getState();
  const messages = [
    { role: 'system', content: `${AGENT_SYS}\n\n${buildIndex(st)}` },
    { role: 'user', content: question },
  ];
  const steps = [];
  const actions = [];
  try {
    for (let turn = 0; turn < 8; turn++) {
      if (cancelled && cancelled()) throw new Error('已取消');
      const resp = await llmChatRaw(messages, TOOLS, 1500);
      const msg = resp.choices && resp.choices[0] && resp.choices[0].message;
      if (!msg) throw new Error('LLM 响应异常');
      const calls = msg.tool_calls || [];
      if (!calls.length) {
        return { answer: msg.content || '（空回答）', steps, actions };
      }
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      for (const tc of calls) {
        if (cancelled && cancelled()) throw new Error('已取消');
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
        const result = await executeTool(tc.function.name, args);
        /* 步骤携带完整 args/result，前端按 ETA 样式渲染详细工具调用卡 */
        const step = { name: tc.function.name, args, result, brief: briefOf(tc.function.name, args, result) };
        steps.push(step);
        onStep && onStep([...steps]);
        if (/^(add_|complete_|update_|delete_|reopen_|archive_)/.test(tc.function.name)) actions.push({ name: tc.function.name, args, result });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 4000) });
      }
    }
    messages.push({ role: 'user', content: '（请直接给出最终回答，不要再调工具）' });
    const fin = await llmChatRaw(messages, null, 800);
    return { answer: (fin.choices[0].message.content) || '（空回答）', steps, actions };
  } catch (e) {
    return { answer: `出错了：${String((e && e.message) || e)}`, steps, actions, error: true };
  }
}

function briefOf(name, args, result) {
  try {
    switch (name) {
      case 'web_search': return `联网搜索“${args.query}” → ${result.results ? result.results.length : (result.error ? '失败' : 0)} 条结果`;
      case 'web_fetch': return `读取网页「${(result && result.title) || args.url}」`;
      case 'search_memory': return `检索“${args.query}” → 命中 ${result.total || 0} 条`;
      case 'read_transcript': return `读取档案「${(result && result.title) || args.id}」`;
      case 'list_records': return `列出最近记录 ${Array.isArray(result) ? result.length : 0} 条`;
      case 'read_course_note': return `读取课程笔记「${(result && result.course) || args.course}」`;
      case 'list_courses': return `查看课程目录 ${Array.isArray(result) ? result.length : 0} 门`;
      case 'update_course_note': return `已更新「${args.course}」笔记`;
      case 'delete_course_note': return `已删除「${(result && result.deleted) || args.course}」笔记`;
      case 'get_todos': return '查看待办';
      case 'get_dailies': return '查看日结';
      case 'get_moods': return '查看心情记录';
      case 'add_todo': return `已添加待办「${args.text}」`;
      case 'update_todo': return `已修改待办「${(result && result.updated) || args.id}」`;
      case 'complete_todo': return `已完成「${(result && result.completed) || args.text}」`;
      case 'reopen_todo': return `已恢复「${(result && result.reopened) || args.id}」`;
      case 'delete_todo': return `已删除待办「${(result && result.deleted) || args.id}」`;
      case 'get_cards': return `查看卡片 ${Array.isArray(result) ? result.length : 0} 张`;
      case 'add_card': return `已添加卡片「${String(args.q || '').slice(0, 14)}」`;
      case 'update_card': return `已订正卡片「${(result && result.updated) || args.id}」`;
      case 'archive_card': return `已归档卡片「${(result && result.archived) || args.id}」`;
      case 'delete_card': return `已删除卡片「${(result && result.deleted) || args.id}」`;
      case 'update_profile': return '已更新画像';
      default: return name;
    }
  } catch (_) { return name; }
}

/* ---------- 结果二次处理（人读视图）：把工具的原始 JSON 转成干净文案，过滤 id 等机器字段 ---------- */
const ARG_LABEL = {
  query: '关键词', scope: '范围', days: '天数', course: '课程', text: '内容', due: '截止',
  pending_only: '只看待完成', n: '条数', full: '新内容', q: '问题', a: '答案', topic: '主题',
  active_only: '只看活跃卡', reason: '原因',
};

export function humanizeArgs(args) {
  return Object.entries(args || {})
    .filter(([k]) => k !== 'id') /* id 是机器字段，界面上不展示 */
    .map(([k, v]) => `${ARG_LABEL[k] || k}：${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('　');
}

const line = (arr) => (arr || []).filter(Boolean).join('\n');

export function humanizeResult(name, result) {
  try {
    const R = result;
    if (R && R.error) return `⚠️ ${R.error}`;
    switch (name) {
      case 'web_search':
        return line([`（${R.engine || 'web'}）命中 ${((R.results || []).length)} 条`, ...(R.results || []).map((r2, i) => `${i + 1}. ${r2.title}\n　${r2.url}${r2.snippet ? '\n　' + r2.snippet : ''}`)]);
      case 'web_fetch':
        return line([`《${R.title || R.url}》`, R.url, R.text]);
      case 'search_memory':
        return line([
          `命中 ${R.total || 0} 条`,
          ...(R.hits || []).map((h) => `〔${h.date || h.course || ({ note: '课程笔记', daily: '日结', todo: '待办', card: '卡片' }[h.type] || '记录')}〕${h.title || h.text || h.q || ''}${h.snippet ? '\n　' + h.snippet : ''}`),
        ]);
      case 'read_transcript':
        return line([`〔${R.title}〕${R.createdAt || ''}`, R.transcript]);
      case 'list_records':
        return (Array.isArray(R) ? R : []).map((j, i) => `${i + 1}. ${j.date}〔${{ audio: '录音', photo: '照片', doc: '文档' }[j.kind] || j.kind}〕${j.title}${j.summary ? '\n　' + j.summary : ''}`).join('\n');
      case 'read_course_note':
        return R.error ? R.error : `《${R.course}》\n${R.content}`;
      case 'list_courses':
        return (Array.isArray(R) ? R : []).map((c) => `《${c.course}》${c.chars}字 · ${c.updatedAt}更新`).join('\n') || '（暂无课程笔记）';
      case 'delete_course_note':
        return `已删除《${R.deleted}》笔记`;
      case 'get_todos':
        return (Array.isArray(R) ? R : []).map((t) => `${t.done ? '✓' : '•'} ${t.text}${t.dueText ? `（${t.dueText}）` : t.due ? `（截止 ${t.due}）` : ''}`).join('\n') || '（无待办）';
      case 'get_dailies':
        return (Array.isArray(R) ? R : []).map((d) => `${d.date} ${d.emoji || ''} ${d.summary}`).join('\n') || '（暂无日结）';
      case 'get_moods':
        return (Array.isArray(R) ? R : []).map((m) => `${m.date} ${m.emoji} ${m.score}分${(m.tags || []).length ? ' ' + m.tags.join(' ') : ''}${m.moment ? '\n　' + m.moment : ''}`).join('\n') || '（暂无心情记录）';
      case 'get_cards':
        return (Array.isArray(R) ? R : []).map((c) => `${c.status === 'active' ? '•' : '〔归档〕'}${c.q}${c.a ? `\n　答：${c.a}` : ''}`).join('\n') || '（无卡片）';
      case 'add_todo':
        return `✓ 已添加「${R.added}」${R.due ? `（截止 ${R.due}）` : ''}`;
      case 'update_todo':
        return `✓ 已改为「${R.updated}」${R.due ? `（截止 ${R.due}）` : '（无截止）'}`;
      case 'complete_todo':
        return `✓ 已完成「${R.completed}」`;
      case 'reopen_todo':
        return `✓ 已恢复待办「${R.reopened}」`;
      case 'delete_todo':
        return `🗑 已删除「${R.deleted}」`;
      case 'add_card':
        return `✓ 已添加卡片「${R.added}」`;
      case 'update_card':
        return `✓ 已订正「${R.updated}」`;
      case 'archive_card':
        return `✓ 已归档「${R.archived}」（知识保留，可搜索）`;
      case 'delete_card':
        return `🗑 已删除卡片「${R.deleted}」`;
      case 'update_profile':
        return '✓ 画像已更新';
      case 'update_course_note':
        return `✓ 《${R.course}》笔记已重写`;
      default:
        return JSON.stringify(R, null, 1);
    }
  } catch (_) {
    try { return JSON.stringify(result, null, 1); } catch (_2) { return String(result); }
  }
}
