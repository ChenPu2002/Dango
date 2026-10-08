import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView, Dimensions } from 'react-native';
import * as Audio from 'expo-audio';
import Svg, { Path } from 'react-native-svg';
import { Card, Section, Chip, ActionSheet, InputSheet, PulseDot, MarkdownText } from '../ui';
import { T } from '../theme';
import { useStore, setState, getState, uid, fmtTime, fmtDate } from '../store';
import { deleteJob, editTodo, deleteTodo, toggleTodo } from '../pipeline';

const KIND = { audio: { icon: '🎧' }, photo: { icon: '📷' }, doc: { icon: '📄' } };

function PlayBtn({ uri }) {
  const player = Audio.useAudioPlayer({ uri });
  const [playing, setPlaying] = useState(false);
  return (
    <Pressable onPress={() => { playing ? player.pause() : player.play(); setPlaying(!playing); }}
      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
      <View style={{ width: 30, height: 30, borderRadius: 99, backgroundColor: T.orange, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 11 }}>{playing ? '⏸' : '▶'}</Text>
      </View>
      <Text style={{ fontSize: 11.5, color: T.orangeDeep, marginLeft: 8, fontWeight: '700' }}>{playing ? '暂停' : '播放原声'}</Text>
    </Pressable>
  );
}

/* ===== 时间线条目 ===== */
function Entry({ j, onMenu }) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const ex = j.extract;
  const processing = j.status !== 'done';
  return (
    <View style={{ position: 'relative', marginBottom: 10, paddingLeft: 20 }}>
      <View style={{ position: 'absolute', left: 0, top: 18, width: 10, height: 10, borderRadius: 99, backgroundColor: '#fff', borderWidth: 2.5, borderColor: processing ? '#C6CBD2' : T.orange }} />
      <Pressable onPress={() => setOpen(!open)} onLongPress={() => !processing && onMenu(j)} delayLongPress={350}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: T.sub, marginRight: 8 }}>{fmtTime(j.createdAt)}</Text>
            <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '700', color: T.text }} numberOfLines={1}>
              {KIND[j.kind].icon} {ex ? (ex.title || j.title) : j.title}
            </Text>
            <Text style={{ fontSize: 11, color: T.sub, transform: [{ rotate: open ? '180deg' : '0deg' }] }}>▾</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {processing ? <Chip text={j.statusText} tone="p" /> : (
              <>
                {ex && ex.cards ? <Chip text={`卡片 ${ex.cards.length} 张`} /> : null}
                {ex && ex.todos && ex.todos.length ? <Chip text={`待办 ${ex.todos.length} 条`} tone="p" /> : null}
                {ex && ex.mood && ex.mood.emoji ? <Chip text={`心情 ${ex.mood.emoji}`} tone="g" /> : null}
              </>
            )}
          </View>
          {open && !processing && ex ? (
            <View style={{ borderTopWidth: 0.5, borderTopColor: T.line, marginTop: 10, paddingTop: 10 }}>
              <MarkdownText text={ex.summary || ''} style={{ fontSize: 12.5, color: T.text2 }} />
              {ex.points && ex.points.length ? (
                <Text style={{ fontSize: 12, color: T.text, lineHeight: 21, marginTop: 6, fontWeight: '500' }}>{ex.points.map((p) => `★ ${p}`).join('\n')}</Text>
              ) : null}
              {ex.keywords && ex.keywords.length ? <Text style={{ fontSize: 11, color: T.sub, marginTop: 6 }}>#{ex.keywords.join('  #')}</Text> : null}
              {j.kind === 'audio' ? <PlayBtn uri={j.uri} /> : null}
              {j.asrText ? (
                <Pressable onPress={() => setShowRaw(!showRaw)} style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.orangeDeep }}>{showRaw ? '收起原文' : '查看转写原文'}</Text>
                  {showRaw ? <Text style={{ fontSize: 11.5, color: T.sub, lineHeight: 19, marginTop: 6 }}>{j.asrText}</Text> : null}
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Card>
      </Pressable>
    </View>
  );
}

/* ===== 今日待办 ===== */
function TodayTodos({ toast }) {
  const s = useStore();
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(null);
  const [edit, setEdit] = useState(null);
  const todayKey = new Date().toDateString();
  const todos = s.todos.filter((t) => !t.archived && !t.done && (!t.visibleFrom || new Date(t.visibleFrom) <= new Date()));
  const doneToday = s.todos.filter((t) => t.done && new Date(t.createdAt).toDateString() === todayKey);
  const add = () => {
    if (!text.trim()) return;
    setState((st) => ({ ...st, todos: [{ id: uid(), text: text.trim(), due: '', from: '手动', done: false, archived: false, createdAt: Date.now(), visibleFrom: `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}` }, ...st.todos] }));
    setText('');
    toast('已添加');
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, flex: 1 }}>✅ 今日待办</Text>
        <Text style={{ fontSize: 11, color: T.sub }}>{todos.length} 件待做{doneToday.length ? ` · ${doneToday.length} 件已完成` : ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        <TextInput value={text} onChangeText={setText} placeholder="记一件今天要做的…" placeholderTextColor={T.sub}
          onSubmitEditing={add} returnKeyType="done"
          style={{ flex: 1, fontSize: 13, color: T.text, backgroundColor: '#F7F8FA', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }} />
        <Pressable onPress={add} style={{ marginLeft: 8, backgroundColor: T.orange, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>添加</Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 4 }}>
        {todos.slice(0, 6).map((t) => (
          <Pressable key={t.id} onPress={() => toggleTodo(t.id)} onLongPress={() => setMenu({ todo: t })} delayLongPress={350}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
            <View style={{ width: 19, height: 19, borderRadius: 6, borderWidth: 1.5, borderColor: T.orange, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Text style={{ fontSize: 11, color: T.orange }}>○</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 13.5, color: T.text }}>{t.text}</Text>
            {t.due ? <Text style={{ fontSize: 10, color: T.red }}>{t.due}</Text> : null}
          </Pressable>
        ))}
        {doneToday.slice(0, 3).map((t) => (
          <Pressable key={t.id} onPress={() => toggleTodo(t.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, opacity: 0.55 }}>
            <View style={{ width: 19, height: 19, borderRadius: 6, backgroundColor: T.orange, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Text style={{ fontSize: 11, color: '#fff' }}>✓</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: T.sub, textDecorationLine: 'line-through' }}>{t.text}</Text>
          </Pressable>
        ))}
        {!todos.length && !doneToday.length ? <Text style={{ fontSize: 11.5, color: T.sub, paddingVertical: 8 }}>录一段音，里面提到的任务会自动出现</Text> : null}
      </View>
      <ActionSheet visible={!!menu} onClose={() => setMenu(null)} title={menu ? menu.todo.text : ''}
        options={menu ? [
          { icon: '✏️', label: '编辑', onPress: () => setEdit({ todo: menu.todo }) },
          { icon: '🗑️', label: '删除', tone: 'danger', onPress: () => { deleteTodo(menu.todo.id); toast('已删除'); } },
        ] : []} />
      <InputSheet visible={!!edit} onClose={() => setEdit(null)} title="编辑待办" initial={edit ? edit.todo.text : ''}
        onSubmit={(v) => { if (edit && v.trim()) { editTodo(edit.todo.id, v.trim()); toast('已更新'); } }} />
    </Card>
  );
}

