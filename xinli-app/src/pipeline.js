/* 处理管线 v2（参考 Eta Agent Loop）
 * 串行队列：queued→asr→llm(提取)→merge(合并记忆)→done，失败可重试，合并失败降级为直接追加 */
import * as FS from 'expo-file-system/legacy';
import { getState, setState, uid, parseDue, todayKeyISO } from './store';
import { llmChat, asrRecognize, EXTRACT_SYS_CLASS, EXTRACT_SYS_CASUAL, MERGE_SYS, DAILY_SYS, REBUILD_SYS, SEGMENT_SYS, MONTHLY_SYS, MIGRATE_SYS, parseExtractJson } from './api';
import { writeMemoryFile, clearMemoryFile } from './exporter';

function patchJob(id, patch) {
  console.log('[dango] job', id, '→', patch.status || '', patch.statusText || patch.error || '');
  setState((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }));
}

/* ---------- 串行队列（保证合并时读到的是上一条提交后的记忆）---------- */
const queue = [];
let pumping = false;
function enqueueRun(jobId) { queue.push(jobId); pump(); }
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const id = queue.shift();
    try { await runJob(id); } catch (e) { console.log('[dango] queue error', String(e).slice(0, 80)); }
  }
  pumping = false;
}

/* ---------- ① 提取（工作记忆 L1）---------- */
/* 长文本分块：优先在句末断开，避免把一句话拦腰截断 */
export function splitText(text, size) {
  const s = String(text || '');
  if (s.length <= size) return [s];
  const chunks = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + size, s.length);
    if (end < s.length) {
      const tail = s.slice(i, end);
      const cut = Math.max(tail.lastIndexOf('。'), tail.lastIndexOf('！'), tail.lastIndexOf('？'), tail.lastIndexOf('；'), tail.lastIndexOf('\n'));
      if (cut > size * 0.4) end = i + cut + 1;
    }
    chunks.push(s.slice(i, end));
    i = end;
  }
  return chunks;
}

const LONG_AUDIO_CHARS = 6500;   /* 超过此长度走分段提炼（约 20-30 分钟课堂） */
const SEGMENT_CHARS = 5500;

async function extractJob(job) {
  /* 双场景：mode=casual 走轻量提炼（无笔记无卡片）；class（默认）走课堂策略（含分段） */
  const casual = job.mode === 'casual';
  const SYS = casual ? EXTRACT_SYS_CASUAL : EXTRACT_SYS_CLASS;
  const courseTag = job.course ? `【课程：${job.course}】` : '';
  let content;
  if (job.kind === 'photo') {
    const b64 = await FS.readAsStringAsync(job.uri, { encoding: 'base64' });
    content = [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
      { type: 'text', text: `${courseTag}提炼这张课堂材料（板书/PPT/笔记/试卷），直接输出 JSON。` },
    ];
  } else if (job.kind === 'doc') {
    const text = await FS.readAsStringAsync(job.uri);
    content = `${courseTag}提炼这份课程文档，直接输出 JSON：\n\n${text.slice(0, 50000)}`;
  } else {
    const full = (job.asrText || '').slice(0, 80000);
    if (!casual && full.length > LONG_AUDIO_CHARS) {
      /* 超长课堂录音（如 2 小时）：map-reduce —— 逐段提要点，再汇总成完整笔记 */
      const segs = splitText(full, SEGMENT_CHARS);
      const segNotes = [];
      for (let k = 0; k < segs.length; k++) {
        patchJob(job.id, { statusText: `长录音分段提炼 ${k + 1}/${segs.length}…` });
        const out = await llmChat([
          { role: 'system', content: SEGMENT_SYS },
          { role: 'user', content: `录音第 ${k + 1}/${segs.length} 段：\n${segs[k]}` },
        ], 900);
        const d = parseExtractJson(out);
        segNotes.push(`【第${k + 1}段 · ${d.title || ''}】\n${(d.points || []).map((p) => '- ' + p).join('\n')}${d.summary ? '\n段意：' + d.summary : ''}`);
      }
      patchJob(job.id, { statusText: '汇总分段要点…' });
      content = `${courseTag}这是一段超长课堂录音（共 ${segs.length} 段）的分段要点整理结果。请把它们综合成一份连贯完整的学习笔记，直接输出 JSON：\n\n${segNotes.join('\n\n')}`;
    } else {
      content = `${courseTag}这是一段手机录音的转写文本（${casual ? '用户的灵感闲聊' : '课堂/学习内容'}），按规则提炼，直接输出 JSON：\n\n${full}`;
    }
  }
  return parseExtractJson(await llmChat([
    { role: 'system', content: SYS },
    { role: 'user', content },
  ]));
}

