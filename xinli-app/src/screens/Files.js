/* 云文档：App 内的资料库（按日期分组 · 按类型筛选 · 照片可见）
 * 一切浏览/预览都在 App 内完成；文件夹只是备份目的地的一行说明，用户永远不需要跳出去操作 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Image, Dimensions } from 'react-native';
import { Card, Btn, MarkdownText } from '../ui';
import { Ic } from '../icons';
import { T } from '../theme';
import { useStore } from '../store';
import { exportAll, linkSystemFolder } from '../exporter';

const CHIPS = [
  { key: 'all', label: '全部' },
  { key: 'photo', label: '照片', icon: 'camera' },
  { key: 'transcript', label: '转写', icon: 'mic' },
  { key: 'extract', label: '提炼', icon: 'doc' },
  { key: 'memory', label: '记忆', icon: 'book' },
];

const TYPE_STYLE = {
  photo: { icon: 'camera', bg: T.blueSoft, fg: T.blue, label: '照片' },
  transcript: { icon: 'mic', bg: T.orangeSoft, fg: T.orangeDeep, label: '转写' },
  extract: { icon: 'doc', bg: T.greenSoft, fg: T.green, label: '提炼' },
  memory: { icon: 'book', bg: T.purpleSoft, fg: T.purple, label: '记忆' },
};

const fmtAt = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padEnd(2, '0')}`;
};
const dayLabel = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((t0 - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 864e5);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

export default function Files({ visible, onClose, toast }) {
  const s = useStore();
  const [preview, setPreview] = useState(null);
  const [backing, setBacking] = useState(false);
  const [chip, setChip] = useState('all');

  /* 资料源：jobs（照片/转写/提炼）+ 记忆文件，按时间倒序 */
  const items = useMemo(() => {
    const list = [];
    (s.jobs || []).forEach((j) => {
      const d = new Date(j.createdAt);
      const stamp = `${d.getMonth() + 1}${String(d.getDate()).padStart(2, '0')}`;
      const title = ((j.extract && j.extract.title) || j.title || '记录').replace(/[\\/:*?"<>|]/g, '').slice(0, 24);
      if (j.kind === 'photo') list.push({ key: `ph-${j.id}`, type: 'photo', name: `${stamp}_${title}`, at: j.createdAt, uri: j.uri, sub: '课堂照片 · 点击查看' });
      if (j.asrText) list.push({ key: `tr-${j.id}`, type: 'transcript', name: `${stamp}_${title}_转写`, at: j.createdAt, text: j.asrText, sub: `转写 · ${j.asrText.length} 字${j.slimmed ? ' · 已瘦身' : ''}` });
      if (j.status === 'done' && j.extract) {
        const ex = j.extract;
        list.push({
          key: `ex-${j.id}`, type: 'extract', name: `${stamp}_${title}_提炼`, at: j.createdAt,
          sub: `提炼 · ${j.kind === 'audio' ? '录音' : j.kind === 'photo' ? '照片' : '文档'}`,
          text: `# ${ex.title || title}\n\n## 摘要\n${ex.summary || ''}\n\n## 提纲\n${(ex.outline || []).map((o) => '- ' + o).join('\n')}\n\n## 关键点\n${(ex.points || []).map((o) => '- ' + o).join('\n')}\n`,
        });
      }
    });
    (s.exportedFiles || []).filter((f) => /手帐\.md$/.test(f.name)).forEach((f) => {
      list.push({ key: f.name, type: 'memory', name: f.name.replace('.md', ''), at: f.at || Date.now(), text: f.content || '', sub: '画像 · 课程笔记 · 日结周结月结' });
    });
    return list.sort((a, b) => (b.at || 0) - (a.at || 0));
  }, [s.jobs, s.exportedFiles]);

  const filtered = chip === 'all' ? items : items.filter((it) => it.type === chip);

  /* 按日期分组 */
  const groups = useMemo(() => {
    const g = [];
    let last = '';
    filtered.forEach((it) => {
      const lab = dayLabel(it.at || Date.now());
      if (lab !== last) { last = lab; g.push({ label: lab, items: [] }); }
      g[g.length - 1].items.push(it);
    });
    return g;
  }, [filtered]);

  const backup = async () => {
    setBacking(true);
    try {
      const n = await exportAll();
      toast(`已更新 ${n} 个文档`);
    } catch (e) {
      toast('备份失败: ' + String((e && e.message) || e).slice(0, 40));
    }
    setBacking(false);
  };

  const link = async () => {
    const ok = await linkSystemFolder();
    toast(ok ? '已关联系统文件夹 · 后续自动镜像' : '未完成关联（不影响 App 内文档）');
  };

  const counts = useMemo(() => ({
    photo: items.filter((it) => it.type === 'photo').length,
    transcript: items.filter((it) => it.type === 'transcript').length,
    extract: items.filter((it) => it.type === 'extract').length,
    memory: items.filter((it) => it.type === 'memory').length,
  }), [items]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: 56, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Pressable onPress={onClose} style={{ backgroundColor: '#fff', borderRadius: 99, padding: 8, marginRight: 10 }}>
            <Ic name="chevL" size={16} color={T.sub} />
          </Pressable>
          <Text style={{ fontSize: 19, fontWeight: '800', color: T.text, flex: 1 }}>云文档</Text>
          <Pressable onPress={backup} disabled={backing} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 }, pressed && { opacity: 0.6 }]}>
            <Ic name="sync" size={13} color={T.orangeDeep} />
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.orangeDeep, marginLeft: 5 }}>{backing ? '备份中…' : '立即备份'}</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 11.5, color: T.sub, marginBottom: 8 }}>照片 · 转写 · 提炼 · 记忆，按日期归档 · 在 App 内直接阅读</Text>

        {/* 类型筛选 */}
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {CHIPS.map((c, i) => {
            const n = c.key === 'all' ? items.length : counts[c.key] || 0;
            return (
              <Pressable key={c.key} onPress={() => setChip(c.key)}
                style={{ borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, marginLeft: i ? 7 : 0, backgroundColor: chip === c.key ? T.orange : '#F3F0EA' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: chip === c.key ? '#fff' : T.sub }}>{c.label}{n ? ` ${n}` : ''}</Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          {groups.length ? groups.map((g) => (
            <View key={g.label}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: -2 }}>
                <View style={{ width: 3.5, height: 12, borderRadius: 2, backgroundColor: T.orange, marginRight: 7 }} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: T.text2 }}>{g.label}</Text>
                <View style={{ flex: 1, height: 0.5, backgroundColor: T.line, marginLeft: 10 }} />
              </View>
              {g.items.map((it) => {
                const st = TYPE_STYLE[it.type];
                return (
                  <Pressable key={it.key} onPress={() => setPreview(it)}
                    android_ripple={{ color: 'rgba(60,40,20,0.05)', foreground: true }}
                    style={{ borderRadius: 18 }}>
                    <Card style={{ paddingVertical: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {it.type === 'photo' && it.uri ? (
                          <Image source={{ uri: it.uri }} style={{ width: 40, height: 40, borderRadius: 12, marginRight: 12, backgroundColor: '#F0EDE7' }} />
                        ) : (
                          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: st.bg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                            <Ic name={st.icon} size={18} color={st.fg} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.text }} numberOfLines={1}>{it.name}</Text>
                          <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }}>{fmtAt(it.at || Date.now())} · {it.sub}</Text>
                        </View>
                        <Ic name="chevR" size={15} color="#C6BFB4" />
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          )) : (
            <Card style={{ alignItems: 'center', paddingVertical: 34 }}>
              <View style={{ width: 56, height: 56, borderRadius: 99, backgroundColor: T.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ic name="box" size={24} color={T.orangeDeep} />
              </View>
              <Text style={{ fontSize: 13, color: T.text, fontWeight: '700', marginTop: 12 }}>还没有文档</Text>
              <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 5, lineHeight: 17, textAlign: 'center' }}>录一段音或拍一张板书{'\n'}照片 · 转写 · 提炼会自动归档到这里</Text>
              <Btn text={backing ? '备份中…' : '开始备份'} onPress={backup} style={{ marginTop: 16, paddingHorizontal: 30 }} />
            </Card>
          )}
        </ScrollView>

        <View style={{ paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: T.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 10.5, color: T.sub, textAlign: 'center' }}>
            {s.settings.exportRoot ? '已关联系统文件夹：手机存储 / 文档 / 团子 · 自动镜像' : '文档保存在 App 内 · 可选关联系统文件夹用于外部查看'}
          </Text>
          {!s.settings.exportRoot ? (
            <Pressable onPress={link} style={{ marginTop: 6, padding: 4 }}>
              <Text style={{ fontSize: 11, color: T.orangeDeep, fontWeight: '700' }}>关联系统文件夹（可选）</Text>
            </Pressable>
          ) : null}
        </View>

        {/* 预览：照片看图，文本阅读 */}
        <Modal visible={!!preview} animationType="fade" onRequestClose={() => setPreview(null)}>
          <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: 56, paddingHorizontal: 16 }}>
            {preview ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Pressable onPress={() => setPreview(null)} style={{ backgroundColor: '#fff', borderRadius: 99, padding: 8, marginRight: 10 }}>
                    <Ic name="chevL" size={16} color={T.sub} />
                  </Pressable>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, flex: 1 }} numberOfLines={1}>{preview.name}</Text>
                </View>
                {preview.type === 'photo' ? (
                  preview.uri ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Image source={{ uri: preview.uri }} style={{ width: Dimensions.get('window').width - 32, height: Dimensions.get('window').width - 32, borderRadius: 14, resizeMode: 'contain' }}
                        resizeMode="contain" />
                    </View>
                  ) : (
                    <Card style={{ alignItems: 'center', paddingVertical: 30 }}>
                      <Ic name="camera" size={26} color="#B3ACA1" />
                      <Text style={{ fontSize: 12, color: T.sub, marginTop: 10 }}>原片已随归档清理（提炼内容保留）</Text>
                    </Card>
                  )
                ) : (
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}>
                    <Card style={{ marginTop: 0 }}>
                      <MarkdownText text={preview.text || '（空文档）'} style={{ fontSize: 12.5, color: T.text2 }} />
                    </Card>
                  </ScrollView>
                )}
              </>
            ) : null}
          </View>
        </Modal>
      </View>
    </Modal>
  );
}
