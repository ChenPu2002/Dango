/* 手帐：App 内文档引擎（store 为真相源， 文档/团子/ 为同步镜像） */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Card, Btn, MarkdownText } from '../ui';
import { T } from '../theme';
import { useStore, setState, fmtDate } from '../store';
import { writeMemoryFile, exportAll, ensureExportDir } from '../exporter';

/* 把 store 摊平成文档列表 */
function buildDocs(s) {
  const docs = [];
  if (s.profile && s.profile.text) docs.push({ key: 'profile', type: 'profile', icon: '👤', title: '我的画像', sub: `${s.profile.text.length}字 · 滚动更新`, body: s.profile.text, editable: true });
  Object.entries(s.courseNotes || {}).forEach(([k, v]) => {
    docs.push({ key: `note-${k}`, type: 'note', icon: '📘', title: k, sub: `课程笔记 · ${fmtDate(v.updatedAt || Date.now())}`, body: v.content, editable: true, course: k });
  });
  (s.weeklies || []).forEach((w) => docs.push({ key: `wk-${w.range}`, type: 'weekly', icon: '📆', title: `周记 ${w.range}`, sub: '夜间自动压缩', body: w.summary }));
  (s.dailies || []).forEach((d) => docs.push({ key: `dy-${d.date}`, type: 'daily', icon: '📅', title: `${d.date} 小结`, sub: d.emoji || '', body: d.summary }));
  s.jobs.filter((j) => j.status === 'done').forEach((j) => {
    const d = new Date(j.createdAt);
    const ex = j.extract;
    docs.push({
      key: `job-${j.id}`, type: 'archive', icon: j.kind === 'audio' ? '🎧' : j.kind === 'photo' ? '📷' : '📄',
      title: (ex && ex.title) || j.title, sub: `${d.getMonth() + 1}.${d.getDate()} · 档案`,
      body: [
        ex ? `## 摘要\n${ex.summary || ''}` : '',
        ex && ex.points && ex.points.length ? `## 关键点\n${ex.points.map((p) => '- ' + p).join('\n')}` : '',
        j.asrText ? `## 转写原文\n${j.asrText}` : '',
      ].filter(Boolean).join('\n\n'),
      editable: false, job: j,
    });
  });
  return docs;
}

export default function Journal({ toast, goAsk }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [chip, setChip] = useState('全部');
  const [reader, setReader] = useState(null);   // doc
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const docs = useMemo(() => buildDocs(s), [s]);
  const CHIPS = ['全部', '课程', '画像', '日结', '档案'];
  const filtered = docs.filter((d) => {
    if (chip === '课程' && d.type !== 'note') return false;
    if (chip === '画像' && d.type !== 'profile') return false;
    if (chip === '日结' && !['daily', 'weekly'].includes(d.type)) return false;
    if (chip === '档案' && d.type !== 'archive') return false;
    if (q.trim() && !(`${d.title}${d.body}`.includes(q.trim()))) return false;
    return true;
  });

  const saveEdit = async () => {
    if (!reader) return;
    if (reader.type === 'profile') setState((st) => ({ ...st, profile: { text: draft, updatedAt: Date.now() } }));
    if (reader.type === 'note') setState((st) => ({ ...st, courseNotes: { ...st.courseNotes, [reader.course]: { content: draft, updatedAt: Date.now() } } }));
    setEditing(false);
    toast('已保存（并同步到记忆基准）');
    try { await writeMemoryFile(); } catch (_) {}
  };

  const syncAll = async () => {
    try { await ensureExportDir(); const n = await exportAll(); toast(`已同步 ${n} 个文件 → 文档/团子/`); }
    catch (e) { toast('同步失败: ' + String((e && e.message) || e).slice(0, 40)); }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 2, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: T.text, flex: 1 }}>手帐 📖</Text>
          <Pressable onPress={syncAll} style={{ backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.orangeDeep }}>🔄 同步到手机文档</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 3 }}>全部记忆都在这里 · 搜索/阅读/编辑（镜像存于 文档/团子/）</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginHorizontal: 2 }}>
        <TextInput value={q} onChangeText={setQ} placeholder="🔍 搜索全部记忆…" placeholderTextColor={T.sub}
          style={{ flex: 1, fontSize: 13, color: T.text, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, ...T.shadow }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginHorizontal: 2 }} contentContainerStyle={{ paddingHorizontal: 2 }}>
        {CHIPS.map((c) => (
          <Pressable key={c} onPress={() => setChip(c)} style={{ borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: chip === c ? T.orange : '#fff' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: chip === c ? '#fff' : T.sub }}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1, marginTop: 4 }} contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 110 }}>
        {filtered.length ? filtered.map((d) => (
          <Pressable key={d.key} onPress={() => { setReader(d); setEditing(false); }} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
            <Card style={{ paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>{d.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }} numberOfLines={1}>{d.title}</Text>
                  <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }}>{d.sub}</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#C6CBD2' }}>›</Text>
              </View>
            </Card>
          </Pressable>
        )) : (
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <Text style={{ fontSize: 26 }}>🔍</Text>
            <Text style={{ fontSize: 12, color: T.sub, marginTop: 8 }}>{q ? `没有匹配「${q}」的内容` : '还没有记忆，先去录一条吧'}</Text>
          </Card>
        )}
      </ScrollView>

      {/* 全屏阅读器 */}
      <Modal visible={!!reader} animationType="slide" onRequestClose={() => setReader(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: T.bg }}>
          {reader ? (
            <View style={{ flex: 1, paddingTop: 56, paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Pressable onPress={() => { setReader(null); setEditing(false); }} style={{ backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, marginRight: 10 }}>
                  <Text style={{ fontSize: 13, color: T.sub, fontWeight: '600' }}>‹ 返回</Text>
                </Pressable>
                <Text style={{ fontSize: 17, fontWeight: '800', color: T.text, flex: 1 }} numberOfLines={1}>{reader.icon} {reader.title}</Text>
              </View>
              <Text style={{ fontSize: 10.5, color: T.sub, marginBottom: 8 }}>{reader.sub}{reader.editable ? ' · 可编辑' : ' · 只读'}</Text>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 90 }}>
                {editing ? (
                  <TextInput value={draft} onChangeText={setDraft} multiline autoFocus
                    style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 13.5, color: T.text, minHeight: 320, textAlignVertical: 'top', lineHeight: 22 }} />
                ) : (
                  <Card style={{ marginTop: 0 }}>
                    <MarkdownText text={reader.body || '（无内容）'} style={{ fontSize: 13, color: T.text2 }} />
                  </Card>
                )}
              </ScrollView>
              <View style={{ flexDirection: 'row', paddingHorizontal: 0, paddingBottom: 26, paddingTop: 8 }}>
                {reader.editable ? (
                  editing ? (
                    <>
                      <Btn text="保存" onPress={saveEdit} style={{ flex: 1, marginRight: 8 }} />
                      <Btn text="取消" tone="danger" onPress={() => setEditing(false)} style={{ flex: 1 }} />
                    </>
                  ) : (
                    <>
                      <Btn text="✏️ 编辑" onPress={() => { setDraft(reader.body || ''); setEditing(true); }} style={{ flex: 1, marginRight: 8 }} />
                      <Btn text="💬 问团子" onPress={() => { const q2 = `关于「${reader.title}」：`; setReader(null); goAsk(q2); }} style={{ flex: 1 }} />
                    </>
                  )
                ) : (
                  <Btn text="💬 就此文档问团子" onPress={() => { const q2 = `关于「${reader.title}」：`; setReader(null); goAsk(q2); }} />
                )}
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
