/* 记忆分层流转验证（mock LLM 跑真代码状态机）：
 * 注入 70 天/20 天/2 天前的记录 + 过期 dailies/weeklies，跑 nightlyMaintenance(true)，
 * 验证：14 天转写瘦身、60 天深冷、周结、月结（生成并从周记清移）、旧音频清理、卡片降温。
 * 注：LLM 文案为 mock，此处验证的是流转状态机不变量；LLM 压缩质量在真机（已配 key）端到端覆盖。
 * 用法：node --import ./scripts/register-mockllm.mjs scripts/test-memory-flow.mjs */
const { initStore, getState, setState } = await import('../src/store.js');
const { nightlyMaintenance } = await import('../src/pipeline.js');

const DAY = 864e5;
const now = Date.now();
const mkJob = (id, ageDays, asrText) => ({
  id, kind: 'audio', title: `记录${id}`, status: 'done', createdAt: now - ageDays * DAY,
  uri: `file:///mock/xinli-recordings/${id}.m4a`, asrText,
  extract: { title: `记录${id}`, summary: `${id} 的摘要：高数泰勒公式`, points: ['要点1', '要点2'], cards: [] },
});

await initStore();
setState(() => ({
  settings: getState().settings,
  jobs: [
    mkJob('j-old70', 70, '七十天前的长转写。'.repeat(300)),   /* 2700 字 → 期待深冷 */
    mkJob('j-mid20', 20, '二十天前的转写。'.repeat(200)),     /* 1800 字 → 期待瘦身到 ~300 字 */
    mkJob('j-new2', 2, '两天前的转写，应原样保留。'),
  ],
  cards: [
    { id: 'c-hot', q: '新卡', a: 'x', status: 'active', box: 0, createdAt: now - 2 * DAY, updatedAt: now - 2 * DAY },
    { id: 'c-cool', q: '已掌握旧卡', a: 'x', status: 'active', box: 3, createdAt: now - 30 * DAY, updatedAt: now - 30 * DAY }, /* box≥2 且 7 天未动 → 降温 */
  ],
  todos: [], moods: [],
  dailies: Array.from({ length: 8 }, (_, i) => ({ date: `9.${20 + i}`, summary: `9月${20 + i}日小结`, emoji: '🌤️', n: 2 })), /* >7 天 → 周结素材 */
  weeklies: [
    { range: '8.1-8.7', summary: '八月第一周' },
    { range: '8.8-8.14', summary: '八月第二周' },
    { range: '8.15-8.21', summary: '八月第三周' },
  ], /* 3 条 >30 天 → 月结素材 */
  monthlies: [],
  courseNotes: {}, profile: { text: '', updatedAt: 0 }, chats: [], sessions: [], funs: [], exportedFiles: [],
}));

console.log('注入：70/20/2 天前记录各1 · 过期 dailies×8 · 过期 weeklies×3 · box3 旧卡×1');
console.log('运行 nightlyMaintenance(true)…\n');
const did = await nightlyMaintenance(true);
console.log('维护报告:', (did || []).join('、'), '\n');

const st = getState();
let fail = 0;
const check = (name, ok, detail) => { console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' | ' + detail : '')); if (!ok) fail++; };

const j70 = st.jobs.find((j) => j.id === 'j-old70');
const j20 = st.jobs.find((j) => j.id === 'j-mid20');
const j2 = st.jobs.find((j) => j.id === 'j-new2');

/* ① 深冷（>60 天）：转写删除、提炼只留标题+摘要 */
check('70天记录→深冷：转写清空', j70.deepSlimmed === true && j70.asrText === '', `asrText长度=${(j70.asrText || '').length}`);
check('70天记录→深冷：提炼只留 title/summary', j70.extract && j70.extract.title === '记录j-old70' && j70.extract.summary && !j70.extract.points, Object.keys(j70.extract || {}).join(','));

/* ② 瘦身（14-60 天）：转写保留 300 字 + 标记 */
check('20天记录→转写瘦身到 ~300 字', j20.slimmed === true && j20.asrText.length > 300 && j20.asrText.length < 360 && j20.asrText.includes('已瘦身'), `长度=${j20.asrText.length}`);

/* ③ 新记录不动 */
check('2天记录原样保留', !j2.slimmed && !j2.deepSlimmed && j2.asrText === '两天前的转写，应原样保留。');

/* ④ 周结：8 条过期 dailies → 1 条周记 */
const mockWeek = st.weeklies.find((w) => (w.summary || '').includes('mock周记'));
check('过期日结→压缩成周记', !!mockWeek, mockWeek && mockWeek.range);

/* ⑤ 月结：3 条 >30 天周记 → 1 条月结，并从周记中移除 */
const mockMonth = st.monthlies && st.monthlies.find((m) => (m.summary || '').includes('mock月结'));
const oldWeeksGone = !st.weeklies.some((w) => ['8.1-8.7', '8.8-8.14', '8.15-8.21'].includes(w.range));
check('过期周记→压缩成月结', !!mockMonth, mockMonth && mockMonth.range);
check('已压缩周记从周记列表移除（不重复留存）', oldWeeksGone, `剩余周记=${st.weeklies.map((w) => w.range).join('、')}`);

/* ⑥ 旧音频清理（>7 天）：uri 置空 */
check('>7天录音文件已清理', j70.uri === null && j20.uri === null && j2.uri !== null);

/* ⑦ 卡片降温：box≥2 且 7 天未动 */
check('已掌握卡片降温归档', st.cards.find((c) => c.id === 'c-cool').status === 'archived' && st.cards.find((c) => c.id === 'c-hot').status === 'active');

/* ⑧ 补日结：2 天前记录的日期缺日结 → 补上 */
const d2 = `${new Date(now - 2 * DAY).getMonth() + 1}.${new Date(now - 2 * DAY).getDate()}`;
check('缺失日结已补', st.dailies.some((d) => d.date === d2));

check('lastNightlyAt 已记录', st.lastNightlyAt > 0);

console.log(fail ? `\n❌ ${fail} 项失败` : '\n全部通过 🎉');
process.exit(fail ? 1 : 0);
