/* 双场景录音 + 日常迁移 + 联网工具 验证（mock LLM 跑真代码；web_fetch 真联网）
 * 用法：node --import ./scripts/register-mockllm.mjs scripts/test-dualmode.mjs */
const { initStore, getState, setState } = await import('../src/store.js');
const { executeTool, humanizeResult, TOOLS } = await import('../src/agent.js');
const { migrateLegacyCasual } = await import('../src/pipeline.js');
const { EXTRACT_SYS_CLASS, EXTRACT_SYS_CASUAL, SEGMENT_SYS, MERGE_SYS } = await import('../src/api.js');

await initStore();
let fail = 0;
const check = (name, ok, detail) => { console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' | ' + detail : '')); if (!ok) fail++; };

/* ---- ① 双场景提示词分流（策略断言；LLM 实际遵循度由真机端到端验证）---- */
check('CLASS 策略：课堂语义 + 卡片通道', EXTRACT_SYS_CLASS.includes('课堂') && EXTRACT_SYS_CLASS.includes('cards'));
check('CASUAL 策略：明确禁止课程笔记与卡片', EXTRACT_SYS_CASUAL.includes('不输出 cards') && EXTRACT_SYS_CASUAL.includes('不输出课程笔记'));
check('CASUAL 策略：待办/心情/画像事实通道', EXTRACT_SYS_CASUAL.includes('todos') && EXTRACT_SYS_CASUAL.includes('profile_facts') && EXTRACT_SYS_CASUAL.includes('mood'));
check('CLASS/MERGE 均含转写纠错原则（纯提示词，无词典）', EXTRACT_SYS_CLASS.includes('转写纠错') && EXTRACT_SYS_CASUAL.includes('转写纠错') && SEGMENT_SYS.includes('转写纠错'));
check('MERGE：casual 不进 note', MERGE_SYS.includes('mode=casual 的材料：note 必须为空'));

/* ---- ② 日常笔记迁移（真代码状态机，mock LLM）---- */
setState(() => ({
  settings: getState().settings,
  jobs: [], cards: [], todos: [], moods: [], dailies: [], weeklies: [], monthlies: [],
  courseNotes: {
    日常: { content: '和室友约好晚上十点拿快递。数据结构有点难要多花时间。背了50个单词。', updatedAt: Date.now() },
    高等数学: { content: '泰勒公式', updatedAt: Date.now() },
  },
  profile: { text: '大二学生', updatedAt: Date.now() }, chats: [], sessions: [], funs: [], exportedFiles: [],
}));
const migrated = await migrateLegacyCasual();
const st1 = getState();
check('迁移执行成功', migrated === true);
check('「日常」键已删除（杂物抽屉消失）', !st1.courseNotes['日常'] && !!st1.courseNotes['高等数学']);
check('约定 → 待办（带截止解析通道）', st1.todos.some((t) => t.text.includes('拿快递')));
check('学情 → 画像（profile 吸收事实）', (st1.profile.text || '').includes('数据结构'));
check('幂等：再跑一次不重复', (await migrateLegacyCasual()) === false && getState().todos.filter((t) => t.text.includes('拿快递')).length === 1);

/* ---- ③ 联网工具（真网络）---- */
const wf = await executeTool('web_fetch', { url: 'https://www.baidu.com' });
check('web_fetch 抓取网页正文', !!wf.text && wf.text.length > 20, (wf.error || (wf.title || '') + ' len=' + (wf.text || '').length).slice(0, 50));
const hw = humanizeResult('web_fetch', wf);
check('web_fetch 结果人读化', hw.includes('http'));
const ws = await executeTool('web_search', { query: 'test' });
check('web_search 不抛异常（成功或明确 error）', !!(ws.results || ws.error), ws.error || `engine=${ws.engine} n=${(ws.results || []).length}`);
check('web_search 已注册到工具目录', TOOLS.some((t) => t.function.name === 'web_search') && TOOLS.some((t) => t.function.name === 'web_fetch'));

console.log(fail ? `\n❌ ${fail} 项失败` : '\n全部通过 🎉');
process.exit(fail ? 1 : 0);