/* ---------- ② 合并引擎（L2 知识层 + L3 画像层）---------- */
async function mergeExtract(ex, job) {
  const st = getState();
  const activeCards = st.cards.filter((c) => c.status === 'active');
  const cardList = activeCards.slice(0, 150).map((c) => `${c.id}|${c.q}|${String(c.a).slice(0, 40)}`).join('\n');
  const todoList = st.todos.slice(0, 80).map((t) => `${t.id}|${t.text}|${t.due || ''}|${t.done ? 'done' : 'todo'}`).join('\n');
  const profile = st.profile && st.profile.text ? st.profile.text.slice(0, 1000) : '（暂无）';
  const notes = Object.entries(st.courseNotes || {}).map(([k, v]) => `【${k}】${String(v.content || '').slice(0, 200)}`).join('\n') || '（无）';
  const user = `新材料提取结果（mode=${job.mode === 'casual' ? 'casual（灵感闲聊：note 留空、cards 不加、吸收 profile_facts）' : 'class（课堂材料）'}）：\n${JSON.stringify({ title: ex.title, summary: ex.summary, outline: ex.outline, keywords: ex.keywords, points: ex.points, cards: ex.cards, todos: ex.todos, profile_facts: ex.profile_facts })}\n\n现有活跃卡片（id|问题|答案摘要）：\n${cardList || '（无）'}\n\n现有待办（id|内容|截止|状态）：\n${todoList || '（无）'}\n\n现有课程笔记（note 更新时必须吸收并保持连续）：\n${notes}\n\n用户画像摘要：\n${profile}`;
  const out = await llmChat([{ role: 'system', content: MERGE_SYS }, { role: 'user', content: user }]);
  const ops = parseExtractJson(out);
  ['cards', 'todos'].forEach((k) => {
    if (!ops[k]) ops[k] = {};
    ['add', 'update', 'archive', 'done'].forEach((a) => { if (!ops[k][a]) ops[k][a] = []; });
  });
  if (!ops.note) ops.note = {};
  if (!ops.profile) ops.profile = {};
  return ops;
}

function applyOps(jobId, ex, ops) {
  const from = (ex.title || '新材料').slice(0, 24);
  const now = Date.now();
  const derived = { cardIds: [], todoIds: [] };
  setState((s) => {
    let cards = [...s.cards];
    let todos = [...s.todos];

    const funsNew = [];
    (ops.cards.add || []).filter((c) => c && c.q).forEach((c) => {
      const id = uid();
      if (c.kind === 'fun') { funsNew.push({ id, text: `${c.q} → ${c.a}`, from, at: now }); return; } /* 趣味不进复习 */
      derived.cardIds.push(id);
      cards.unshift({ id, q: c.q, a: c.a || '', topic: c.topic || from, from, status: 'active', version: 1, history: [], createdAt: now, updatedAt: now });
    });
    (ops.cards.update || []).forEach((u) => {
      const i = cards.findIndex((c) => c.id === u.id);
      if (i > -1) {
        const old = cards[i];
        if (u.a && u.a !== old.a) cards[i] = { ...old, a: u.a, version: (old.version || 1) + 1, updatedAt: now, history: [...(old.history || []), { a: old.a, at: now, reason: u.reason || '订正' }] };
      }
    });
    (ops.cards.archive || []).forEach((id) => {
      const i = cards.findIndex((c) => c.id === id);
      if (i > -1) cards[i] = { ...cards[i], status: 'archived' };
    });
    /* 容量硬上限：活跃 > 30 时按（box 高→最久未动）自动归档溢出部分 */
    const cap = 30;
    let activeList = cards.filter((c) => c.status === 'active');
    if (activeList.length > cap) {
      const overflow = activeList.slice().sort((a, b) => ((b.box || 0) - (a.box || 0)) || ((a.updatedAt || 0) - (b.updatedAt || 0))).slice(0, activeList.length - cap).map((c) => c.id);
      cards = cards.map((c) => (overflow.includes(c.id) ? { ...c, status: 'archived', archivedReason: '容量满·自动让位' } : c));
    }

    (ops.todos.add || []).filter((t) => t && t.text).forEach((t) => {
      const id = uid(); derived.todoIds.push(id);
      const { due, dueAt } = parseDue(t.due || '');
      todos.unshift({ id, text: t.text, due, dueAt, from, done: false, createdAt: now, visibleFrom: '' });
    });
    (ops.todos.done || []).forEach((id) => {
      const i = todos.findIndex((t) => t.id === id);
      if (i > -1) todos[i] = { ...todos[i], done: true };
    });
    (ops.todos.archive || []).forEach((id) => { todos = todos.filter((t) => t.id !== id); });

    /* 课程笔记：滚动重写（≤150字），不追加流水账 */
    const course = (ops.note && ops.note.course) || from;
    const courseNotes = { ...s.courseNotes };
    if (ops.note && (ops.note.full || ops.note.patch)) {
      courseNotes[course] = { content: String(ops.note.full || ops.note.patch).slice(0, 400), updatedAt: now };
    }
    /* 画像：滚动重写（不累加），用户手动编辑后作为新基准 */
    let profile = s.profile || { text: '', updatedAt: 0 };
    if (ops.profile && (ops.profile.full || ops.profile.patch)) {
      profile = { text: String(ops.profile.full || ops.profile.patch).slice(0, 400), updatedAt: now };
    }

    /* 心情独立于合并引擎（从提取结果直接取） */
    const moods = ex.mood && ex.mood.emoji
      ? [{ id: uid(), jobId, createdAt: now, emoji: ex.mood.emoji, tags: ex.mood.tags || [], moments: ex.mood.moments || [], score: ex.mood.score || 3 }, ...s.moods]
      : s.moods;

    return { ...s, cards, todos, moods, courseNotes, profile, funs: [...(ops.funs && ops.funs.add ? ops.funs.add.filter((f) => f && f.text).map((f) => ({ id: uid(), text: f.text, from, at: now })) : []), ...funsNew, ...(s.funs || [])].slice(0, 60), jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, derived } : j)) };
  });
  return derived;
}

