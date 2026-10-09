/* 手帐：App 内文档引擎（store 为真相源， 文档/团子/ 为同步镜像） */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, Animated, Dimensions, Easing } from 'react-native';
import { Card, Btn, MarkdownText, ActionSheet, InputSheet } from '../ui';
import { Ic } from '../icons';
import { T } from '../theme';
import { useStore, setState, fmtDate } from '../store';
import { writeMemoryFile, exportAll, ensureExportDir } from '../exporter';
import { deleteJob, tidyMemory } from '../pipeline';

/* 图标配色：不同文档类型的柔和底色（颜色即分组语义：橙=学习材料，紫=生活面，绿=小结） */
const DOC_STYLE = {
  profile: { icon: 'user', bg: T.purpleSoft, fg: T.purple },
  note: { icon: 'book', bg: T.orangeSoft, fg: T.orangeDeep },
  casual: { icon: 'mood', bg: T.purpleSoft, fg: T.purple },
  weekly: { icon: 'calendar', bg: T.greenSoft, fg: T.green },
  daily: { icon: 'calendar', bg: T.greenSoft, fg: T.green },
  monthly: { icon: 'layers', bg: T.purpleSoft, fg: T.purple },
  archive_audio: { icon: 'mic', bg: T.blueSoft, fg: T.blue },
  archive_photo: { icon: 'camera', bg: T.blueSoft, fg: T.blue },
  archive_doc: { icon: 'doc', bg: T.blueSoft, fg: T.blue },
};

/* 什么算课程：有课名归属的学习笔记。键名为「日常」的生活记录单独成组（用户可重命名改变归属） */
const isCasual = (course) => course === '日常' || course === '日常随笔';

/* 把 store 摊平成文档列表 */
function buildDocs(s) {
  const docs = [];
  if (s.profile && s.profile.text) docs.push({ key: 'profile', type: 'profile', title: '我的画像', sub: `${s.profile.text.length}字 · 滚动更新`, body: s.profile.text, editable: true });
  Object.entries(s.courseNotes || {}).forEach(([k, v]) => {
    docs.push({ key: `note-${k}`, type: isCasual(k) ? 'casual' : 'note', title: k, sub: `${isCasual(k) ? '日常随笔' : '课程笔记'} · ${fmtDate(v.updatedAt || Date.now())}`, body: v.content, editable: true, course: k });
  });
  (s.weeklies || []).forEach((w) => docs.push({ key: `wk-${w.range}`, type: 'weekly', title: `周记 ${w.range}`, sub: '夜间自动压缩', body: w.summary }));
  (s.monthlies || []).forEach((m) => docs.push({ key: `mo-${m.range}`, type: 'monthly', title: `月结 ${m.range}`, sub: '长期沉淀', body: m.summary }));
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

/* ===== 记忆分层卡：工作/知识/沉淀 三层 + 流转路径 + 手动整理 ===== */
function MemoryLayers({ toast }) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const hot = s.jobs.filter((j) => j.createdAt > Date.now() - 7 * 864e5).length;
  const warmNotes = Object.keys(s.courseNotes || {}).filter((k) => !isCasual(k)).length;
  const casualNotes = Object.keys(s.courseNotes || {}).filter((k) => isCasual(k)).length;
  const warmCards = s.cards.filter((c) => c.status === 'active').length;
  const dy = (s.dailies || []).length, wk = (s.weeklies || []).length, mo = (s.monthlies || []).length;
  const tidy = async () => {
    if (busy) return;
    setBusy(true);
    toast('整理中：归档 · 压缩 · 瘦身…');
    try {
      const did = await tidyMemory();
      toast(did && did.length ? '整理完成：' + did.join('、') : '记忆已经很整洁 ✨');
    } catch (_) { toast('整理失败，稍后再试'); }
    setBusy(false);
  };
  const row = (icon, name, detail, fg, bg) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
      <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
        <Ic name={icon} size={13} color={fg} />
      </View>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: T.text, width: 52 }}>{name}</Text>
      <Text style={{ flex: 1, fontSize: 11, color: T.sub }}>{detail}</Text>
    </View>
  );
  return (
    <Card style={{ paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Ic name="layers" size={15} color={T.orangeDeep} />
        <Text style={{ fontSize: 14, fontWeight: '800', color: T.text, marginLeft: 7 }}>记忆分层</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={tidy} disabled={busy} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5, opacity: busy ? 0.5 : 1 }, pressed && { opacity: 0.6 }]}>
          <Ic name="sync" size={11} color={T.orangeDeep} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: T.orangeDeep, marginLeft: 4 }}>{busy ? '整理中…' : '立即整理'}</Text>
        </Pressable>
      </View>
      {row('sparkle', '工作层', `近7天记录 ${hot} 条 · 待办 ${s.todos.filter((t) => !t.done && !t.archived).length} 件`, T.orangeDeep, T.orangeSoft)}
      {row('book', '知识层', `课程笔记 ${warmNotes} 门${casualNotes ? ` · 随笔 ${casualNotes} 篇` : ''} · 活跃卡片 ${warmCards} 张`, T.green, T.greenSoft)}
      {row('box', '沉淀层', `日结 ${dy} · 周结 ${wk} · 月结 ${mo}`, T.purple, T.purpleSoft)}
      <View style={{ borderTopWidth: 0.5, borderTopColor: T.line, marginTop: 6, paddingTop: 8 }}>
        <Text style={{ fontSize: 10.5, color: T.sub, lineHeight: 16 }}>
          流转路径：记录 →日终→ 日结 →周日→ 周结 →月末→ 月结{'\n'}
          转写 14 天后瘦身 · 60 天后只留摘要（越老越冷，知识沉淀在笔记与卡片）
        </Text>
      </View>
    </Card>
  );
}

