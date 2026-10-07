/* 处理管线 v2（参考 Eta Agent Loop）
 * 串行队列：queued→asr→llm(提取)→merge(合并记忆)→done，失败可重试，合并失败降级为直接追加 */
import * as FS from 'expo-file-system/legacy';
import { getState, setState, uid } from './store';
import { llmChat, asrRecognize, EXTRACT_SYS, MERGE_SYS, DAILY_SYS, parseExtractJson } from './api';
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
async function extractJob(job) {
  let content;
  if (job.kind === 'photo') {
    const b64 = await FS.readAsStringAsync(job.uri, { encoding: 'base64' });
    content = [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
      { type: 'text', text: '提炼这张课堂材料（板书/PPT/笔记/试卷），直接输出 JSON。' },
    ];
  } else if (job.kind === 'doc') {
    const text = await FS.readAsStringAsync(job.uri);
    content = `提炼这份课程文档，直接输出 JSON：\n\n${text.slice(0, 50000)}`;
  } else {
    content = `这是一段手机录音的转写文本（可能是课堂、小组讨论、语音日记），提炼为学习笔记，直接输出 JSON：\n\n${(job.asrText || '').slice(0, 80000)}`;
  }
  return parseExtractJson(await llmChat([
    { role: 'system', content: EXTRACT_SYS },
    { role: 'user', content },
  ]));
}

/* ---------- ② 合并引擎（L2 知识层 + L3 画像层）---------- */
async function mergeExtract(ex) {
  const st = getState();
  const activeCards = st.cards.filter((c) => c.status === 'active');
  const cardList = activeCards.slice(0, 150).map((c) => `${c.id}|${c.q}|${String(c.a).slice(0, 40)}`).join('\n');
  const todoList = st.todos.slice(0, 80).map((t) => `${t.id}|${t.text}|${t.due || ''}|${t.done ? 'done' : 'todo'}`).join('\n');
  const profile = st.profile && st.profile.text ? st.profile.text.slice(0, 1000) : '（暂无）';
  const user = `新材料提取结果：\n${JSON.stringify({ title: ex.title, summary: ex.summary, outline: ex.outline, keywords: ex.keywords, points: ex.points, cards: ex.cards, todos: ex.todos })}\n\n现有活跃卡片（id|问题|答案摘要）：\n${cardList || '（无）'}\n\n现有待办（id|内容|截止|状态）：\n${todoList || '（无）'}\n\n用户画像摘要：\n${profile}`;
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
      todos.unshift({ id, text: t.text, due: t.due || '', from, done: false, createdAt: now });
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

/* ---------- 每日整理（防信息爆炸：日结压缩 + 已掌握卡片降温归档）---------- */
async function maybeDailyRollup() {
  try {
    const st = getState();
    if (st.jobs.some((j) => ['queued', 'asr', 'llm', 'merge'].includes(j.status))) return; // 还有在处理的
    const now = new Date();
    const key = `${now.getMonth() + 1}.${now.getDate()}`;
    const todayJobs = st.jobs.filter((j) => j.status === 'done' && new Date(j.createdAt).toDateString() === now.toDateString());
    /* 卡片降温：已掌握(box≥2) 且 7 天未更新 → 归档（记忆不无限膨胀） */
    const t = Date.now();
    const cooled = st.cards.filter((c) => c.status === 'active' && (c.box || 0) >= 2 && t - (c.updatedAt || c.createdAt || t) > 7 * 86400000).map((c) => c.id);
    if (cooled.length) {
      setState((s2) => ({ ...s2, cards: s2.cards.map((c) => (cooled.includes(c.id) ? { ...c, status: 'archived', archivedReason: '已掌握·7天未复习' } : c)) }));
      console.log('[dango] ❄️ 卡片降温归档', cooled.length, '张');
    }
    if (!todayJobs.length || st.dailies.some((d) => d.date === key)) return;
    const input = todayJobs.slice(0, 15).map((j) => `【${(j.extract && j.extract.title) || j.title}】${((j.extract && j.extract.summary) || '').slice(0, 80)}`).join('\n');
    const out = await llmChat([{ role: 'system', content: DAILY_SYS }, { role: 'user', content: input }], 300);
    const d = parseExtractJson(out);
    setState((s2) => ({ ...s2, dailies: [{ date: key, summary: d.summary || '', emoji: d.emoji || '🌤️', n: todayJobs.length }, ...s2.dailies].slice(0, 7) }));
    console.log('[dango] 📅 日结', key, d.emoji, (d.summary || '').slice(0, 40));
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
      const ops = await mergeExtract(ex);
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
export async function addAudioJob(uri, dur) {
  const id = uid();
  const dest = await persistFile(uri, 'recordings', '.m4a');
  const info = await FS.getInfoAsync(dest);
  console.log('[dango] 录音落盘:', dest, ((info.size || 0) / 1024).toFixed(0) + 'KB', 'dur=' + dur);
  pushJob({ id, kind: 'audio', title: `录音 ${new Date().toTimeString().slice(0, 5)}`, uri: dest, dur, size: info.size || 0, createdAt: Date.now(), status: 'queued', statusText: '排队中' });
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

/* ---------- 夜间维护（后台定时 + 启动补跑）：周结压缩 + 文件清理 ---------- */
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
    /* 3. 已掌握卡片降温（同日结逻辑） */
    const t = Date.now();
    const cooled = getState().cards.filter((c) => c.status === 'active' && (c.box || 0) >= 2 && t - (c.updatedAt || c.createdAt || t) > 7 * 864e5).map((c) => c.id);
    if (cooled.length) {
      setState((s2) => ({ ...s2, cards: s2.cards.map((c) => (cooled.includes(c.id) ? { ...c, status: 'archived', archivedReason: '已掌握·7天未复习' } : c)) }));
      did.push('卡片降温' + cooled.length);
    }
    /* 4. 旧记录瘦身：>7天的已完成录音删除音频文件（转写与提炼保留） */
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
  } catch (e) { console.log('[dango] 夜间维护异常', String((e && e.message) || e).slice(0, 60)); }
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
export function toggleTodo(id) { setState((s) => ({ ...s, todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })); }

/* 删除一条记录（可选连带其生成内容） */
export async function deleteJob(jobId, withDerived) {
  const job = getState().jobs.find((j) => j.id === jobId);
  if (!job) return;
  if (job.uri && job.uri.startsWith('file:')) await FS.deleteAsync(job.uri, { idempotent: true }).catch(() => {});
  setState((s) => {
    const derived = job.derived || { cardIds: [], todoIds: [] };
    return {
      ...s,
      jobs: s.jobs.filter((j) => j.id !== jobId),
      moods: s.moods.filter((m) => m.jobId !== jobId),
      cards: withDerived ? s.cards.filter((c) => !derived.cardIds.includes(c.id)) : s.cards,
      todos: withDerived ? s.todos.filter((t) => !derived.todoIds.includes(t.id)) : s.todos,
    };
  });
}

export { clearMemoryFile };

/* 录音放弃（不生成 job） */
export async function discardFile(uri) {
  if (uri && uri.startsWith('file:')) await FS.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
