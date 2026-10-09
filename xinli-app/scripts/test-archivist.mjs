/* 日终归档 Agent 验证（STATUS 未完成项#3）
 * 直跑 src/pipeline.js 的 runArchivist 真代码 + 真 LLM 决策；
 * 注入昨天 visibleFrom 的待办/卡片/记录，模拟"隔天首启"。
 * 用法：node --import ./scripts/register.mjs scripts/test-archivist.mjs */
const { initStore, getState, setState } = await import('../src/store.js');
const { runArchivist } = await import('../src/pipeline.js');
const { executeTool, todayStr } = await import('../src/agent.js');

const DAY = 864e5;
const now = Date.now();
const yd = new Date(now - DAY);
const yStr = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
const today = todayStr();

await initStore();
setState(() => ({
  lastArchivistDay: '',
  settings: getState().settings,
  jobs: [
    { id: 'j1', kind: 'audio', title: '英语课录音', status: 'done', createdAt: now - DAY,
      asrText: '今天讲虚拟语气的三种用法。作业是周五交一篇英语作文。另外提醒一下，记得去还图书馆的书。',
      extract: { title: '英语课·虚拟语气', summary: '讲虚拟语气用法；周五交英语作文；还图书馆的书' } },
    { id: 'j2', kind: 'doc', title: '今日碎念', status: 'done', createdAt: now,
      asrText: '今天背了50个单词，心情不错',
      extract: { title: '碎念', summary: '背单词，状态不错' } },
  ],
  cards: [
    { id: 'c1', q: '虚拟语气是什么？', a: '表示与事实相反或假设的语气', topic: '英语', from: '英语课·虚拟语气', status: 'active', version: 1, history: [], createdAt: now - DAY, updatedAt: now - DAY },
    { id: 'c2', q: '今日新卡', a: 'x', topic: '日常', from: '碎念', status: 'active', version: 1, history: [], createdAt: now, updatedAt: now },
  ],
  todos: [
    { id: 't1', text: '还图书馆的书', due: '', from: '英语课·虚拟语气', done: false, archived: false, visibleFrom: yStr, createdAt: now - DAY },
    { id: 't2', text: '周五交英语作文', due: '周五', from: '英语课·虚拟语气', done: false, archived: false, visibleFrom: yStr, createdAt: now - DAY },
    { id: 't3', text: '今天：买晚饭', due: '', from: '手动', done: false, archived: false, visibleFrom: today, createdAt: now },
  ],
  moods: [{ id: 'm1', jobId: 'j2', createdAt: now, emoji: '😌', tags: ['#专注'], moments: [{ t: '20:00', text: '背完单词很踏实' }], score: 4 }],
  dailies: [], weeklies: [], courseNotes: {}, profile: { text: '', updatedAt: 0 }, chats: [], funs: [], exportedFiles: [],
}));

console.log('注入完成：昨日待办×2（还书 / 周五交作文）、昨日卡片×1、今日卡片×1、今日记录×1、心情×1');
console.log('运行 runArchivist()（真实 LLM 决策 carry/drop + 日结）…\n');
await runArchivist();

const st = getState();
let fail = 0;
const check = (name, ok, detail) => { console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' | ' + detail : '')); if (!ok) fail++; };

/* 1. carry/drop 不变量：昨日未完成待办要么挪到今天，要么沉入记忆 */
for (const id of ['t1', 't2']) {
  const t = st.todos.find((x) => x.id === id);
  const carried = !t.archived && t.visibleFrom === today;
  const dropped = t.archived === true;
  check(`待办「${t.text}」→ ${carried ? 'carry（挪到今天）' : dropped ? 'drop（沉入记忆：' + (t.archivedReason || '') + '）' : '未流转！'}`, carried || dropped);
}
/* 2. 今日待办不受影响 */
const t3 = st.todos.find((x) => x.id === 't3');
check('今日待办不受影响', t3 && !t3.archived && t3.visibleFrom === today);
/* 3. 隔天卡片按日失效 / 今日卡片保留 */
check('昨日卡片按日失效', st.cards.find((c) => c.id === 'c1').status === 'archived');
check('今日卡片保留', st.cards.find((c) => c.id === 'c2').status === 'active');
/* 4. 今日有记录 → 生成日结 */
const dKey = `${new Date().getMonth() + 1}.${new Date().getDate()}`;
check('生成今日日结', st.dailies.some((d) => d.date === dKey), st.dailies[0] && `${st.dailies[0].emoji} ${st.dailies[0].summary}`);
/* 5. 归档日标记（当天不重复跑） */
check('lastArchivistDay 已标记', st.lastArchivistDay === today);
/* 6. Agent 工具在归档后的数据上工作 */
const sr = await executeTool('search_memory', { query: '虚拟语气' });
check('search_memory 命中档案', sr.total >= 1, 'total=' + sr.total);
const sr2 = await executeTool('search_memory', { query: '虚拟语气是什么' });
check('search_memory 覆盖卡片（含已归档，知识不丢）', (sr2.hits || []).some((h) => h.type === 'card'), JSON.stringify((sr2.hits || []).map((h) => h.type)));
const gm = await executeTool('get_moods', {});
check('get_moods 返回心情', Array.isArray(gm) && gm.length === 1 && gm[0].score === 4, JSON.stringify(gm));
await executeTool('add_todo', { text: '测试：明天取快递' });
check('add_todo 工具写入', await executeTool('get_todos', { pending_only: true }).some((t) => t.text.includes('取快递')));

console.log(fail ? `\n❌ ${fail} 项失败` : '\n全部通过 🎉');
process.exit(fail ? 1 : 0);