/* 合并失败时的降级：直接追加（保持可用） */
function applyExtractFallback(jobId, ex) {
  const from = (ex.title || '新材料').slice(0, 24);
  const now = Date.now();
  const derived = { cardIds: [], todoIds: [] };
  setState((s) => ({
    ...s,
    cards: [
      ...(ex.cards || []).filter((c) => c && c.q && c.kind !== 'fun').map((c) => { const id = uid(); derived.cardIds.push(id); return { id, q: c.q, a: c.a || '', topic: from, from, status: 'active', version: 1, history: [], createdAt: now, updatedAt: now }; }),
      ...s.cards,
    ],
    funs: [...(ex.funs || []).filter((f) => f && f.text).map((f) => ({ id: uid(), text: f.text, from, at: now })), ...(s.funs || [])].slice(0, 60),
    todos: [
      ...(ex.todos || []).filter((t) => t && t.text).map((t) => { const id = uid(); derived.todoIds.push(id); return { id, text: t.text, due: t.due || '', from, done: false, createdAt: now }; }),
      ...s.todos,
    ],
    moods: ex.mood && ex.mood.emoji
      ? [{ id: uid(), jobId, createdAt: now, emoji: ex.mood.emoji, tags: ex.mood.tags || [], moments: ex.mood.moments || [], score: ex.mood.score || 3 }, ...s.moods]
      : s.moods,
    jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, derived } : j)),
  }));
  return derived;
}

/* ---------- 日常笔记分拣迁移（一次性，幂等）----------
 * 旧版把闲聊内容滚进 courseNotes['日常']（杂物抽屉）。现在拆解：有效约定→待办、长期信息→画像，然后删除该键。
 * 迁移失败保留键，下次启动再试。 */
export async function migrateLegacyCasual() {
  const st = getState();
  const d = st.courseNotes && st.courseNotes['日常'];
  if (!d) return false;
  /* 空壳笔记：无分拣价值，直接清理（不留空抽屉） */
  if (!String(d.content || '').trim()) {
    setState((s2) => { const rest = { ...s2.courseNotes }; delete rest['日常']; return { ...s2, courseNotes: rest }; });
    console.log('[dango] 🧳 空「日常」笔记已清理');
    return true;
  }
  console.log('[dango] 🧳 检测到旧「日常」笔记，分拣迁移中…');
  try {
    const out = await llmChat([{ role: 'system', content: MIGRATE_SYS }, { role: 'user', content: d.content }], 600);
    const m = parseExtractJson(out);
    setState((s2) => {
      const rest = { ...s2.courseNotes };
      delete rest['日常'];
      const now = Date.now();
      const newTodos = (m.todos || []).filter((t) => t && t.text).map((t) => {
        const { due, dueAt } = parseDue(t.due || '');
        return { id: uid(), text: t.text, due, dueAt, from: '日常迁移', done: false, archived: false, createdAt: now, visibleFrom: '' };
      });
      let profile = s2.profile || { text: '', updatedAt: 0 };
      if ((m.profile_facts || []).length) {
        profile = { text: [profile.text].filter(Boolean).concat(m.profile_facts).join('；').slice(0, 400), updatedAt: now };
      }
      return { ...s2, courseNotes: rest, todos: [...newTodos, ...s2.todos], profile };
    });
    writeMemoryFile().catch(() => {});
    console.log('[dango] 🧳 迁移完成：待办', (m.todos || []).length, '条，画像事实', (m.profile_facts || []).length, '条');
    return true;
  } catch (e) {
    console.log('[dango] 🧳 迁移失败，下次启动再试:', String((e && e.message) || e).slice(0, 60));
    return false;
  }
}