/* ===== 今日卡片 ===== */
function FlipCard({ c, onGrade, small }) {
  const [flip, setFlip] = useState(false);
  const H = small ? 130 : 180;
  return (
    <Pressable onPress={() => setFlip(!flip)} style={{ width: small ? 200 : 260, marginRight: 10 }}>
      <View style={{
        height: H, borderRadius: 18, padding: 16, justifyContent: 'center',
        backgroundColor: flip ? '#fff' : T.orange, borderWidth: flip ? 2 : 0, borderColor: T.orangeSoft,
        shadowColor: '#F97C1F', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
      }}>
        {flip ? (
          <Text style={{ fontSize: small ? 12 : 14, color: T.text, lineHeight: small ? 18 : 22, textAlign: 'center' }}>{c.a}</Text>
        ) : (
          <Text style={{ fontSize: small ? 13 : 16, fontWeight: '800', color: '#fff', textAlign: 'center', lineHeight: small ? 19 : 24 }}>{c.q}</Text>
        )}
      </View>
      {onGrade ? (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Pressable onPress={() => onGrade(false)} style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#F5B8B0', backgroundColor: T.redSoft, alignItems: 'center', paddingVertical: 8, marginRight: 6 }}>
            <Text style={{ fontSize: 12, color: T.red, fontWeight: '700' }}>再看看</Text>
          </Pressable>
          <Pressable onPress={() => onGrade(true)} style={{ flex: 1, borderRadius: 10, backgroundColor: T.orange, alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>会了</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

function TodayCards() {
  const s = useStore();
  const [full, setFull] = useState(false);
  const today = new Date().toDateString();
  const cards = s.cards.filter((c) => c.status === 'active' && new Date(c.createdAt).toDateString() === today);
  const grade = (c, up) => setState((st) => ({ ...st, cards: st.cards.map((x) => (x.id === c.id ? { ...x, box: up ? (x.box || 0) + 1 : 0 } : x)) }));
  if (!cards.length) return null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, flex: 1 }}>今日卡片</Text>
        <Pressable onPress={() => setFull(true)}>
          <Text style={{ fontSize: 11.5, color: T.orangeDeep, fontWeight: '700' }}>复习全部</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ paddingHorizontal: 2 }}>
        {cards.slice(0, 5).map((c) => <FlipCard key={c.id} c={c} small />)}
      </ScrollView>
      <Modal visible={full} animationType="slide" onRequestClose={() => setFull(false)}>
        <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: 60, paddingHorizontal: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: T.text, flex: 1 }}>今日复习 · {cards.length} 张</Text>
            <Pressable onPress={() => setFull(false)} style={{ backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, color: T.sub, fontWeight: '600' }}>完成</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 40 }}>
            {cards.map((c) => (
              <View key={c.id} style={{ marginBottom: 8 }}>
                <FlipCard c={c} onGrade={(up) => grade(c, up)} />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </Card>
  );
}

/* ===== 主页面 ===== */
export default function Today({ toast, goAsk, goJournal }) {
  const s = useStore();
  const [menu, setMenu] = useState(null);
  const latestMood = s.moods[0];
  const todayDigest = (s.dailies || []).find((d) => d.date === `${new Date().getMonth() + 1}.${new Date().getDate()}`);
  const todayJobs = s.jobs.filter((j) => new Date(j.createdAt).toDateString() === new Date().toDateString());
  const doneJobs = todayJobs.filter((j) => j.status === 'done');

  const moodState = (v) => v >= 4 ? { en: 'PERFECT', zh: '状态极佳', color: '#2FA47A' } : v >= 3 ? { en: 'GOOD', zh: '状态不错', color: '#6BBF59' } : v >= 2 ? { en: 'BAD', zh: '有点低落', color: '#F5A623' } : { en: 'BOOM', zh: '需要休息', color: '#F04C3C' };

  return (
    <View>
      <View style={{ paddingHorizontal: 2, marginTop: 10 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: T.text }}>{fmtDate(Date.now())} · 今天</Text>
        <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 2 }}>
          {doneJobs.length}/{todayJobs.length} 条记录 · 待办 {s.todos.filter((t) => !t.done && !t.archived).length} 件 · 卡片 {s.cards.filter((c) => c.status === 'active' && new Date(c.createdAt).toDateString() === new Date().toDateString()).length} 张
        </Text>
      </View>

      {/* 心情四态 */}
      {latestMood ? (() => {
        const st = moodState(latestMood.score || 3);
        const list = s.moods.slice(0, 7).reverse();
        const W = 300, H = 40;
        const pts = list.length > 1 ? list.map((m, i) => ({ x: 10 + (i * (W - 20)) / (list.length - 1), y: H - 6 - (m.score || 3) * 6 })) : null;
        let d = '';
        if (pts) { d = `M${pts[0].x},${pts[0].y}`; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]; d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`; } }
        return (
          <Card style={{ paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: st.color, letterSpacing: 0.5 }}>{st.en}</Text>
              <Text style={{ fontSize: 12, color: T.sub, marginLeft: 8 }}>{st.zh}</Text>
              <Text style={{ fontSize: 14, marginLeft: 6 }}>{latestMood.emoji}</Text>
              <View style={{ flex: 1 }} />
              {(latestMood.tags || []).slice(0, 2).map((t) => (
                <View key={t} style={{ backgroundColor: '#FFF0F4', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 4 }}>
                  <Text style={{ fontSize: 10, color: T.red }}>{t}</Text>
                </View>
              ))}
            </View>
            {pts ? <View style={{ marginTop: 6 }}><Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}><Path d={d} fill="none" stroke={T.orange} strokeWidth="2" strokeLinecap="round" /></Svg></View> : null}
            {(latestMood.moments || []).slice(0, 1).map((mo, i) => (
              <Text key={i} style={{ fontSize: 11, color: T.text2, lineHeight: 17, marginTop: 4 }}>{mo.text}</Text>
            ))}
          </Card>
        );
      })() : null}

      <TodayTodos toast={toast} />
      <TodayCards />

      {todayDigest ? (
        <Card style={{ backgroundColor: '#FFF6EF', borderWidth: 0, paddingVertical: 10 }}>
          <Text style={{ fontSize: 11.5, color: '#8A5570', lineHeight: 17 }}>📝 今日小结：{todayDigest.summary}</Text>
        </Card>
      ) : null}

      <Section title="今日记录" right={s.jobs.length ? `${s.jobs.length} 条` : ''}>
        {s.jobs.length ? (
          <View style={{ marginTop: 4 }}>
            {s.jobs.slice(0, 8).map((j) => <Entry key={j.id} j={j} onMenu={setMenu} />)}
            {s.jobs.length > 8 ? (
              <Pressable onPress={goJournal} style={{ alignSelf: 'center', padding: 8 }}>
                <Text style={{ fontSize: 12, color: T.orangeDeep, fontWeight: '700' }}>更多历史 → 手帐</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
            <Text style={{ fontSize: 28 }}>⏺</Text>
            <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 8, lineHeight: 20 }}>点下方录音键开始第一条记录{'\n'}说到的任务和知识点会自动整理</Text>
          </Card>
        )}
      </Section>

      <ActionSheet visible={!!menu} onClose={() => setMenu(null)} title={menu ? menu.job.title : ''}
        options={menu ? [
          { icon: '🗑️', label: '删除本条记录', tone: 'danger', onPress: async () => { await deleteJob(menu.job.id); toast('已删除'); } },
          { icon: '🧹', label: '删除记录及其产物', tone: 'danger', onPress: async () => { await deleteJob(menu.job.id, true); toast('已删除记录及产物'); } },
        ] : []} />
    </View>
  );
}
