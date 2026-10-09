/* LLM mock：按 system 提示词返回固定 JSON（供记忆流转状态机验证，不验证文案质量）
 * 常量保留标识性文案，供 llmChat 分流识别 */
export const EXTRACT_SYS = '（mock）提取器';
export const EXTRACT_SYS_CLASS = '你是「团团」——「团子」App 的课堂材料整理器。（mock）';
export const EXTRACT_SYS_CASUAL = '你是「团团」——「团子」App 的灵感闲聊整理器：不输出 cards、不输出课程笔记。（mock）';
export const MIGRATE_SYS = '你是「团团」——「团子」App 的记忆分拣员。（mock）';
export const MERGE_SYS = '（mock）合并引擎';
export const DAILY_SYS = '你是「团团」——「团子」App 的每日整理器。（mock）';
export const REBUILD_SYS = '（mock）重建引擎';
export const SEGMENT_SYS = '（mock）分段整理器';
export const MONTHLY_SYS = '你是「团团」——「团子」App 的月度整理器。（mock）';

export function parseExtractJson(s) {
  const m = String(s).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('mock: 未返回 JSON');
  return JSON.parse(m[0]);
}

export async function llmChat(messages) {
  const sys = String((messages && messages[0] && messages[0].content) || '');
  if (sys.includes('月度整理器')) return '{"summary":"（mock月结）本月主线：高数进阶与社团海报；情绪平稳向好"}';
  if (sys.includes('周记')) return '{"summary":"（mock周记）本周完成高数三章复习，社团海报定稿"}';
  if (sys.includes('每日整理器')) return '{"summary":"（mock日结）今天学了泰勒公式并整理笔记","emoji":"🌤️"}';
  if (sys.includes('待办管家')) return '{"decisions":[]}';
  if (sys.includes('分拣员')) return '{"todos":[{"text":"和室友晚上十点拿快递","due":"今晚"}],"profile_facts":["数据结构吃力，需投入更多时间"]}';
  if (sys.includes('压缩成一份摘要')) return '（mock摘要）用户在测试团子对话：问过待办、心情与卡片，要求添加并修改过待办。';
  return '{}';
}

/* usage 高于窗口 85% → 触发压缩路径 */
let rawCallCount = 0;
export async function llmChatRaw() {
  rawCallCount += 1;
  return {
    choices: [{ message: { content: '（mock 回答）', tool_calls: [] } }],
    usage: { prompt_tokens: 120000, completion_tokens: 10, total_tokens: 120010 },
  };
}

export async function asrRecognize() { return { text: '（mock 转写）' }; }
