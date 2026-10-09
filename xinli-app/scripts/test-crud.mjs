/* Agent CRUD 工具 + 长录音分块 + 结果人读化 验证（不依赖 LLM key）
 * 用法：node --import ./scripts/register.mjs scripts/test-crud.mjs */
const { initStore, getState, setState } = await import('../src/store.js');
const { executeTool, humanizeArgs, humanizeResult } = await import('../src/agent.js');
const { splitText } = await import('../src/pipeline.js');

await initStore();
setState(() => ({
  settings: getState().settings,
  jobs: [], cards: [], todos: [], moods: [], dailies: [], weeklies: [], monthlies: [],
  courseNotes: { 高等数学: { content: '极限与泰勒公式', updatedAt: Date.now() } },
  profile: { text: '', updatedAt: 0 }, chats: [], sessions: [], funs: [], exportedFiles: [],
}));

let fail = 0;
const check = (name, ok, detail) => { console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' | ' + detail : '')); if (!ok) fail++; };

/* ---- 待办 CRUD ---- */
await executeTool('add_todo', { text: '周五交论文初稿', due: '周五' });
const todos = await executeTool('get_todos', { pending_only: true });
const t1 = todos.find((t) => t.text.includes('论文'));
const t1raw = getState().todos.find((t) => t.text.includes('论文'));
check('add_todo + due 解析', !!t1 && t1.due === '周五' && t1raw.dueAt > 0 && !!t1.dueText, JSON.stringify(t1 || {}));
const up = await executeTool('update_todo', { id: t1.id, due: '明天' });
const t1b = await executeTool('get_todos', {}).find((t) => t.id === t1.id);
check('update_todo 改截止', up.ok && t1b.due === '明天', `${t1b.due} dueAt=${t1b.dueAt}`);
await executeTool('update_todo', { id: t1.id, text: '周五交论文终稿' });
check('update_todo 改文本', await executeTool('get_todos', {}).some((t) => t.id === t1.id && t.text.includes('终稿')));
await executeTool('complete_todo', { text: '终稿' });
check('complete_todo 模糊匹配', await executeTool('get_todos', { pending_only: false }).find((t) => t.id === t1.id).done === true);
const ro = await executeTool('reopen_todo', { id: t1.id });
check('reopen_todo 恢复', ro.ok && await executeTool('get_todos', { pending_only: true }).some((t) => t.id === t1.id));
const dl = await executeTool('delete_todo', { id: t1.id });
check('delete_todo 删除', dl.ok && !await executeTool('get_todos', { pending_only: false }).some((t) => t.id === t1.id), dl.deleted);

/* ---- 卡片 CRUD ---- */
await executeTool('add_card', { q: '泰勒公式的作用？', a: '多项式局部逼近', topic: '高等数学' });
const cards = await executeTool('get_cards', {});
const c1 = cards.find((c) => c.q.includes('泰勒'));
check('add_card + get_cards', !!c1 && c1.status === 'active');
await executeTool('update_card', { id: c1.id, a: '用多项式逼近复杂函数，误差由余项控制', reason: '补充' });
check('update_card 订正', getState().cards.find((c) => c.id === c1.id).a.includes('余项'));
await executeTool('archive_card', { id: c1.id });
check('archive_card 归档', getState().cards.find((c) => c.id === c1.id).status === 'archived');
check('归档后 active_only 过滤', !await executeTool('get_cards', {}).some((c) => c.id === c1.id));
await executeTool('delete_card', { id: c1.id });
check('delete_card 彻底删除', !getState().cards.some((c) => c.id === c1.id));

/* ---- 课程笔记 ---- */
await executeTool('update_course_note', { course: '高等数学', full: '极限、导数、泰勒公式；期中第三~五章' });
check('update_course_note', getState().courseNotes['高等数学'].content.includes('期中'));
const lc = await executeTool('list_courses', {});
check('list_courses', Array.isArray(lc) && lc.some((c) => c.course === '高等数学'));
const dcn = await executeTool('delete_course_note', { course: '高等数学' });
check('delete_course_note', dcn.ok && !getState().courseNotes['高等数学']);

/* ---- 结果人读化：无 id / dueAt 等机器字段 ---- */
await executeTool('add_todo', { text: '给妈妈打电话', due: '周日' });
const hTodos = humanizeResult('get_todos', await executeTool('get_todos', {}));
check('humanizeResult(get_todos) 无 id', !/\bid["：:]/.test(hTodos), hTodos.replace(/\n/g, ' | '));
const hArgs = humanizeArgs({ id: 'xxx', text: '内容', due: '周五' });
check('humanizeArgs 过滤 id', !hArgs.includes('xxx') && hArgs.includes('截止：周五'), hArgs);
const hSearch = humanizeResult('search_memory', { total: 0, hits: [] });
check('humanizeResult 空结果', hSearch.includes('命中 0'));
const hUnk = humanizeResult('some_future_tool', { a: 1 });
check('humanizeResult 未知工具兜底 JSON', hUnk.includes('a'));

/* ---- 长录音分块 ---- */
const para = '这是一个用来测试分块的句子。'.repeat(300); /* 15 字 ×300 = 4500 字 */
const long = para + '尾巴句。';
const chunks = splitText(long, 1000);
check('splitText 块数>1 且总长不变', chunks.length > 1 && chunks.join('') === long, `${chunks.length} 块`);
check('splitText 每块不撕裂句子（块尾为句读）', chunks.every((c) => /[。！？；\n]/.test(c.slice(-1)) || c === long.slice(-4)), chunks.map((c) => c.slice(-3)).join(' '));
const short = splitText('短文本。', 1000);
check('splitText 短文本不分块', short.length === 1 && short[0] === '短文本。');

console.log(fail ? `\n❌ ${fail} 项失败` : '\n全部通过 🎉');
process.exit(fail ? 1 : 0);
