/* 对话：多会话 + 左侧滑出抽屉（Agent Runtime 前端） */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform, Modal, Animated, Dimensions } from 'react-native';
import { Card, MarkdownText, PulseDot, ActionSheet } from '../ui';
import { Ic } from '../icons';
import { T } from '../theme';
import { useStore, setState, uid, fmtDate } from '../store';
import { runAgent, humanizeArgs, humanizeResult } from '../agent';

const QUICK = ['我最近的作业有哪些？', '上周学了什么？', '帮我记一下周五要交大纲', '我现在心情怎么样？', '把交大纲那条待办挪到下周一'];

/* ===== 工具调用卡（ETA 式：位于回答气泡上方，含参数/结果详情） ===== */
const TOOL_META = {
  web_search: { icon: 'search' },
  web_fetch: { icon: 'doc' },
  search_memory: { icon: 'search' },
  read_transcript: { icon: 'doc' },
  list_records: { icon: 'clock' },
  read_course_note: { icon: 'book' },
  list_courses: { icon: 'book' },
  update_course_note: { icon: 'book' },
  delete_course_note: { icon: 'trash' },
  get_todos: { icon: 'check' },
  get_dailies: { icon: 'calendar' },
  get_moods: { icon: 'mood' },
  get_cards: { icon: 'doc' },
  add_todo: { icon: 'plus' },
  update_todo: { icon: 'pencil' },
  delete_todo: { icon: 'trash' },
  add_card: { icon: 'plus' },
  update_card: { icon: 'pencil' },
  update_profile: { icon: 'user' },
};