/* ===== iOS push 式页面容器：从右侧滑入，退出时右滑出 ===== */
function PushModal({ visible, onClose, children }) {
  const W = Dimensions.get('window').width;
  const x = useRef(new Animated.Value(W)).current;
  const [render, setRender] = useState(false);
  useEffect(() => {
    if (visible) {
      setRender(true);
      Animated.timing(x, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(x, { toValue: W, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) setRender(false); });
    }
  }, [visible]);
  if (!render) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={{ flex: 1, backgroundColor: T.bg, transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </Modal>
  );
}

export default function Journal({ toast, goAsk }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [chip, setChip] = useState('全部');
  const [reader, setReader] = useState(null);   // doc
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [noteMenu, setNoteMenu] = useState(null); // note/casual 卡的 ⋯ 菜单
  const [rename, setRename] = useState(null);     // 正在重命名的笔记

  const docs = useMemo(() => buildDocs(s), [s]);
  const CHIPS = ['全部', '课程', '随笔', '画像', '小结', '档案'];
  const filtered = docs.filter((d) => {
    if (chip === '课程' && d.type !== 'note') return false;
    if (chip === '随笔' && d.type !== 'casual') return false;
    if (chip === '画像' && d.type !== 'profile') return false;
    if (chip === '小结' && !['daily', 'weekly', 'monthly'].includes(d.type)) return false;
    if (chip === '档案' && d.type !== 'archive') return false;
    if (q.trim() && !(`${d.title}${d.body}`.includes(q.trim()))) return false;
    return true;
  });

  /* 笔记重命名（改变归属：改成课程名→课程笔记组，改成「日常」→日常随笔组）与删除 */
  const renameNote = (oldName, newName) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    setState((st) => {
      const { [oldName]: val, ...rest } = st.courseNotes || {};
      return { ...st, courseNotes: { [newName.trim()]: val, ...rest } };
    });
    setReader(null);
    toast(`已重命名为「${newName.trim()}」`);
    writeMemoryFile().catch(() => {});
  };
  const deleteNote = (name) => {
    setState((st) => { const n = { ...st.courseNotes }; delete n[name]; return { ...st, courseNotes: n }; });
    setReader(null);
    toast('已删除');
    writeMemoryFile().catch(() => {});
  };
  const noteMenuSheet = (
    <ActionSheet visible={!!noteMenu} onClose={() => setNoteMenu(null)} title={noteMenu ? noteMenu.title : ''}
      options={noteMenu ? [
        { icon: 'pencil', label: '重命名（改变归属）', onPress: () => setRename(noteMenu) },
        { icon: 'trash', label: '删除这份笔记', tone: 'danger', onPress: () => {
          const name = noteMenu.course;
          setNoteMenu(null);
          Alert.alert(`删除「${name}」？`, '笔记内容将一并删除，不可恢复', [
            { text: '取消', style: 'cancel' },
            { text: '删除', style: 'destructive', onPress: () => deleteNote(name) },
          ]);
        } },
      ] : []} />
  );

  const saveEdit = async () => {
    if (!reader) return;
    if (reader.type === 'profile') setState((st) => ({ ...st, profile: { text: draft, updatedAt: Date.now() } }));
    if (reader.type === 'note' || reader.type === 'casual') setState((st) => ({ ...st, courseNotes: { ...st.courseNotes, [reader.course]: { content: draft, updatedAt: Date.now() } } }));
    setEditing(false);
    toast('已保存（并同步到记忆基准）');
    try { await writeMemoryFile(); } catch (_) {}
  };

  const syncAll = async () => {
    try { await ensureExportDir(); const n = await exportAll(); toast(`已同步 ${n} 个文件 → 文档/团子/`); }
    catch (e) { toast('同步失败: ' + String((e && e.message) || e).slice(0, 40)); }
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 12 }}>
      <View style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: T.text, flex: 1 }}>手帐</Text>
          <Pressable onPress={syncAll} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 }, pressed && { opacity: 0.6 }]}>
            <Ic name="sync" size={13} color={T.orangeDeep} />
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.orangeDeep, marginLeft: 5 }}>同步到手机文档</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 3 }}>全部记忆都在这里 · 搜索 / 阅读 / 编辑</Text>
      </View>

      <MemoryLayers toast={toast} />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, ...T.shadow }}>
        <Ic name="search" size={15} color="#B3ACA1" />
        <TextInput value={q} onChangeText={setQ} placeholder="搜索全部记忆…" placeholderTextColor={T.sub}
          style={{ flex: 1, fontSize: 13, color: T.text, paddingVertical: 10, paddingHorizontal: 8 }} />
      </View>
      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        {CHIPS.map((c, i) => (
          <Pressable key={c} onPress={() => setChip(c)} style={{ borderRadius: 99, paddingHorizontal: 13, paddingVertical: 6, marginLeft: i ? 7 : 0, backgroundColor: chip === c ? T.orange : '#F3F0EA' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: chip === c ? '#fff' : T.sub }}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ flex: 1, marginTop: 2 }} contentContainerStyle={{ paddingBottom: 170 }}>
        {filtered.length ? (() => {
          let shownNotes = false, shownCasual = false, shownSum = false, lastDay = '';
          return filtered.map((d) => {
            const st = DOC_STYLE[d.type === 'archive' ? `archive_${d.iconKind}` : d.type] || DOC_STYLE.archive_doc;
            const els = [];
            const label = (key, text) => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: -2 }}>
                <View style={{ width: 3.5, height: 12, borderRadius: 2, backgroundColor: T.orange, marginRight: 7 }} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: T.text2 }}>{text}</Text>
                <View style={{ flex: 1, height: 0.5, backgroundColor: T.line, marginLeft: 10 }} />
              </View>
            );
            if (d.type === 'note' && !shownNotes) { shownNotes = true; els.push(label('lb-note', '课程笔记')); }
            if (d.type === 'casual' && !shownCasual) { shownCasual = true; els.push(label('lb-casual', '日常随笔')); }
            if (['daily', 'weekly', 'monthly'].includes(d.type) && !shownSum) { shownSum = true; els.push(label('lb-sum', '小结')); }
            if (d.type === 'archive' && d.job) {
              const dd = new Date(d.job.createdAt);
              const day = `${dd.getMonth() + 1}月${dd.getDate()}日 · 周${'日一二三四五六'[dd.getDay()]}`;
              if (day !== lastDay) { lastDay = day; els.push(label(`lb-${d.key}`, day)); }
            }
            els.push(
              <Pressable key={d.key} onPress={() => { setReader(d); setEditing(false); }}
                onLongPress={d.course ? () => setNoteMenu(d) : undefined} delayLongPress={350}
                android_ripple={{ color: 'rgba(60,40,20,0.05)', foreground: true }}
                style={{ borderRadius: T.radius }}>
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
            return els;
          });
        })() : (
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <View style={{ width: 52, height: 52, borderRadius: 99, backgroundColor: '#F0EDE7', alignItems: 'center', justifyContent: 'center' }}>
              <Ic name="search" size={22} color="#B3ACA1" />
            </View>
            <Text style={{ fontSize: 12, color: T.sub, marginTop: 10 }}>{q ? `没有匹配「${q}」的内容` : '还没有记忆，先去录一条吧'}</Text>
          </Card>
        )}
      </ScrollView>

      {/* 全屏阅读器（push 式：从右侧滑入） */}
      <PushModal visible={!!reader} onClose={() => { setReader(null); setEditing(false); }}>
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
                {reader.course ? (
                  <Pressable onPress={() => setNoteMenu(reader)} hitSlop={8} style={({ pressed }) => [{ backgroundColor: '#fff', borderRadius: 99, padding: 8 }, pressed && { opacity: 0.6 }]}>
                    <Ic name="dots" size={16} color={T.sub} />
                  </Pressable>
                ) : null}
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
              {/* 底部操作区：等宽主次布局——主操作实心，次操作白底描边，危险操作红描边 */}
              <View style={{ flexDirection: 'row', paddingBottom: 26, paddingTop: 8 }}>
                {reader.editable ? (
                  editing ? (
                    <>
                      <Btn text="保存" icon="check" onPress={saveEdit} style={{ flex: 1, marginRight: 8 }} />
                      <Btn text="取消" variant="ghost" onPress={() => setEditing(false)} style={{ flex: 1 }} />
                    </>
                  ) : (
                    <>
                      <Btn text="编辑" icon="pencil" onPress={() => { setDraft(reader.body || ''); setEditing(true); }} style={{ flex: 1, marginRight: 8 }} />
                      <Btn text="问团团" icon="chat" variant="ghost" onPress={() => { const q2 = `关于「${reader.title}」：`; setReader(null); goAsk(q2); }} style={{ flex: 1 }} />
                    </>
                  )
                ) : (
                  <>
                    <Btn text="问团团" icon="chat" onPress={() => { const q2 = `关于「${reader.title}」：`; setReader(null); goAsk(q2); }} style={{ flex: 1, marginRight: 8 }} />
                    {reader.type === 'archive' && reader.job ? (
                      <Btn text="删除" icon="trash" tone="danger" variant="ghost" style={{ flex: 1 }} onPress={() => Alert.alert('删除这条记录？', '将一并删除其衍生的卡片、待办、心情、云文档，并从剩余记录重建课程笔记与画像（隐私级联）', [
                        { text: '取消', style: 'cancel' },
                        { text: '删除并清除衍生', style: 'destructive', onPress: async () => {
                          const jid = reader.job.id;
                          setReader(null);
                          await deleteJob(jid, true);
                          toast('已删除，衍生记忆已重建');
                        } },
                      ])} />
                    ) : null}
                  </>
                )}
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </PushModal>

      {noteMenuSheet}
      <InputSheet visible={!!rename} onClose={() => setRename(null)} title="重命名笔记" initial={rename ? rename.course : ''}
        placeholder="改成课程名（如：心理学导论）或「日常」"
        onSubmit={(v) => { if (rename) renameNote(rename.course, v); }} />
    </View>
  );
}
