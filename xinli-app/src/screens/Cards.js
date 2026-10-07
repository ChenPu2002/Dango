import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Card, Section, Bar, Sheet, ActionSheet, InputSheet } from '../ui';
import { T } from '../theme';
import { useStore, setState, getState, fmtTime } from '../store';
import { editCardAnswer, archiveCard, deleteCard } from '../pipeline';

export default function Cards({ toast }) {
  const s = useStore();
  React.useEffect(() => { /* 卡片一次性：隔天自动失效 */
    const today = new Date().toDateString();
    const stale = getState().cards.filter((c) => c.status === 'active' && new Date(c.createdAt).toDateString() !== today);
    if (stale.length) setState((st2) => ({ ...st2, cards: st2.cards.map((c) => (stale.includes(c) ? { ...c, status: 'archived', archivedReason: '按日失效' } : c)) }));
  }, []);
  const allActive = s.cards.filter((c) => c.status === 'active' && new Date(c.createdAt).toDateString() === new Date().toDateString());
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState(false);
  const [menu, setMenu] = useState(null);       // {card}
  const [topic, setTopic] = useState('全部');
  const [edit, setEdit] = useState(null);       // {card}
  const [history, setHistory] = useState(null); // {card}
  const topics = ['全部', ...Array.from(new Set(allActive.map((c) => (c.topic || '日常').split('·')[0]))).slice(0, 6)];
  const active = topic === '全部' ? allActive : allActive.filter((c) => (c.topic || '日常').split('·')[0] === topic);

  if (!active.length) {
    return (
      <View>
        <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: T.text }}>复习卡片 🃏</Text>
        </View>
        <Card style={{ alignItems: 'center', paddingVertical: 30 }}>
          <Text style={{ fontSize: 30 }}>🃏</Text>
          <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 8, lineHeight: 20 }}>
            还没有卡片{'\n'}每次录音/照片提炼后自动生成，重复知识只补不重
          </Text>
        </Card>
      </View>
    );
  }

  const i = Math.min(idx, active.length - 1);
  const c = active[i];
  const mastered = allActive.filter((x) => (x.box || 0) >= 2).length;
  const revised = (c.history || []).length > 0;

  const go = (dir) => { setFlip(false); setIdx((v) => Math.max(0, Math.min(active.length - 1, v + dir))); };
  const menuOpts = (card) => [
    { icon: '✏️', label: '编辑答案（手动订正）', onPress: () => setEdit({ card }) },
    revised2(card) && { icon: '🕓', label: `查看订正历史（${(card.history || []).length} 版）`, onPress: () => setHistory({ card }) },
    { icon: '📦', label: '归档（不再复习）', onPress: () => { archiveCard(card.id); toast('已归档'); } },
    { icon: '🗑️', label: '删除这张卡', tone: 'danger', onPress: () => { deleteCard(card.id); toast('已删除'); } },
  ];
  const revised2 = (card) => (card.history || []).length > 0;

  return (
    <View>
      {(s.funs || []).length ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, marginBottom: 6, paddingHorizontal: 2 }}>✨ 有趣的事（不进复习）</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 2 }}>
            {(s.funs || []).slice(0, 10).map((f) => (
              <View key={f.id} style={{ backgroundColor: '#FFF6EF', borderRadius: 14, padding: 12, width: 240, marginRight: 8, borderWidth: 1, borderColor: '#FFE3CC' }}>
                <Text style={{ fontSize: 12, color: '#8A5570', lineHeight: 18 }}>{f.text}</Text>
                <Text style={{ fontSize: 9.5, color: T.sub, marginTop: 6 }}>来自「{f.from}」</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.text }}>复习卡片 🃏</Text>
        <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 4 }}>
          今日卡片 {allActive.length} 张 · 已掌握 {allActive.filter((x) => (x.box || 0) >= 2).length} 张 · 已归档 {s.cards.length - allActive.length} 张
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -2 }} contentContainerStyle={{ paddingHorizontal: 2 }}>
        {topics.map((t) => (
          <Pressable key={t} onPress={() => { setTopic(t); setIdx(0); setFlip(false); }} style={{ borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: topic === t ? T.orange : '#fff' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: topic === t ? '#fff' : T.sub }}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* 当前卡：点=翻面，长按=维护菜单 */}
      <Pressable
        onPress={() => setFlip(!flip)}
        onLongPress={() => setMenu({ card: c })}
        delayLongPress={350}
        accessibilityLabel="当前卡片"
        style={{ marginTop: 16, marginHorizontal: 2 }}
      >
        <View style={{
          height: 235, borderRadius: 20, padding: 20, justifyContent: 'center',
          backgroundColor: flip ? '#fff' : T.orange,
          borderWidth: flip ? 2 : 0, borderColor: T.orangeSoft,
          shadowColor: '#F97C1F', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4,
        }}>
          <Text style={{ fontSize: 10, color: flip ? T.sub : 'rgba(255,255,255,.85)', textAlign: 'center', marginBottom: 10 }}>
            {flip ? '答案' : `第 ${i + 1} / ${active.length} 张 · 点击翻面 · 长按维护`}
          </Text>
          {flip ? (
            <Text style={{ fontSize: 16, color: T.text, lineHeight: 28, textAlign: 'center', fontWeight: '600' }}>{c.a}</Text>
          ) : (
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center', lineHeight: 30 }}>{c.q}</Text>
          )}
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
        {revised ? (
          <View style={{ backgroundColor: T.blueSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: T.blue }}>✏️ 已订正 v{c.version || 1}</Text>
          </View>
        ) : null}
        <View style={{ backgroundColor: '#F2F3F5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 10.5, color: T.sub }}>{c.topic || '日常'} · {c.box >= 2 ? '已掌握' : c.box === 1 ? '记忆盒1' : '待复习'}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginTop: 14, marginHorizontal: 2 }}>
        <Pressable onPress={() => go(-1)} style={{ borderRadius: 14, borderWidth: 1.5, borderColor: T.line, paddingVertical: 12, paddingHorizontal: 22, marginRight: 10 }}>
          <Text style={{ fontSize: 13, color: T.sub, fontWeight: '700' }}>上一张</Text>
        </Pressable>
        <Pressable onPress={() => { setState0(c); toast('再看看 · 已回到待复习'); }} style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: '#F5B8B0', backgroundColor: T.redSoft, alignItems: 'center', paddingVertical: 12, marginRight: 10 }}>
          <Text style={{ fontSize: 13, color: T.red, fontWeight: '800' }}>😵 再看看</Text>
        </Pressable>
        <Pressable onPress={() => { setState2(c); go(1); }} style={{ flex: 1, borderRadius: 14, backgroundColor: T.orange, alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontSize: 13, color: '#fff', fontWeight: '800' }}>😎 会了</Text>
        </Pressable>
      </View>

      <Section title="全部卡片" right={`长按可维护`}>
        <Card>
          {active.slice(0, 25).map((x) => (
            <Pressable key={x.id} onLongPress={() => setMenu({ card: x })} delayLongPress={350}
              onPress={() => { setIdx(active.findIndex((y) => y.id === x.id)); setFlip(false); }}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: T.line }, pressed && { opacity: 0.55 }]}>
              <Text style={{ fontSize: 14, marginRight: 8 }}>{x.box >= 2 ? '✅' : x.box === 1 ? '🟠' : '⚪'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: T.text }} numberOfLines={1}>{x.q}</Text>
                <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>
                  {x.topic || '日常'} · {x.from}{(x.history || []).length ? ` · ✏️已订正` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>
      </Section>

      <ActionSheet
        visible={!!menu} onClose={() => setMenu(null)}
        title={menu ? menu.card.q : ''}
        options={menu ? menuOpts(menu.card) : []}
      />
      <InputSheet
        visible={!!edit} onClose={() => setEdit(null)}
        title={edit ? `编辑答案 · ${edit.card.q}` : ''}
        initial={edit ? edit.card.a : ''} multiline
        onSubmit={(v) => { if (edit && v.trim()) { editCardAnswer(edit.card.id, v.trim()); toast('已手动订正 ✏️'); } }}
      />
      <Sheet visible={!!history} onClose={() => setHistory(null)}>
        {history ? (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: T.text, marginBottom: 6 }}>订正历史 · {history.card.q}</Text>
            <Card style={{ marginTop: 0, backgroundColor: '#FFF6EF', borderWidth: 0 }}>
              <Text style={{ fontSize: 13, color: T.text, lineHeight: 22 }}>当前 v{history.card.version}：{history.card.a}</Text>
            </Card>
            {[...(history.card.history || [])].reverse().map((h, k) => (
              <Card key={k}>
                <Text style={{ fontSize: 10, color: T.sub }}>v{(history.card.history || []).length - k} · {fmtTime(h.at)} · {h.reason}</Text>
                <Text style={{ fontSize: 12.5, color: T.text2, lineHeight: 20, marginTop: 4 }}>{h.a}</Text>
              </Card>
            ))}
          </View>
        ) : null}
      </Sheet>
    </View>
  );

  function setState0(card) { box(card, 0); }
  function setState2(card) { box(card, (card.box || 0) + 1); }
  function box(card, b) {
    setState((st) => ({ ...st, cards: st.cards.map((x) => (x.id === card.id ? { ...x, box: b } : x)) }));
  }
}