function ToolCallCard({ step, active }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[step.name] || { icon: 'sparkle' };
  /* 结果经二次处理：按工具定制人读文案，过滤 id 等机器字段，完整不截断（长内容内嵌滚动） */
  const argsStr = humanizeArgs(step.args);
  const resultStr = humanizeResult(step.name, step.result);
  return (
    <View style={{ borderWidth: 0.5, borderColor: '#E8E2D8', backgroundColor: '#FFFEFB', borderRadius: 12, marginBottom: 6 }}>
      <Pressable onPress={() => setOpen(!open)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9 }, pressed && { opacity: 0.7 }]}>
        <Ic name={meta.icon} size={14} color={T.orangeDeep} />
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.text2, marginLeft: 7, flex: 1 }} numberOfLines={1}>
          {step.brief || step.name}
        </Text>
        {active ? <PulseDot /> : <Ic name="check" size={12} color={T.green} stroke={2.4} />}
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }], marginLeft: 8 }}>
          <Ic name="chevD" size={11} color="#C6BFB4" stroke={2.2} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ borderTopWidth: 0.5, borderTopColor: '#EFEAE1', paddingHorizontal: 10, paddingTop: 7, paddingBottom: 9 }}>
          <Text style={{ fontSize: 9, color: '#C6BFB4', fontWeight: '700', letterSpacing: 0.3, marginBottom: 3 }}>{step.name}</Text>
          <Text style={{ fontSize: 10.5, color: T.sub, lineHeight: 16 }}>
            <Text style={{ fontWeight: '800', color: '#B7B0A4' }}>参数 </Text>
            {argsStr || '（无）'}
          </Text>
          <View style={{ marginTop: 4 }}>
            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
              <Text style={{ fontSize: 10.5, color: T.sub, lineHeight: 16, paddingBottom: 2 }}>
                <Text style={{ fontWeight: '800', color: '#B7B0A4' }}>结果{'\n'}</Text>
                {resultStr}
              </Text>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActionChips({ actions }) {
  if (!actions || !actions.length) return null;
  const chipText = (a) => {
    const r = a.result || {}, g = a.args || {};
    switch (a.name) {
      case 'add_todo': return `已添加待办：${g.text || ''}`;
      case 'update_todo': return `已改待办：${r.updated || g.text || ''}`;
      case 'complete_todo': return `已完成：${r.completed || g.text || ''}`;
      case 'reopen_todo': return `已恢复：${r.reopened || ''}`;
      case 'delete_todo': return `已删除待办：${r.deleted || ''}`;
      case 'add_card': return `已添加卡片：${String(g.q || '').slice(0, 12)}`;
      case 'update_card': return `已订正卡片：${r.updated || ''}`;
      case 'archive_card': return `已归档卡片：${r.archived || ''}`;
      case 'delete_card': return `已删除卡片：${r.deleted || ''}`;
      case 'update_profile': return '画像已更新';
      case 'update_course_note': return `《${g.course || ''}》笔记已更新`;
      case 'delete_course_note': return `《${r.deleted || g.course || ''}》笔记已删除`;
      default: return null;
    }
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
      {actions.map((a, i) => {
        const txt = chipText(a);
        if (!txt) return null;
        const del = /^delete_/.test(a.name);
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: del ? T.redSoft : T.greenSoft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginTop: 4 }}>
            <Ic name={del ? 'trash' : 'check'} size={11} color={del ? T.red : T.green} stroke={2.4} />
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: del ? T.red : T.green, marginLeft: 4 }}>{txt}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ===== 会话抽屉：从左侧滑入 ===== */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SessionDrawer({ visible, onClose, sessions, currentId, onNew, onSwitch, onDelete }) {
  const W = Math.round(Dimensions.get('window').width * 0.8);
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, { toValue: visible ? 1 : 0, duration: 240, useNativeDriver: true }).start();
  }, [visible]);
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [-W - 20, 0] });
  const dim = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });
  /* 抽屉悬停在 Tab 栏之上，不遮挡底栏（底栏保持可见可点） */
  return (
    <View pointerEvents={visible ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 84 }}>
      <AnimatedPressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', opacity: dim }} />
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: W, backgroundColor: '#FFFDF9', borderRightWidth: 0.5, borderRightColor: T.line, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 6, height: 0 }, elevation: 12, transform: [{ translateX }], paddingTop: 66, paddingHorizontal: 14, borderTopRightRadius: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: T.text, flex: 1 }}>对话记录</Text>
          <Pressable onPress={onNew} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 6 }, pressed && { opacity: 0.6 }]}>
            <Ic name="plus" size={13} color={T.orangeDeep} stroke={2.4} />
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.orangeDeep, marginLeft: 4 }}>新对话</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }}>
          {sessions.map((se) => {
            const on = se.id === currentId;
            return (
              <Pressable key={se.id} onPress={() => { onSwitch(se.id); onClose(); }} onLongPress={() => onDelete(se)} delayLongPress={350}
                android_ripple={{ color: 'rgba(60,40,20,0.05)', foreground: true }}
                style={{ backgroundColor: on ? T.orangeSoft : '#FFFFFF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, marginTop: 8, borderWidth: 0.5, borderColor: on ? '#F0D9C8' : T.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: on ? T.orangeDeep : T.text }} numberOfLines={1}>{se.title || '新对话'}</Text>
                  {on ? <Ic name="chat" size={13} color={T.orangeDeep} /> : null}
                </View>
                <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }}>{(se.messages || []).length} 条 · {fmtDate(se.updatedAt || se.createdAt || Date.now())}</Text>
              </Pressable>
            );
          })}
          {!sessions.length ? <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center', marginTop: 30 }}>还没有对话</Text> : null}
        </ScrollView>
        <Text style={{ fontSize: 10, color: T.sub, paddingVertical: 10, textAlign: 'center' }}>长按对话可删除</Text>
      </Animated.View>
    </View>
  );
}