/* ---------- 日终归档 Agent：今日工作台清空，过去沉入记忆 ----------
 * 自动运转机制（移动端无严格 cron，三重兜底）：启动归档（此处）+ 活跃期 30min 检查（App.js）+ 幂等标记 */
export const archToday = todayKeyISO;

export async function runArchivist() {
  await migrateLegacyCasual().catch(() => {});
  const today = archToday();
  const st = getState();
  if (st.lastArchivistDay === today) return;
  console.log('[dango] 🧹 日终归档开始', today);
  try {
    /* 1. 非今日卡片 → 按日失效 */
    const staleCards = st.cards.filter((c) => c.status === 'active' && new Date(c.createdAt).toDateString() !== new Date().toDateString());
    if (staleCards.length) setState((s2) => ({ ...s2, cards: s2.cards.map((c) => (staleCards.includes(c) ? { ...c, status: 'archived', archivedReason: '按日失效' } : c)) }));
    /* 2. 未完成待办 → LLM 决策 carry / drop */
    const pend = getState().todos.filter((t) => !t.done && !t.archived && t.visibleFrom && t.visibleFrom < today);
    if (pend.length) {
      try {
        const out = await llmChat([
          { role: 'system', content: '你是待办管家。对每条未完成待办决策：carry=仍有意义挪到今天；drop=已无意义/已过期，沉入记忆即可。只输出 JSON：{"decisions":[{"id":"...","action":"carry|drop","reason":"..."}]}' },
          { role: 'user', content: `今天是${today}。待办：\n${pend.map((t) => `${t.id}|${t.text}${t.due ? '|截止' + t.due : ''}`).join('\n')}` },
        ], 600);
        const d = parseExtractJson(out);
        setState((s2) => ({
          ...s2,
          todos: s2.todos.map((t) => {
            const dec = (d.decisions || []).find((x) => x.id === t.id);
            if (!dec) return t;
            if (dec.action === 'carry') return { ...t, visibleFrom: today };
            if (dec.action === 'drop') return { ...t, archived: true, archivedReason: dec.reason || '归档' };
            return t;
          }),
        }));
        console.log('[dango] 🧹 待办流转:', (d.decisions || []).map((x) => x.action).join(','));
      } catch (e) { console.log('[dango] 待办流转失败', String((e && e.message) || e).slice(0, 50)); }
    }
    /* 3. 补日结（当天最后一条完成时也会触发，这里兜底） */
    await maybeDailyRollup().catch(() => {});
    /* 4. 周日 → 周结压缩 */
    if (new Date().getDay() === 0) {
      const old = getState().dailies.filter((d) => {
        const [m, dd] = d.date.split('.').map(Number);
        return (new Date() - new Date(new Date().getFullYear(), m - 1, dd)) > 7 * 864e5 && !getState().weeklies.some((w) => (w.range || '').includes(d.date));
      });
      if (old.length >= 2) {
        try {
          const out = await llmChat([{ role: 'system', content: '把每日小结压缩成一段周记。只输出 JSON：{"summary":"..."}' }, { role: 'user', content: old.map((d) => `[${d.date}] ${d.summary}`).join('\n') }], 400);
          const w = parseExtractJson(out);
          setState((s2) => ({ ...s2, weeklies: [{ range: old[0].date + '-' + old[old.length - 1].date, summary: w.summary || '' }, ...s2.weeklies].slice(0, 8) }));
        } catch (_) {}
      }
    }
    setState((s2) => ({ ...s2, lastArchivistDay: today }));
    try { await writeMemoryFile(); } catch (_) {}
    console.log('[dango] 🧹 归档完成: 卡片失效', staleCards.length, '张, 待办流转', pend.length, '条');
    /* 归档后接夜间维护（周结/月结/瘦身）——启动路径兜底之一 */
    nightlyMaintenance().catch(() => {});
  } catch (e) { console.log('[dango] 归档异常', String((e && e.message) || e).slice(0, 60)); }
}

