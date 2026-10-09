/* 本地数据仓库（AsyncStorage 持久化 + 订阅刷新）
 * 记忆三层：L1 工作记忆(job.extract) / L2 知识层(cards+courseNotes) / L3 画像层(profile) */
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEEPSEEK_KEY, ASR_KEY } from './secrets';

const KEY = 'xinli-store-v2';

export const DEFAULTS = {
  settings: {
    llmUrl: 'https://api.deepseek.com/chat/completions',
    llmKey: DEEPSEEK_KEY,
    llmModel: 'deepseek-flash',
    asrKey: ASR_KEY,
    searchKey: '',   // 可选：博查搜索 API Key（不填走 DuckDuckGo）
    exportRoot: '',  // SAF tree URI（一次授权）
    exportDir: '',   // 固定目录：文档/团子 的确定性 URI
    exportAuto: false,
  },
  jobs: [],        // {..., derived:{cardIds,todoIds}}
  cards: [],       // {id,q,a,topic,from,status:active|archived,version,updatedAt,history:[{a,at,reason}],createdAt}
  todos: [],       // {id,text,due,from,done,createdAt}
  moods: [],       // {id,jobId,createdAt,emoji,tags,moments,score}
  courseNotes: {}, // {课程名: {content, updatedAt}}
  profile: { text: '', updatedAt: 0 },
  dailies: [],     // {date:'10.7', summary, emoji, n} 每日小结（防信息爆炸的第一层压缩）
  weeklies: [],    // {range:'10.1-10.7', summary} 周结（第二层压缩）
  monthlies: [],   // {range:'10.1-10.31', summary} 月结（第三层压缩，支撑长期使用不冗余）
  chats: [],       // （旧字段，迁移为 sessions）
  sessions: [],    // 多会话：{id,title,createdAt,updatedAt,messages:[{id,q,a,steps,actions,at}]}
  currentSessionId: '',
  lastNightlyAt: 0,
  exportedFiles: [],  // {name, at} 已固化文件清单
  funs: [],        // {id,text,from,at} 有趣的事（不进复习）
};

let state = null;
const listeners = new Set();

/* 兼容旧数据：补齐新字段 */
function normalize(s) {
  const st = {
    ...DEFAULTS, ...s,
    settings: { ...DEFAULTS.settings, ...((s || {}).settings || {}) },
    courseNotes: s.courseNotes || {},
    profile: s.profile || DEFAULTS.profile,
    dailies: s.dailies || [],
    weeklies: s.weeklies || [],
    monthlies: s.monthlies || [],
    lastNightlyAt: s.lastNightlyAt || 0,
    exportedFiles: s.exportedFiles || [],
    lastArchivistDay: s.lastArchivistDay || '',
    funs: s.funs || [],
    cards: (s.cards || []).map((c) => ({ status: 'active', version: 1, history: [], topic: c.from || '日常', ...c })),
    jobs: s.jobs || [],
    /* visibleFrom 统一补零 ISO（旧的非补零格式视为立即可见） */
    todos: (s.todos || []).map((t) => ({ visibleFrom: '', archived: false, ...t, visibleFrom: /^\d{4}-\d{2}-\d{2}$/.test(t.visibleFrom || '') ? t.visibleFrom : '' })),
    moods: s.moods || [],
    sessions: s.sessions || [],
    currentSessionId: s.currentSessionId || '',
    chats: [],
  };
  /* 旧单会话 chats → 迁移为一个会话 */
  if (!st.sessions.length && (s.chats || []).length) {
    const id = uid();
    st.sessions = [{ id, title: '较早的对话', createdAt: Date.now(), updatedAt: Date.now(), messages: s.chatsOrder === 'asc' ? s.chats : (s.chats || []).slice().reverse() }];
    st.currentSessionId = id;
  }
  if (st.sessions.length && !st.sessions.some((x) => x.id === st.currentSessionId)) st.currentSessionId = st.sessions[0].id;
  return st;
}

export async function initStore() {
  let saved = null;
  try { saved = JSON.parse(await AsyncStorage.getItem(KEY)); } catch (_) {}
  state = normalize(saved || {});
  /* 迁移旧 key */
  if (!saved) {
    try {
      const old = JSON.parse(await AsyncStorage.getItem('xinli-store-v1'));
      if (old) state = normalize(old);
    } catch (_) {}
  }
  return state;
}
export function getState() { return state; }
export function setState(mutator) {
  state = typeof mutator === 'function' ? mutator(state) : { ...state, ...mutator };
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  listeners.forEach((l) => { try { l(state); } catch (_) {} });
}
export function useStore() {
  const [s, setS] = useState(state);
  useEffect(() => {
    const l = (ns) => setS(ns);
    listeners.add(l);
    setS(state);
    return () => listeners.delete(l);
  }, []);
  return s;
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const fmtTime = (ts) => new Date(ts).toTimeString().slice(0, 5);
export const fmtDate = (ts) => `${new Date(ts).getMonth() + 1}月${new Date(ts).getDate()}日`;

/* 今日键（补零 ISO，字符串字典序比较安全，无时区陷阱）：用于 visibleFrom / lastArchivistDay */
export const todayKeyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ---------- 截止时间归一化：把"周五/明天/10月12日"等解析为当日零点时间戳 ---------- */
export function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function parseDue(text) {
  const t = String(text || '').trim().replace(/\s+/g, '');
  if (!t) return { due: '', dueAt: 0 };
  const now = new Date();
  const mk = (y, m, d) => dayStart(new Date(y, m, d)).getTime();
  let ts = 0;
  const wd = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  const addDays = (n) => dayStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)).getTime();
  let m;
  if ((m = t.match(/^(?:周|星期)([一二三四五六日天])$/))) {
    /* 即将到来的周X；恰是今天 → 约定下周一轮（"周五"在周五说 = 下周五） */
    let diff = (wd[m[1]] - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    ts = addDays(diff);
  } else if ((m = t.match(/^下(?:周|星期)([一二三四五六日天])$/))) {
    /* 下自然周的周X（中文语义：今天周五说"下周三" = 5 天后，不是 12 天后） */
    const wMon = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
    const mondayOffset = (now.getDay() + 6) % 7; /* 今天距本周一 */
    ts = addDays((7 - mondayOffset) + (wMon[m[1]] - 1));
  } else if (t === '明天') ts = addDays(1);
  else if (t === '后天') ts = addDays(2);
  else if (t === '今天' || t === '今晚') ts = addDays(0);
  else if ((m = t.match(/^(\d{1,2})月(\d{1,2})日?$/))) ts = mk(now.getFullYear(), +m[1] - 1, +m[2]);
  else if ((m = t.match(/^(\d{1,2})[\/\-](\d{1,2})$/))) ts = mk(now.getFullYear(), +m[1] - 1, +m[2]);
  return { due: t, dueAt: ts };
}
/* 截止显示：逾期/今天/明天/周X/月日 */
export function dueLabel(dueAt) {
  if (!dueAt) return null;
  const today = dayStart(new Date()).getTime();
  const diff = Math.round((dueAt - today) / 86400000);
  if (diff < 0) return { text: `逾期${-diff}天`, tone: 'over' };
  if (diff === 0) return { text: '今天到期', tone: 'due' };
  if (diff === 1) return { text: '明天到期', tone: 'soon' };
  const d = new Date(dueAt);
  return { text: `${d.getMonth() + 1}月${d.getDate()}日`, tone: 'far' };
}