export default function Ask({ toast, prefill, clearPrefill }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [running, setRunning] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [msgMenu, setMsgMenu] = useState(null);
  const [stopping, setStopping] = useState(false);
  const cancelRef = useRef(false);
  const scrollRef = useRef(null);
  const sessions = s.sessions || [];
  const cur = sessions.find((x) => x.id === s.currentSessionId) || sessions[0];
  const chats = (cur && cur.messages) || [];

  /* 保证至少有一个会话 */
  useEffect(() => {
    if (!cur) {
      const id = uid();
      setState((st) => ({ ...st, sessions: [{ id, title: '新对话', createdAt: Date.now(), updatedAt: Date.now(), messages: [] }], currentSessionId: id }));
    } else if (cur.id !== s.currentSessionId) {
      setState((st) => ({ ...st, currentSessionId: cur.id }));
    }
  }, [cur && cur.id]);

  /* 空会话不保留：没发过消息的会话，在启动/切走/关抽屉时清掉（keepId=正在使用的那个） */
  const pruneEmpty = (keepId) => setState((st) => {
    const kept = st.sessions.filter((se) => (se.messages || []).length || se.id === keepId);
    return kept.length ? { ...st, sessions: kept } : st;
  });
  useEffect(() => { if (cur) pruneEmpty(cur.id); /* eslint-disable-line */ }, []);

  useEffect(() => { if (prefill) { setQ(prefill); clearPrefill(); } }, [prefill]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [chats.length, running]);

  const patchCur = (fn) => setState((st) => ({
    ...st,
    sessions: st.sessions.map((se) => (se.id === cur.id ? { ...fn(se), updatedAt: Date.now() } : se)),
  }));

  /* 发送与重新生成共用一条执行管线（Eta 式上下文：全量历史 + 85% 窗口压缩 + 原文可回查） */
  const runOne = async (chatId, question, prior, ctx = {}) => {
    setRunning(true);
    setStopping(false);
    cancelRef.current = false;
    try {
      const { answer, steps, actions } = await runAgent(question, {
        onStep: (newSteps) => patchCur((se) => ({ ...se, messages: se.messages.map((c) => (c.id === chatId ? { ...c, steps: newSteps } : c)) })),
        cancelled: () => cancelRef.current,
        prior,
        summary: ctx.summary,
        upto: ctx.upto,
        onCompact: (patch) => patchCur((se) => ({ ...se, summary: patch.summary, compactUpto: patch.upto })),
      });
      patchCur((se) => ({ ...se, messages: se.messages.map((c) => (c.id === chatId ? { ...c, a: answer, steps, actions } : c)) }));
    } catch (e) {
      patchCur((se) => ({ ...se, messages: se.messages.map((c) => (c.id === chatId ? { ...c, a: '出错: ' + String((e && e.message) || e).slice(0, 60) } : c)) }));
    }
    setRunning(false);
    setStopping(false);
  };

  const send = async (text) => {
    const question = (text || q).trim();
    if (!question || running || !cur) return;
    setQ('');
    const chatId = uid();
    const prior = cur.messages || [];
    const ctx = { summary: cur.summary, upto: cur.compactUpto || 0 };
    patchCur((se) => ({ ...se, title: se.messages.length ? se.title : question.slice(0, 14), messages: [...se.messages, { id: chatId, q: question, a: '', steps: [], actions: [], at: Date.now() }] }));
    runOne(chatId, question, prior, ctx);
  };

  /* ETA 式消息操作：长按消息 → 重新生成 / 删除这轮 */
  const regen = (c) => {
    if (running || !c.a) return;
    const prior = (cur.messages || []).filter((x) => x.id !== c.id);
    const ctx = { summary: cur.summary, upto: cur.compactUpto || 0 };
    patchCur((se) => ({ ...se, messages: se.messages.map((x) => (x.id === c.id ? { ...x, a: '', steps: [], actions: [] } : x)) }));
    runOne(c.id, c.q, prior, ctx);
  };
  const dropMsg = (c) => {
    patchCur((se) => ({ ...se, messages: se.messages.filter((x) => x.id !== c.id) }));
    toast('已删除这轮对话');
  };

  const newSession = () => {
    const id = uid();
    /* 新建时顺带清掉旧的空会话（连点新建不留一串空白记录） */
    setState((st) => ({ ...st, sessions: [{ id, title: '新对话', createdAt: Date.now(), updatedAt: Date.now(), messages: [] }, ...st.sessions.filter((se) => (se.messages || []).length)], currentSessionId: id }));
    setDrawer(false);
    setQ('');
  };

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 10 }}>
          <Pressable onPress={() => setDrawer(true)} style={({ pressed }) => [{ backgroundColor: '#fff', borderRadius: 99, padding: 8, marginRight: 10 }, pressed && { opacity: 0.6 }]}>
            <Ic name="menu" size={17} color={T.text2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: T.text }} numberOfLines={1}>{(cur && cur.title) || '对话'}</Text>
            <Text style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>团团会自己查记忆再回答 · 也能帮你记事</Text>
          </View>
          <Pressable onPress={newSession} style={({ pressed }) => [{ backgroundColor: '#fff', borderRadius: 99, padding: 8, marginLeft: 10 }, pressed && { opacity: 0.6 }]}>
            <Ic name="edit" size={17} color={T.text2} />
          </Pressable>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}
          onContentSizeChange={() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
          {!chats.length ? (
            <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
              <View style={{ width: 52, height: 52, borderRadius: 99, backgroundColor: T.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ic name="sparkle" size={22} color={T.orange} />
              </View>
              <Text style={{ fontSize: 12, color: T.sub, marginTop: 12 }}>试试这些（团团会真的去查 / 去记）</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
                {QUICK.map((t) => (
                  <Pressable key={t} onPress={() => send(t)} style={({ pressed }) => [{ backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 8, margin: 4 }, pressed && { opacity: 0.6 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: T.orangeDeep }}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {chats.map((c) => (
            <View key={c.id} style={{ marginTop: 18 }}>
              <Pressable onLongPress={() => setMsgMenu(c)} delayLongPress={350}
                style={{ alignSelf: 'flex-end', backgroundColor: T.orange, borderRadius: 18, borderBottomRightRadius: 5, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '78%' }}>
                <Text style={{ fontSize: 13.5, color: '#fff', lineHeight: 21 }}>{c.q}</Text>
              </Pressable>
              {/* 工具调用卡（ETA 式：答案上方，逐个展开详情） */}
              {c.steps && c.steps.length ? (
                <View style={{ marginTop: 10 }}>
                  {c.steps.map((st, i) => (
                    <ToolCallCard key={i} step={st} active={!c.a && i === c.steps.length - 1} />
                  ))}
                </View>
              ) : null}
              {c.a ? (
                <Pressable onLongPress={() => setMsgMenu(c)} delayLongPress={350}
                  style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 0.5, borderColor: T.line, borderRadius: 18, borderTopLeftRadius: 5, paddingHorizontal: 14, paddingVertical: 11, maxWidth: '88%', ...T.shadow }}>
                  <MarkdownText text={c.a} style={{ fontSize: 13, color: T.text2 }} />
                  <ActionChips actions={c.actions} />
                </Pressable>
              ) : (
                <View style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 0.5, borderColor: T.line, borderRadius: 18, borderTopLeftRadius: 5, paddingHorizontal: 14, paddingVertical: 11, maxWidth: '88%', ...T.shadow }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <PulseDot />
                    <Text style={{ fontSize: 12, color: T.sub, marginLeft: 8 }}>团团思考中…</Text>
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 90, backgroundColor: T.bg }}>
          <TextInput value={q} onChangeText={setQ} placeholder="问点什么，或让团团记点事…" placeholderTextColor={T.sub}
            onSubmitEditing={() => send()} returnKeyType="send"
            style={{ flex: 1, fontSize: 13.5, color: T.text, backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11, ...T.shadow }} />
          {running ? (
            <Pressable onPress={() => { if (!stopping) { setStopping(true); cancelRef.current = true; } }} disabled={stopping}
              style={({ pressed }) => [{ marginLeft: 10, backgroundColor: T.redSoft, borderWidth: 1.5, borderColor: '#F0C4BE', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11, opacity: stopping ? 0.5 : 1 }, pressed && { opacity: 0.7 }]}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: T.red }}>{stopping ? '停止中…' : '停止'}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => send()} style={({ pressed }) => [{ marginLeft: 10, backgroundColor: q.trim() ? T.orange : '#E8E4DD', borderRadius: 99, paddingHorizontal: 18, paddingVertical: 11 }, pressed && { opacity: 0.7 }]}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>发送</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <SessionDrawer
        visible={drawer} onClose={() => { setDrawer(false); if (cur) pruneEmpty(cur.id); }}
        sessions={sessions} currentId={s.currentSessionId}
        onNew={newSession}
        onSwitch={(id) => { setState((st) => ({ ...st, currentSessionId: id })); pruneEmpty(id); }}
        onDelete={(se) => setDelTarget(se)}
      />
      <ActionSheet visible={!!delTarget} onClose={() => setDelTarget(null)} title={delTarget ? (delTarget.title || '新对话') : ''}
        options={delTarget ? [{ icon: 'trash', label: '删除该对话', tone: 'danger', onPress: () => {
          setState((st) => {
            const rest = st.sessions.filter((x) => x.id !== delTarget.id);
            return { ...st, sessions: rest, currentSessionId: st.currentSessionId === delTarget.id ? ((rest[0] && rest[0].id) || '') : st.currentSessionId };
          });
          toast('对话已删除');
        } }] : []} />
      <ActionSheet visible={!!msgMenu} onClose={() => setMsgMenu(null)} title={msgMenu ? String(msgMenu.q || '').slice(0, 30) : ''}
        options={msgMenu ? [
          ...(msgMenu.a ? [{ icon: 'sync', label: '重新生成回答', onPress: () => regen(msgMenu) }] : []),
          { icon: 'trash', label: '删除这轮对话', tone: 'danger', onPress: () => dropMsg(msgMenu) },
        ] : []} />
    </View>
  );
}
