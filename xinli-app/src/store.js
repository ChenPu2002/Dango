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
  chats: [],       // 问答历史 {id,q,a,at}（旧→新，最新在底）
  chatsOrder: 'asc',
  lastNightlyAt: 0,
  exportedFiles: [],  // {name, at} 已固化文件清单
  funs: [],        // {id,text,from,at} 有趣的事（不进复习）
};

let state = null;
const listeners = new Set();

/* 兼容旧数据：补齐新字段 */
function normalize(s) {
  return {
    ...DEFAULTS, ...s,
    settings: { ...DEFAULTS.settings, ...((s || {}).settings || {}) },
    courseNotes: s.courseNotes || {},
    profile: s.profile || DEFAULTS.profile,
    dailies: s.dailies || [],
    weeklies: s.weeklies || [],
    lastNightlyAt: s.lastNightlyAt || 0,
    exportedFiles: s.exportedFiles || [],
    funs: s.funs || [],
    chats: s.chatsOrder === 'asc' ? (s.chats || []) : (s.chats || []).slice().reverse(),
    chatsOrder: 'asc',
    cards: (s.cards || []).map((c) => ({ status: 'active', version: 1, history: [], topic: c.from || '日常', ...c })),
    jobs: s.jobs || [],
    todos: s.todos || [],
    moods: s.moods || [],
  };
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
