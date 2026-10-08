/* 团子 Agent Runtime（参考 Eta AgentLoop）：
 * 工具循环：LLM 决策 → 本地执行工具 → 结果回填 → 再决策（≤8轮）→ 最终回答
 * 执行轨迹实时上抛（onStep），支持取消 */
import { getState, setState, uid } from './store';
import { llmChatRaw } from './api';
import { writeMemoryFile } from './exporter';

/* ---------- 工具目录（JSON Schema）---------- */
export const TOOLS = [
  { type: 'function', function: { name: 'search_memory', description: '关键词检索全部记忆（转写/笔记/日结/待办），返回命中列表', parameters: { type: 'object', properties: { query: { type: 'string', description: '关键词' }, scope: { type: 'string', enum: ['all', 'transcripts', 'notes', 'todos', 'dailies'] } }, required: ['query'] } } },
  { type: 'function', function: { name: 'read_transcript', description: '读取指定记录的完整转写原文', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'list_records', description: '枚举最近的记录（含标题/时间/摘要）', parameters: { type: 'object', properties: { days: { type: 'number', description: '最近N天，默认7' } } } } },
  { type: 'function', function: { name: 'read_course_note', description: '读取某课程完整笔记', parameters: { type: 'object', properties: { course: { type: 'string' } }, required: ['course'] } } },
  { type: 'function', function: { name: 'get_todos', description: '获取待办（可只看待完成）', parameters: { type: 'object', properties: { pending_only: { type: 'boolean' } } } } },
  { type: 'function', function: { name: 'get_dailies', description: '获取每日小结列表' } },
  { type: 'function', function: { name: 'add_todo', description: '添加一条待办（用户口头交办时用）', parameters: { type: 'object', properties: { text: { type: 'string' }, due: { type: 'string', description: '截止，可空' } }, required: ['text'] } } },
  { type: 'function', function: { name: 'complete_todo', description: '按内容模糊匹配并完成一条待办', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } } },
  { type: 'function', function: { name: 'update_profile', description: '更新用户画像（滚动重写后的完整新画像，≤120字）', parameters: { type: 'object', properties: { full: { type: 'string' } }, required: ['full'] } } },
  { type: 'function', function: { name: 'update_course_note', description: '更新某课程笔记（完整重写版，≤150字）', parameters: { type: 'object', properties: { course: { type: 'string' }, full: { type: 'string' } }, required: ['course', 'full'] } } },
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

const AGENT_SYS = `你是「团子」，用户手机里的私人记忆助理。用户主要是大学生，用她们的录音/照片/文档构建了记忆库。
规则：
1. 先用工具查证，再回答；记忆里没有就明说，禁止编造；
2. 回答引用来源，格式如〔10.7 高数录音〕；
3. 用户口头交办的事（"帮我记一下…"）→ 直接调 add_todo 等工具执行，并告知已执行；
4. 对话中获得新的长期信息（习惯/课程/考试）→ 调 update_profile / update_course_note 沉淀；
5. 中文，口语化，简洁（≤6句），除非用户要求详细。`;

/* ---------- 工具实现 ---------- */
function snippet(text, q, n) {
  const s = String(text || '');
  const i = s.indexOf(q);
  if (i < 0) return s.slice(0, n);
  return (i > 20 ? '…' : '') + s.slice(Math.max(0, i - 20), i + n);
}

export function executeTool(name, args) {
  const st = getState();
  const today = new Date();
  const A = args || {};
  switch (name) {
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
      return list.map((t) => ({ id: t.id, text: t.text, due: t.due || '', done: t.done }));
    }
    case 'get_dailies':
      return (st.dailies || []).slice(0, 7).map((d) => ({ date: d.date, emoji: d.emoji, summary: d.summary }));
    case 'add_todo': {
      const text = String(A.text || '').trim();
      if (!text) return { error: 'text 为空' };
      const t = { id: uid(), text, due: String(A.due || ''), from: '团子(对话)', done: false, archived: false, createdAt: Date.now(), visibleFrom: todayStr() };
      setState((s2) => ({ ...s2, todos: [t, ...s2.todos] }));
      return { ok: true, added: text };
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
      return { ok: true };
    }
    default:
      return { error: `未知工具 ${name}` };
  }
}

export const todayStr = () => `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`;

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
        const result = executeTool(tc.function.name, args);
        const step = { name: tc.function.name, brief: briefOf(tc.function.name, args, result) };
        steps.push(step);
        onStep && onStep([...steps]);
        if (/^(add_|complete_|update_)/.test(tc.function.name)) actions.push({ name: tc.function.name, args, result });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 4000) });
      }
    }
    messages.push({ role: 'user', content: '（请直接给出最终回答，不要再调工具）' });
    const fin = await llmChatRaw(messages, null, 800);
    return { answer: (fin.choices[0].message.content) || '（空回答）', steps, actions };
  } catch (e) {
    return { answer: `⚠️ ${String((e && e.message) || e)}`, steps, actions, error: true };
  }
}

function briefOf(name, args, result) {
  try {
    switch (name) {
      case 'search_memory': return `检索“${args.query}” → 命中 ${result.total || 0} 条`;
      case 'read_transcript': return `读取档案「${(result && result.title) || args.id}」`;
      case 'list_records': return `列出最近记录 ${Array.isArray(result) ? result.length : 0} 条`;
      case 'read_course_note': return `读取课程笔记「${(result && result.course) || args.course}」`;
      case 'get_todos': return '查看待办';
      case 'get_dailies': return '查看日结';
      case 'add_todo': return `➕ 已添加待办「${args.text}」`;
      case 'complete_todo': return `✅ 已完成「${(result && result.completed) || args.text}」`;
      case 'update_profile': return '✏️ 已更新画像';
      case 'update_course_note': return `✏️ 已更新「${args.course}」笔记`;
      default: return name;
    }
  } catch (_) { return name; }
}