/* ---------- 每日整理（防信息爆炸：日结压缩 + 已掌握卡片降温归档）---------- */
async function maybeDailyRollup() {
  try {
    const st = getState();
    if (st.jobs.some((j) => ['queued', 'asr', 'llm', 'merge'].includes(j.status))) return; // 还有在处理的
    /* 卡片降温：已掌握(box≥2) 且 7 天未更新 → 归档（记忆不无限膨胀） */
    const t = Date.now();
    const cooled = st.cards.filter((c) => c.status === 'active' && (c.box || 0) >= 2 && t - (c.updatedAt || c.createdAt || t) > 7 * 86400000).map((c) => c.id);
    if (cooled.length) {
      setState((s2) => ({ ...s2, cards: s2.cards.map((c) => (cooled.includes(c.id) ? { ...c, status: 'archived', archivedReason: '已掌握·7天未复习' } : c)) }));
      console.log('[dango] ❄️ 卡片降温归档', cooled.length, '张');
    }
    /* 按天补缺失的日结（不止今天：某天没开 App，那天的日结也能在下次启动补上；最多补 3 天防爆量） */
    const byDay = {};
    st.jobs.filter((j) => j.status === 'done').forEach((j) => {
      const d = new Date(j.createdAt);
      const key = `${d.getMonth() + 1}.${d.getDate()}`;
      if (!st.dailies.some((x) => x.date === key)) (byDay[key] = byDay[key] || []).push(j);
    });
    const missing = Object.keys(byDay).sort((a, b) => b.localeCompare(a)).slice(0, 3);
    for (const key of missing) {
      const input = byDay[key].slice(0, 15).map((j) => `【${(j.extract && j.extract.title) || j.title}】${((j.extract && j.extract.summary) || '').slice(0, 80)}`).join('\n');
      const out = await llmChat([{ role: 'system', content: DAILY_SYS }, { role: 'user', content: input }], 300);
      const d = parseExtractJson(out);
      setState((s2) => ({ ...s2, dailies: [{ date: key, summary: d.summary || '', emoji: d.emoji || '🌤️', n: byDay[key].length }, ...s2.dailies.filter((x) => x.date !== key)].slice(0, 7) }));
      console.log('[dango] 📅 日结', key, d.emoji, (d.summary || '').slice(0, 40));
    }
  } catch (e) { console.log('[dango] 日结失败', String((e && e.message) || e).slice(0, 60)); }
}

/* ---------- 主状态机 ---------- */
export async function runJob(jobId) {
  let job = getState().jobs.find((j) => j.id === jobId);
  if (!job) return;
  try {
    if (job.kind === 'audio') {
      patchJob(jobId, { status: 'asr', statusText: '转写中…', error: null });
      const b64 = await FS.readAsStringAsync(job.uri, { encoding: 'base64' });
      const res = await asrRecognize(b64, { format: 'm4a', codec: 'aac', rate: 16000 });
      patchJob(jobId, { status: 'llm', statusText: 'AI 提炼中…', asrText: res.text });
      job = { ...job, asrText: res.text };
    } else {
      patchJob(jobId, { status: 'llm', statusText: job.kind === 'photo' ? '多模态提炼中…' : 'AI 提炼中…', error: null });
    }
    const ex = await extractJob(job);
    patchJob(jobId, { status: 'merge', statusText: '合并记忆中…', extract: ex, title: ex.title || job.title });

    let derived, mergeNote = '';
    try {
      const ops = await mergeExtract(ex, job);
      derived = applyOps(jobId, ex, ops);
      const na = (ops.cards.add || []).length, nu = (ops.cards.update || []).length, nar = (ops.cards.archive || []).length;
      mergeNote = `合并:新增${na}/订正${nu}/归档${nar}`;
      console.log('[dango] 🔀 合并完成', mergeNote, '| 笔记:', ops.note && ops.note.course, '| 画像:', (ops.profile && ops.profile.patch || '').slice(0, 40));
    } catch (e) {
      derived = applyExtractFallback(jobId, ex);
      mergeNote = '合并失败·直接追加';
      console.log('[dango] ⚠️ 合并失败，降级追加:', String((e && e.message) || e).slice(0, 60));
    }
    patchJob(jobId, { status: 'done', statusText: '完成' });
    console.log('[dango] ✅ 完成:', ex.title, '| 卡片', derived.cardIds.length, '新增 | 待办', derived.todoIds.length, '新增');
    /* 记忆文件：每条完成后全量重写（应用独占维护）；exportAuto 时附带本条文件 */
    const doneJob = getState().jobs.find((j) => j.id === jobId);
    if (doneJob && getState().settings.exportRoot !== undefined && (getState().settings.exportRoot || getState().settings.exportDir)) {
      import('./exporter').then(async (m) => {
        await m.writeMemoryFile();
        if (getState().settings.exportAuto) await m.exportJob(doneJob);
      }).catch(() => {});
    }
    /* 当天全部处理完 → 生成每日小结 + 卡片降温 */
    maybeDailyRollup();
  } catch (e) {
    patchJob(jobId, { status: 'error', statusText: '失败', error: String((e && e.message) || e).slice(0, 140) });
  }
}

