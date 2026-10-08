/* 手帐：App 内文档引擎（store 为真相源， 文档/团子/ 为同步镜像） */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Card, Btn, MarkdownText } from '../ui';
import { Ic } from '../icons';
import { T } from '../theme';
import { useStore, setState, fmtDate } from '../store';
import { writeMemoryFile, exportAll, ensureExportDir } from '../exporter';

/* 图标配色：不同文档类型的柔和底色 */
const DOC_STYLE = {
  profile: { icon: 'user', bg: T.purpleSoft, fg: T.purple },
  note: { icon: 'book', bg: T.orangeSoft, fg: T.orangeDeep },
  weekly: { icon: 'calendar', bg: T.greenSoft, fg: T.green },
  daily: { icon: 'calendar', bg: T.greenSoft, fg: T.green },
  archive_audio: { icon: 'mic', bg: T.blueSoft, fg: T.blue },
  archive_photo: { icon: 'camera', bg: T.blueSoft, fg: T.blue },
  archive_doc: { icon: 'doc', bg: T.blueSoft, fg: T.blue },
};

/* 把 store 摊平成文档列表 */
function buildDocs(s) {
  const docs = [];
  if (s.profile && s.profile.text) docs.push({ key: 'profile', type: 'profile', title: '我的画像', sub: `${s.profile.text.length}字 · 滚动更新`, body: s.profile.text, editable: true });
  Object.entries(s.courseNotes || {}).forEach(([k, v]) => {
    docs.push({ key: `note-${k}`, type: 'note', title: k, sub: `课程笔记 · ${fmtDate(v.updatedAt || Date.now())}`, body: v.content, editable: true, course: k });
  });
  (s.weeklies || []).forEach((w) => docs.push({ key: `wk-${w.range}`, type: 'weekly', title: `周记 ${w.range}`, sub: '夜间自动压缩', body: w.summary }));
  (s.dailies || []).forEach((d) => docs.push({ key: `dy-${d.date}`, type: 'daily', title: `${d.date} 小结`, sub: '', body: d.summary }));
  s.jobs.filter((j) => j.status === 'done').forEach((j) => {
    const d = new Date(j.createdAt);
    const ex = j.extract;
    docs.push({
      key: `job-${j.id}`, type: 'archive', iconKind: j.kind,
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
          <Text style={{ fontSize: 20, fontWeight: '800', color: T.text, flex: 1 }}>手帐</Text>
          <Pressable onPress={syncAll} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 }, pressed && { opacity: 0.6 }]}>
            <Ic name="sync" size={13} color={T.orangeDeep} />
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.orangeDeep, marginLeft: 5 }}>同步到手机文档</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 3 }}>全部记忆都在这里 · 搜索 / 阅读 / 编辑</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginHorizontal: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, ...T.shadow }}>
          <Ic name="search" size={15} color="#B3ACA1" />
          <TextInput value={q} onChangeText={setQ} placeholder="搜索全部记忆…" placeholderTextColor={T.sub}
            style={{ flex: 1, fontSize: 13, color: T.text, paddingVertical: 10, paddingHorizontal: 8 }} />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginHorizontal: 2 }} contentContainerStyle={{ paddingHorizontal: 2 }}>
        {CHIPS.map((c) => (
          <Pressable key={c} onPress={() => setChip(c)} style={{ borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: chip === c ? T.orange : '#fff' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: chip === c ? '#fff' : T.sub }}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1, marginTop: 4 }} contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 170 }}>
        {filtered.length ? filtered.map((d) => {
          const st = DOC_STYLE[d.type === 'archive' ? `archive_${d.iconKind}` : d.type] || DOC_STYLE.archive_doc;
          return (
            <Pressable key={d.key} onPress={() => { setReader(d); setEditing(false); }} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
              <Card style={{ paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: st.bg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Ic name={st.icon} size={17} color={st.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }} numberOfLines={1}>{d.title}</Text>
                    <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }}>{d.sub}</Text>
                  </View>
                  <Ic name="chevR" size={15} color="#C6BFB4" />
                </View>
              </Card>
            </Pressable>
          );
        }) : (
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <View style={{ width: 52, height: 52, borderRadius: 99, backgroundColor: '#F0EDE7', alignItems: 'center', justifyContent: 'center' }}>
              <Ic name="search" size={22} color="#B3ACA1" />
            </View>
            <Text style={{ fontSize: 12, color: T.sub, marginTop: 10 }}>{q ? `没有匹配「${q}」的内容` : '还没有记忆，先去录一条吧'}</Text>
          </Card>
        )}
      </ScrollView>

      {/* 全屏阅读器 */}
      <Modal visible={!!reader} animationType="slide" onRequestClose={() => setReader(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: T.bg }}>
          {reader ? (
            <View style={{ flex: 1, paddingTop: 56, paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Pressable onPress={() => { setReader(null); setEditing(false); }} style={{ backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, marginRight: 10 }}>
                  <Ic name="chevL" size={15} color={T.sub} />
                </Pressable>
                {(() => {
                  const st = DOC_STYLE[reader.type === 'archive' ? `archive_${reader.iconKind}` : reader.type] || DOC_STYLE.archive_doc;
                  return <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: st.bg, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Ic name={st.icon} size={15} color={st.fg} />
                  </View>;
                })()}
                <Text style={{ fontSize: 17, fontWeight: '800', color: T.text, flex: 1 }} numberOfLines={1}>{reader.title}</Text>
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
                      <Btn text="编辑" onPress={() => { setDraft(reader.body || ''); setEditing(true); }} style={{ flex: 1, marginRight: 8 }} />
                      <Btn text="问团团" onPress={() => { const q2 = `关于「${reader.title}」：`; setReader(null); goAsk(q2); }} style={{ flex: 1 }} />
                    </>
                  )
                ) : (
                  <Btn text="就此文档问团团" onPress={() => { const q2 = `关于「${reader.title}」：`; setReader(null); goAsk(q2); }} />
                )}
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
