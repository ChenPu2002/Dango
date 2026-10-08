/* API 客户端：DeepSeek（多模态 LLM）+ 火山 Seed-ASR（录音文件识别大模型） */
import { getState } from './store';

/* ---------- DeepSeek ---------- */
export async function llmChat(messages, maxTokens = 2200) {
  const { llmUrl, llmKey, llmModel } = getState().settings;
  const r = await fetch(llmUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${llmKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: llmModel, messages, max_tokens: maxTokens }),
  });
  const j = await r.json();
  if (!j.choices || !j.choices[0]) throw new Error((j.error && j.error.message) || 'LLM 响应异常');
  return j.choices[0].message.content;
}

/* Agent 用：带 tools 的原始调用，返回完整响应（含 tool_calls） */
export async function llmChatRaw(messages, tools, maxTokens = 1500) {
  const { llmUrl, llmKey, llmModel } = getState().settings;
  const body = { model: llmModel, messages, max_tokens: maxTokens };
  if (tools) body.tools = tools;
  const r = await fetch(llmUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${llmKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'LLM 错误');
  if (!j.choices || !j.choices[0]) throw new Error('LLM 响应异常');
  return j;
}

export const EXTRACT_SYS = `你是「团团」——「团子」App 的手机端学习助理，把用户给的课堂/生活材料提炼成结构化数据。只输出 JSON，不要输出任何其他文字，格式：
{"title":"3-8字标题","summary":"2-3句摘要","outline":["提纲要点"],"keywords":["关键词"],"points":["关键细节/公式/任务"],"cards":[{"q":"复习问题","a":"答案","kind":"knowledge"}],"funs":[{"text":"材料中有趣的见闻/冷知识/彩蛋(1条以内，无则空)"}],"todos":[{"text":"待办事项","due":"截止时间(可空)"}],"mood":{"emoji":"😌","tags":["#标签"],"moments":[{"t":"HH:MM","text":"高光或低谷时刻描述"}],"score":3}}
规则：
1. cards 只允许学科知识类（概念/公式/定义/考点/方法），默认 kind=knowledge；日常安排、约会、购物、心情、追星娱乐等生活内容严禁进 cards——有趣的见闻放 funs，任务放 todos，情绪放 mood；
2. todos 只在材料中真实出现任务/约定/截止时才填，否则为空数组；
3. mood 从语气与内容判断（1=低落 5=很开心），录音必填；照片/文档若与情绪无关可给空对象 {}；
4. 中文材料输出中文；忠于原文，不编造。`;

export function parseExtractJson(s) {
  const m = String(s).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('LLM 未返回 JSON');
  return JSON.parse(m[0]);
}

/* 合并引擎：让记忆“演化而非堆叠” */
export const MERGE_SYS = `你是「团团」——「团子」App 的记忆合并引擎。输入：新材料提取结果 + 现有记忆清单。你的职责是对现有记忆发出操作指令，实现演化而非堆叠。

只输出 JSON 操作指令，不要任何其他文字：
{"cards":{"add":[{"q":"","a":"","topic":"课程名·主题","kind":"knowledge|fun"}],"update":[{"id":"","a":"新答案","reason":"订正|补充"}],"archive":["id"]},"funs":{"add":[{"text":"有趣的事"}]},
"todos":{"add":[{"text":"","due":""}],"done":["id"],"archive":["id"]},
"note":{"course":"课程名","full":"该课程笔记的完整重写版，≤150字，只保留核心知识点/考点/作业，融合旧笔记与新材料（滚动更新，不是追加）"},
"profile":{"full":"基于旧画像+新材料重写后的完整画像，≤120字，滚动更新保持精炼（不是追加）"}}

硬规则：
1. 新材料知识点与现有卡片同义 → 不 add，改 update 补充更完整答案，reason=补充；
2. 新材料订正了旧答案（如作业变更、老师说改） → update 旧卡，reason=订正；
3. 只有全新的学科知识才 add（≤3 张），生活琐事永不 add；有趣见闻（kind=fun 或 funs.add）每日 ≤1 条；
3.5 清理：现有活跃卡片中若有明显与学习无关的（追星/日常/娱乐收藏等），archive 之；
3.6 容量：现有活跃卡片 ≥ 25 张时，每 add 1 张必须同时 archive ≥1 张（优先 box 最高或最久未复习的）；
4. 被覆盖或失去复习价值的卡片 → archive；
5. 待办：同一约定重复出现 → 不 add；材料中说已做完/取消 → done/archive；新任务才 add；
6. note.course 取课程归属（高数/管理学…），日常内容用「日常」；note.full 必须重写为精炼版笔记（吸收旧笔记+新材料），严禁拼接流水账；
7. profile.full 必须输出：吸收旧画像全部有效信息 + 新材料增量，重写为一份 ≤120 字的精炼画像（滚动更新，绝不要简单拼接）。`;

/* ---------- 火山 Seed-ASR 录音文件识别（异步：submit + 轮询 query）---------- */
const ASR_BASE = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel';

function asrCall(path, key, requestId, body) {
  return fetch(ASR_BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'X-Api-Resource-Id': 'volc.seedasr.auc',
      'X-Api-Request-Id': requestId,
      'X-Api-Sequence': '-1',
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

export async function asrRecognize(base64Audio, { format = 'm4a', codec = 'aac', rate = 16000 } = {}, onTick) {
  const key = getState().settings.asrKey;
  const requestId = Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 10);

  await asrCall('/submit', key, requestId, {
    user: { uid: 'xinli-ball' },
    audio: { data: base64Audio, format, codec, rate, bits: 16, channel: 1 },
    request: {
      model_name: 'bigmodel', enable_itn: true, enable_punc: true,
      enable_ddc: false, enable_speaker_info: false, enable_channel_split: false,
      show_utterances: true, vad_segment: false, sensitive_words_filter: '',
    },
  });

  for (let i = 0; i < 40; i++) {
    await new Promise((res) => setTimeout(res, 3000));
    if (onTick) onTick(i + 1);
    let r;
    try { r = await asrCall('/query', key, requestId, {}); } catch (_) { continue; }
    if (r && r.code != null && r.code !== 0) throw new Error(r.message || `ASR 错误 ${r.code}`);
    const text = r && r.result && r.result.text;
    if (text) return { text, utterances: r.result.utterances || [] };
  }
  throw new Error('ASR 超时');
}

/* ---------- 每日小结 ---------- */
export const DAILY_SYS = `你是「团团」——「团子」App 的每日整理器。把当天所有记录的标题与摘要压缩成一句话日结。只输出 JSON：{"summary":"1-2句，说清今天学了什么/做了什么/心情如何","emoji":"😌"}`;

/* 记忆重建：删除记录后从剩余材料重写课程笔记与画像（隐私级联） */
export const REBUILD_SYS = `你是「团团」——「团子」App 的记忆重建引擎。用户刚删除了一条记录，你只根据剩余记录重建衍生记忆。只输出 JSON：
{"courseNotes":{"课程名":"该课程笔记，≤150字，只保留核心知识点/考点/作业"},"profile":{"full":"用户画像，≤120字"}}
硬规则：
1. 只使用给定材料，不得保留任何疑似已删除记录的内容；
2. 每门课一条笔记（课程名从记录标题判断，如 高等数学/英语/日常）；无足够材料的课不要编；
3. profile 涵盖：课程与考试节点、常出现的人、作息与情绪基线、近期目标；材料不足就少写。`;