/* ---------- 录入入口 ---------- */
async function persistFile(uri, folder, ext) {
  const dir = `${FS.documentDirectory}xinli-${folder}/`;
  await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = dir + uid() + ext;
  await FS.copyAsync({ from: uri, to: dest });
  return dest;
}
function pushJob(job) {
  setState((s) => ({ ...s, jobs: [job, ...s.jobs] }));
  enqueueRun(job.id);
}
export async function addAudioJob(uri, dur, meta = {}) {
  const id = uid();
  const dest = await persistFile(uri, 'recordings', '.m4a');
  const info = await FS.getInfoAsync(dest);
  console.log('[dango] 录音落盘:', dest, ((info.size || 0) / 1024).toFixed(0) + 'KB', 'dur=' + dur, meta.mode || 'class', meta.course || '');
  pushJob({ id, kind: 'audio', mode: meta.mode || 'class', course: meta.course || '', title: meta.course ? `${meta.course} ${new Date().toTimeString().slice(0, 5)}` : `${meta.mode === 'casual' ? '灵感' : '录音'} ${new Date().toTimeString().slice(0, 5)}`, uri: dest, dur, size: info.size || 0, createdAt: Date.now(), status: 'queued', statusText: '排队中' });
  return id;
}
export async function addPhotoJob(uri, size) {
  const id = uid();
  const dest = await persistFile(uri, 'photos', '.jpg');
  pushJob({ id, kind: 'photo', title: `课堂照片 ${new Date().toTimeString().slice(0, 5)}`, uri: dest, size, createdAt: Date.now(), status: 'queued', statusText: '排队中' });
  return id;
}
export async function addDocJob(uri, name, size) {
  const id = uid();
  const ext = (name.match(/\.\w+$/) || ['.txt'])[0];
  const dest = await persistFile(uri, 'docs', ext);
  pushJob({ id, kind: 'doc', title: name, uri: dest, size, createdAt: Date.now(), status: 'queued', statusText: '排队中' });
  return id;
}
export function retryJob(id) {
  patchJob(id, { status: 'queued', statusText: '重试中', error: null });
  enqueueRun(id);
}

/* ---------- 夜间维护（后台定时 + 启动补跑）：周结/月结压缩 + 记录瘦身 + 文件清理 ----------
 * 记忆流转路径（防两个月冗余）：原始记录 →(14天)转写瘦身 →(60天)只留摘要；日结 →(周日)周结 →(月末)月结 */
