import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView, Dimensions, Alert } from 'react-native';
import * as Audio from 'expo-audio';
import Svg, { Path } from 'react-native-svg';
import { Card, Section, Chip, ActionSheet, Sheet, Btn, PulseDot, MarkdownText } from '../ui';
import { Ic } from '../icons';
import { T } from '../theme';
import { useStore, setState, uid, fmtTime, fmtDate, dueLabel, dayStart, todayKeyISO } from '../store';
import { deleteJob, updateTodo, deleteTodo, toggleTodo, retryJob } from '../pipeline';

const KIND = { audio: { icon: 'mic' }, photo: { icon: 'camera' }, doc: { icon: 'doc' } };

function PlayBtn({ uri }) {
  const player = Audio.useAudioPlayer({ uri });
  const [playing, setPlaying] = useState(false);
  return (
    <Pressable onPress={() => { playing ? player.pause() : player.play(); setPlaying(!playing); }}
      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
      <View style={{ width: 30, height: 30, borderRadius: 99, backgroundColor: T.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ic name={playing ? 'pause' : 'play'} size={13} color={T.orangeDeep} />
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
            <Ic name={KIND[j.kind].icon} size={15} color={T.orangeDeep} />
            <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '700', color: T.text, marginLeft: 7 }} numberOfLines={1}>
              {ex ? (ex.title || j.title) : j.title}
            </Text>
            <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
              <Ic name="chevD" size={15} color="#C6BFB4" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {processing ? (
              <>
                <Chip text={j.error ? '失败：' + String(j.error).slice(0, 18) : j.statusText} tone={j.status === 'error' ? 'r' : 'p'} />
                {(j.status === 'error' || Date.now() - j.createdAt > 10 * 60000) ? (
                  <Pressable onPress={() => retryJob(j.id)} style={{ backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3, marginLeft: 6, marginTop: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: T.orangeDeep }}>重试</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
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

/* ===== 待办编辑弹层：内容 + 截止（快捷 chips + 自然语言自定义）===== */
const DUE_CHIPS = ['无', '今天', '明天', '后天', '下周'];

function TodoEditSheet({ visible, onClose, initial, onSubmit }) {
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [custom, setCustom] = useState('');
  useEffect(() => {
    if (visible) { setText((initial && initial.text) || ''); setDue((initial && initial.due) || ''); setCustom(''); }
  }, [visible]);
  const submit = () => {
    if (!text.trim()) { onClose(); return; }
    const raw = custom.trim() || due;
    onSubmit(text.trim(), raw === '无' ? '' : raw); /* "无" = 清除截止 */
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: T.text, marginBottom: 12 }}>编辑待办</Text>
      <TextInput value={text} onChangeText={setText} placeholder="待办内容…" placeholderTextColor={T.sub} autoFocus
        style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 14, color: T.text }} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginTop: 14, marginBottom: 8 }}>截止时间</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {DUE_CHIPS.map((c) => (
          <Pressable key={c} onPress={() => { setDue(c); setCustom(''); }}
            style={{ borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, marginBottom: 6, backgroundColor: due === c && !custom ? T.orange : '#F3F0EA' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: due === c && !custom ? '#fff' : T.sub }}>{c}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={custom} onChangeText={(v) => { setCustom(v); if (v) setDue(''); }} placeholder={'自定义：周五 / 11月2日 / 下周三…'}
        placeholderTextColor={T.sub} returnKeyType="done"
        style={{ backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: T.text, marginTop: 4 }} />
      <Btn text="保存" onPress={submit} style={{ marginTop: 14 }} />
    </Sheet>
  );
}

/* ===== 今日待办 ===== */
function TodayTodos({ toast }) {
  const s = useStore();
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(null);
  const [edit, setEdit] = useState(null);
  const todayStart = dayStart(new Date()).getTime();
  const tk = todayKeyISO();
  const visible = (t) => !t.archived && (!t.visibleFrom || t.visibleFrom <= tk);
  const pending = s.todos.filter((t) => !t.done && visible(t));
  const doneToday = s.todos.filter((t) => t.done && visible(t));
  const carried = (t) => t.visibleFrom && t.visibleFrom < tk;
  const add = () => {
    if (!text.trim()) return;
    setState((st) => ({ ...st, todos: [{ id: uid(), text: text.trim(), due: '', from: '手动', done: false, archived: false, createdAt: Date.now(), visibleFrom: todayKeyISO() }, ...st.todos] }));
    setText('');
  };
  const DueBadge = ({ t }) => {
    const l = dueLabel(t.dueAt);
    if (!l) return t.due ? <Text style={{ fontSize: 10, color: T.sub, marginLeft: 6 }}>{t.due}</Text> : null;
    const hot = l.tone === 'over' || l.tone === 'due';
    const c = hot ? T.red : l.tone === 'soon' ? T.orangeDeep : T.sub;
    return (
      <View style={{ backgroundColor: hot ? T.redSoft : 'transparent', borderRadius: 6, paddingHorizontal: hot ? 5 : 0, paddingVertical: 2, marginLeft: 8 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: c }}>{l.text}</Text>
      </View>
    );
  };
  /* 行尾 ⋯：显式菜单入口（长按不可发现，删除/改截止都走这里） */
  const MoreBtn = ({ t }) => (
    <Pressable onPress={() => setMenu({ todo: t })} hitSlop={8}
      style={({ pressed }) => [{ padding: 6, marginRight: -6 }, pressed && { opacity: 0.5 }]}>
      <Ic name="dots" size={15} color="#C6BFB4" />
    </Pressable>
  );
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, flex: 1 }}>今日待办</Text>
        <Text style={{ fontSize: 11, color: T.sub }}>{pending.length} 件待做{doneToday.length ? ` · 已完成 ${doneToday.length}` : ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        <TextInput value={text} onChangeText={setText} placeholder="记一件今天要做的…" placeholderTextColor={T.sub}
          onSubmitEditing={add} returnKeyType="done"
          style={{ flex: 1, fontSize: 13, color: T.text, backgroundColor: '#F7F4EF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }} />
        <Pressable onPress={add} style={({ pressed }) => [{ marginLeft: 8, backgroundColor: T.orange, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 }, pressed && { opacity: 0.7 }]}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>添加</Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 4 }}>
        {pending.map((t) => (
          <Pressable key={t.id} onPress={() => toggleTodo(t.id)} onLongPress={() => setMenu({ todo: t })} delayLongPress={350}
            android_ripple={{ color: 'rgba(60,40,20,0.05)', foreground: true }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderRadius: 8 }}>
            <View style={{ width: 20, height: 20, borderRadius: 7, borderWidth: 1.6, borderColor: T.orange, alignItems: 'center', justifyContent: 'center', marginRight: 10 }} />
            <Text style={{ flex: 1, fontSize: 13.5, color: T.text }} numberOfLines={2}>{t.text}</Text>
            {carried(t) ? <Text style={{ fontSize: 9.5, color: '#A8A094', marginLeft: 6 }}>遗留</Text> : null}
            <DueBadge t={t} />
            <MoreBtn t={t} />
          </Pressable>
        ))}
        {doneToday.length ? (
          <View style={{ marginTop: 2, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: T.line }}>
            {/* 已完成：点勾选框才恢复（防误触整行），改/删走 ⋯ */}
            {doneToday.map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
                <Pressable onPress={() => toggleTodo(t.id)} hitSlop={6} accessibilityLabel="恢复为未完成"
                  style={({ pressed }) => [{ width: 20, height: 20, borderRadius: 7, backgroundColor: pressed ? '#F0A88C' : T.orange, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, pressed && { opacity: 0.7 }]}>
                  <Ic name="check" size={11} color="#fff" stroke={2.8} />
                </Pressable>
                <Text style={{ flex: 1, fontSize: 13, color: T.sub, textDecorationLine: 'line-through' }} numberOfLines={1}>{t.text}</Text>
                <DueBadge t={t} />
                <MoreBtn t={t} />
              </View>
            ))}
            <Pressable onPress={() => Alert.alert(`清除 ${doneToday.length} 条已完成待办？`, '清除后不可恢复', [
              { text: '取消', style: 'cancel' },
              { text: '清除', style: 'destructive', onPress: () => { doneToday.forEach((t) => deleteTodo(t.id)); toast('已清除完成项'); } },
            ])} style={{ alignSelf: 'flex-end', paddingVertical: 5, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 10.5, color: T.sub }}>清除已完成</Text>
            </Pressable>
          </View>
        ) : null}
        {!pending.length && !doneToday.length ? <Text style={{ fontSize: 11.5, color: T.sub, paddingVertical: 8 }}>录一段音，里面提到的任务会自动出现</Text> : null}
      </View>
      <ActionSheet visible={!!menu} onClose={() => setMenu(null)} title={menu ? menu.todo.text : ''}
        options={menu ? [
          { icon: 'pencil', label: '编辑内容与截止', onPress: () => setEdit({ todo: menu.todo }) },
          ...(menu.todo.done ? [{ icon: 'sync', label: '恢复为未完成', onPress: () => { toggleTodo(menu.todo.id); toast('已恢复'); } }] : []),
          { icon: 'trash', label: '删除', tone: 'danger', onPress: () => { deleteTodo(menu.todo.id); toast('已删除'); } },
        ] : []} />
      <TodoEditSheet visible={!!edit} onClose={() => setEdit(null)} initial={edit ? { text: edit.todo.text, due: edit.todo.due } : {}}
        onSubmit={(newText, newDue) => {
          if (!edit) return;
          updateTodo(edit.todo.id, { text: newText, due: newDue });
          toast(newDue ? `已更新 · 截止 ${newDue}` : '已更新');
        }} />
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
  const active = s.cards.filter((c) => c.status === 'active');
  const fresh = active.filter((c) => new Date(c.createdAt).toDateString() === today);
  const grade = (c, up) => setState((st) => ({ ...st, cards: st.cards.map((x) => (x.id === c.id ? { ...x, box: up ? (x.box || 0) + 1 : 0 } : x)) }));
  /* 空状态也是入口：0 张卡时引导录课产卡，而不是让功能消失 */
  if (!active.length) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, flex: 1 }}>复习卡片</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#FBF6EF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 }}>
          <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: T.orangeSoft, alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
            <Ic name="doc" size={16} color={T.orangeDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.text }}>还没有卡片</Text>
            <Text style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>录一段课或拍板书，团团会把知识点做成翻卡</Text>
          </View>
        </View>
      </Card>
    );
  }
  /* 常驻入口：有新卡展示今日 deck；没有新卡也保留「在册卡片」入口（入口消失 = 功能消失） */
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, flex: 1 }}>{fresh.length ? '今日卡片' : '复习卡片'}</Text>
        <Pressable onPress={() => setFull(true)}>
          <Text style={{ fontSize: 11.5, color: T.orangeDeep, fontWeight: '700' }}>{fresh.length ? `全部复习 · ${active.length} 张` : `去复习`}</Text>
        </Pressable>
      </View>
      {fresh.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ paddingHorizontal: 2 }}>
          {fresh.slice(0, 5).map((c) => <FlipCard key={c.id} c={c} small />)}
        </ScrollView>
      ) : (
        <Pressable onPress={() => setFull(true)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#FBF6EF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 }, pressed && { opacity: 0.6 }]}>
          <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: T.orangeSoft, alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
            <Ic name="doc" size={16} color={T.orangeDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.text }}>攒下的 {active.length} 张卡在等你</Text>
            <Text style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>翻一翻，别让它们凉了</Text>
          </View>
          <Ic name="chevR" size={15} color="#C6BFB4" />
        </Pressable>
      )}
      <Modal visible={full} animationType="slide" onRequestClose={() => setFull(false)}>
        <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: 60, paddingHorizontal: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: T.text, flex: 1 }}>复习卡片 · {active.length} 张</Text>
            <Pressable onPress={() => setFull(false)} style={{ backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, color: T.sub, fontWeight: '600' }}>完成</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 40 }}>
            {active.map((c) => (
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
          {doneJobs.length}/{todayJobs.length} 条记录 · 待办 {s.todos.filter((t) => !t.done && !t.archived && (!t.visibleFrom || t.visibleFrom <= todayKeyISO())).length} 件 · 卡片 {s.cards.filter((c) => c.status === 'active' && new Date(c.createdAt).toDateString() === new Date().toDateString()).length} 张
        </Text>
      </View>

      {/* 到期提醒：逾期/今天到期的待办 */}
      {(() => {
        const t0 = dayStart(new Date()).getTime();
        const dueList = s.todos.filter((t) => !t.done && !t.archived && t.dueAt && t.dueAt <= t0 && (!t.visibleFrom || t.visibleFrom <= todayKeyISO()));
        if (!dueList.length) return null;
        const over = dueList.filter((t) => t.dueAt < t0);
        const due = dueList.filter((t) => t.dueAt === t0);
        return (
          <Card style={{ backgroundColor: '#FBEEE8', borderWidth: 0, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ic name="clock" size={15} color={T.red} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: T.red, marginLeft: 7 }}>
                {over.length ? `逾期 ${over.length} 件` : ''}{over.length && due.length ? ' · ' : ''}{due.length ? `今天到期 ${due.length} 件` : ''}
              </Text>
            </View>
            <Text style={{ fontSize: 11.5, color: '#8A5A45', marginTop: 4, lineHeight: 17 }} numberOfLines={2}>
              {dueList.slice(0, 3).map((t) => t.text).join('、')}{dueList.length > 3 ? ' 等' : ''}
            </Text>
          </Card>
        );
      })()}

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
              <Text style={{ fontSize: 22, fontWeight: '900', color: st.color, letterSpacing: 0.5 }}>{st.en}</Text>
              <Text style={{ fontSize: 12, color: T.sub, marginLeft: 8, flex: 1 }} numberOfLines={1}>{st.zh}{new Date(latestMood.createdAt).toDateString() === new Date().toDateString() ? '' : ` · ${fmtDate(latestMood.createdAt)}`}</Text>
              <Text style={{ fontSize: 14, marginLeft: 6 }}>{latestMood.emoji}</Text>
            </View>
            {(latestMood.tags || []).length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7 }}>
                {latestMood.tags.slice(0, 4).map((t, i) => (
                  <View key={i} style={{ backgroundColor: '#FBEDE6', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 2 }}>
                    <Text style={{ fontSize: 10, color: T.orangeDeep }} numberOfLines={1}>{t}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {pts ? <View style={{ marginTop: 6 }}><Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}><Path d={d} fill="none" stroke={T.orange} strokeWidth="2" strokeLinecap="round" /></Svg></View> : null}
            {(latestMood.moments || []).slice(0, 1).map((mo, i) => (
              <Text key={i} style={{ fontSize: 11, color: T.text2, lineHeight: 17, marginTop: 4 }} numberOfLines={2}>{mo.text}</Text>
            ))}
          </Card>
        );
      })() : null}

      <TodayTodos toast={toast} />
      <TodayCards />

      {todayDigest ? (
        <Card style={{ backgroundColor: '#FBF2E9', borderWidth: 0, paddingVertical: 12 }}>
          <Text style={{ fontSize: 10, color: T.orangeDeep, fontWeight: '800', letterSpacing: 1 }}>今日小结</Text>
          <Text style={{ fontSize: 12, color: '#7A5A45', lineHeight: 18, marginTop: 3 }}>{todayDigest.summary}</Text>
        </Card>
      ) : null}

      <Section title="今日记录" right={todayJobs.length ? `今日 ${todayJobs.length} 条` : ''}>
        {todayJobs.length ? (
          <View style={{ marginTop: 4 }}>
            {todayJobs.slice(0, 8).map((j) => <Entry key={j.id} j={j} onMenu={(job) => setMenu({ job })} />)}
            {todayJobs.length > 8 ? (
              <Pressable onPress={goJournal} style={{ alignSelf: 'center', padding: 8 }}>
                <Text style={{ fontSize: 12, color: T.orangeDeep, fontWeight: '700' }}>更多历史 → 手帐</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <View style={{ width: 56, height: 56, borderRadius: 99, backgroundColor: T.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ic name="mic" size={24} color={T.orangeDeep} />
            </View>
            <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 12, lineHeight: 20 }}>点下方录音键开始第一条记录{'\n'}说到的任务和知识点会自动整理</Text>
            {s.jobs.length ? (
              <Pressable onPress={goJournal} style={({ pressed }) => [{ marginTop: 12, backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8 }, pressed && { opacity: 0.6 }]}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.orangeDeep }}>更早的 {s.jobs.length} 条记录已沉入手帐 ›</Text>
              </Pressable>
            ) : null}
          </Card>
        )}
      </Section>

      <ActionSheet visible={!!menu} onClose={() => setMenu(null)} title={menu ? menu.job.title : ''}
        options={menu ? [
          { icon: 'trash', label: '删除本条记录', tone: 'danger', onPress: async () => { await deleteJob(menu.job.id); toast('已删除'); } },
          { icon: 'trash', label: '删除记录及其产物', tone: 'danger', onPress: async () => { await deleteJob(menu.job.id, true); toast('已删除记录及产物'); } },
        ] : []} />
    </View>
  );
}