export async function nightlyMaintenance(force) {
  const st = getState();
  if (!force && Date.now() - (st.lastNightlyAt || 0) < 20 * 3600e3) return; // 20h 内跑过
  console.log('[dango] 🌙 夜间维护开始');
  let did = [];
  try {
    /* 1. 补最近缺失的日结 */
    const pending = st.jobs.filter((j) => j.status === 'done' && !st.dailies.some((d) => d.date === `${new Date(j.createdAt).getMonth() + 1}.${new Date(j.createdAt).getDate()}`));
    if (pending.length) { await maybeDailyRollup(); did.push('日结'); }
    /* 2. 周结：把 7 天前的 dailies 压缩成周记（防冗杂） */
    const now = new Date();
    const old = st.dailies.filter((d) => {
      const [m, dd] = d.date.split('.').map(Number);
      return (now - new Date(now.getFullYear(), m - 1, dd)) > 7 * 864e5 && !st.weeklies.some((w) => (w.range || '').includes(d.date));
    });
    if (old.length >= 3) {
      try {
        const out = await llmChat([{ role: 'system', content: '把每日小结压缩成一段周记（学习/生活/情绪各一句以内）。只输出 JSON：{"summary":"..."}' },
          { role: 'user', content: old.map((d) => `[${d.date}] ${d.summary}`).join('\n') }], 400);
        const w = parseExtractJson(out);
        setState((s2) => ({ ...s2, weeklies: [{ range: old[0].date + '-' + old[old.length - 1].date, summary: w.summary || '' }, ...s2.weeklies].slice(0, 8) }));
        did.push('周结');
      } catch (_) {}
    }
    /* 2.5 月结：>30 天的周记 ≥3 条 → 压成月结并从周记中移除（第三层压缩） */
    const oldWeeks = getState().weeklies.filter((w) => {
      const last = String(w.range || '').split('-').pop();
      const [m, dd] = last.split('.').map(Number);
      return m && (now - new Date(now.getFullYear(), m - 1, dd)) > 30 * 864e5;
    });
    if (oldWeeks.length >= 3) {
      try {
        const out = await llmChat([{ role: 'system', content: MONTHLY_SYS },
          { role: 'user', content: oldWeeks.map((w) => `[${w.range}] ${w.summary}`).join('\n') }], 500);
        const mo = parseExtractJson(out);
        const compressed = oldWeeks.map((w) => w.range);
        setState((s2) => ({
          ...s2,
          monthlies: [{ range: oldWeeks[0].range.split('-')[0] + '-' + oldWeeks[oldWeeks.length - 1].range.split('-').pop(), summary: mo.summary || '' }, ...(s2.monthlies || [])].slice(0, 6),
          weeklies: s2.weeklies.filter((w) => !compressed.includes(w.range)),
        }));
        did.push('月结');
      } catch (_) {}
    }
    /* 3. 已掌握卡片降温（同日结逻辑） */
    const t = Date.now();
    const cooled = getState().cards.filter((c) => c.status === 'active' && (c.box || 0) >= 2 && t - (c.updatedAt || c.createdAt || t) > 7 * 864e5).map((c) => c.id);
    if (cooled.length) {
      setState((s2) => ({ ...s2, cards: s2.cards.map((c) => (cooled.includes(c.id) ? { ...c, status: 'archived', archivedReason: '已掌握·7天未复习' } : c)) }));
      did.push('卡片降温' + cooled.length);
    }
    /* 4. 旧记录瘦身（记忆分层的温度下降，搜索仍可命中摘要）：
     *    >14 天：转写只留开头 300 字；>60 天：连提炼也只留标题+摘要，转写删除（深冷） */
    let slimmed = 0, deepSlimmed = 0;
    setState((s2) => ({
      ...s2,
      jobs: s2.jobs.map((j) => {
        if (j.status !== 'done') return j;
        const age = t - (j.createdAt || t);
        if (age > 60 * 864e5 && !j.deepSlimmed) {
          deepSlimmed++;
          return { ...j, deepSlimmed: true, slimmed: true, asrText: '', extract: j.extract ? { title: j.extract.title, summary: j.extract.summary } : j.extract };
        }
        if (age > 14 * 864e5 && !j.slimmed && j.asrText && j.asrText.length > 300) {
          slimmed++;
          return { ...j, slimmed: true, asrText: j.asrText.slice(0, 300) + '……（已瘦身：完整转写已随周结/月结沉淀，或见导出文档）' };
        }
        return j;
      }),
    }));
    if (slimmed) did.push('转写瘦身' + slimmed);
    if (deepSlimmed) did.push('深冷归档' + deepSlimmed);
    /* 5. 旧记录清理：>7天的已完成录音删除音频文件（转写与提炼保留） */
    let freed = 0;
    for (const j of getState().jobs) {
      if (j.status === 'done' && j.kind === 'audio' && j.uri && t - j.createdAt > 7 * 864e5) {
        await FS.deleteAsync(j.uri, { idempotent: true }).catch(() => {});
        setState((s2) => ({ ...s2, jobs: s2.jobs.map((x) => (x.id === j.id ? { ...x, uri: null, freed: true } : x)) }));
        freed++;
      }
    }
    if (freed) did.push('清理音频' + freed);
    setState((s2) => ({ ...s2, lastNightlyAt: Date.now() }));
    try { await writeMemoryFile(); } catch (_) {}
    console.log('[dango] 🌙 夜间维护完成:', did.join('、') || '无需处理');
    return did;
  } catch (e) { console.log('[dango] 夜间维护异常', String((e && e.message) || e).slice(0, 60)); }
  return did;
}

/* 手动「整理记忆」入口（手帐页记忆分层卡）：日终归档 + 强制夜间维护 */
export async function tidyMemory() {
  await runArchivist();
  return nightlyMaintenance(true);
}

/* ---------- 人工维护入口 ---------- */
export function editCardAnswer(id, newA) {
  setState((s) => ({ ...s, cards: s.cards.map((c) => {
    if (c.id !== id || !newA || newA === c.a) return c;
    return { ...c, a: newA, version: (c.version || 1) + 1, updatedAt: Date.now(), history: [...(c.history || []), { a: c.a, at: Date.now(), reason: '手动订正' }] };
  }) }));
}
export function archiveCard(id) { setState((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, status: 'archived' } : c)) })); }
export function deleteCard(id) { setState((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id) })); }
export function deleteTodo(id) { setState((s) => ({ ...s, todos: s.todos.filter((t) => t.id !== id) })); }
export function editTodo(id, text) { setState((s) => ({ ...s, todos: s.todos.map((t) => (t.id === id ? { ...t, text } : t)) })); }
/* 修改待办：文本与截止（due 传空串 = 清除截止；"周五/明天/11月2日" 等自然语言由 parseDue 归一化） */
export function updateTodo(id, patch = {}) {
  setState((s) => ({ ...s, todos: s.todos.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t };
    if (patch.text != null && String(patch.text).trim()) next.text = String(patch.text).trim();
    if (patch.due !== undefined) { const { due, dueAt } = parseDue(String(patch.due || '')); next.due = due; next.dueAt = dueAt; }
    return next;
  }) }));
}
export function toggleTodo(id) { setState((s) => ({ ...s, todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })); }
/* 编辑记录正文（摘要 + 关键点，一行一条）：AI 提炼不准时用户可手动订正 */
export function editRecordText(id, { summary, points }) {
  setState((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, extract: { ...j.extract, summary, points } } : j)) }));
  writeMemoryFile().catch(() => {});
}

/* 删除一条记录（可选连带其生成内容）。
 * 隐私要求：withDerived 时必须清除一切衍生物 —— 卡片/待办/心情/云文档/日结/课程笔记与画像（LLM 从剩余记录重建） */
export async function deleteJob(jobId, withDerived) {
  const job = getState().jobs.find((j) => j.id === jobId);
  if (!job) return;
  if (job.uri && job.uri.startsWith('file:')) await FS.deleteAsync(job.uri, { idempotent: true }).catch(() => {});
  setState((s) => {
    const derived = job.derived || { cardIds: [], todoIds: [] };
    const dkey = `${new Date(job.createdAt).getMonth() + 1}.${new Date(job.createdAt).getDate()}`;
    return {
      ...s,
      jobs: s.jobs.filter((j) => j.id !== jobId),
      moods: s.moods.filter((m) => m.jobId !== jobId),
      cards: withDerived ? s.cards.filter((c) => !derived.cardIds.includes(c.id)) : s.cards,
      todos: withDerived ? s.todos.filter((t) => !derived.todoIds.includes(t.id)) : s.todos,
      dailies: withDerived ? s.dailies.filter((d) => d.date !== dkey) : s.dailies,
    };
  });
  if (withDerived) {
    import('./exporter').then(async (m) => {
      try { await m.removeJobFiles(job); await m.exportAll(); } catch (_) {}
    }).catch(() => {});
    rebuildMergedMemory().catch((e) => console.log('[dango] 记忆重建失败', String((e && e.message) || e).slice(0, 60)));
  }
}

/* 记忆重建：删除记录后，仅从剩余记录重新生成课程笔记与画像（保证衍生内容不含已删材料） */
export async function rebuildMergedMemory() {
  const st = getState();
  const done = st.jobs.filter((j) => j.status === 'done').slice(0, 40);
  if (!done.length) {
    setState((s) => ({ ...s, courseNotes: {}, profile: { text: '', updatedAt: Date.now() } }));
    return;
  }
  const input = done.map((j) => `【${(j.extract && j.extract.title) || j.title}】${((j.extract && j.extract.summary) || '').slice(0, 90)} ${(j.asrText || '').slice(0, 150)}`).join('\n');
  const out = await llmChat([{ role: 'system', content: REBUILD_SYS }, { role: 'user', content: input }], 1800);
  const d = parseExtractJson(out);
  const notes = {};
  Object.entries(d.courseNotes || {}).forEach(([k, v]) => {
    notes[k] = { content: String(typeof v === 'string' ? v : (v && v.content) || '').slice(0, 400), updatedAt: Date.now() };
  });
  const ptext = String((d.profile && (d.profile.full || d.profile.text)) || (typeof d.profile === 'string' ? d.profile : '') || '').slice(0, 400);
  setState((s) => ({ ...s, courseNotes: notes, profile: { text: ptext, updatedAt: Date.now() } }));
  try { await writeMemoryFile(); } catch (_) {}
  console.log('[dango] ♻️ 记忆重建完成：', Object.keys(notes).join('、') || '（无笔记）');
}

export { clearMemoryFile };

/* 录音放弃（不生成 job） */
export async function discardFile(uri) {
  if (uri && uri.startsWith('file:')) await FS.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
