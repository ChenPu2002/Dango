/* 云文档：App 内的文档交互界面（云存储体验）
 * 一切浏览/预览都在 App 内完成；文件夹只是备份目的地的一行说明，用户永远不需要跳出去操作 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { Card, Btn, MarkdownText } from '../ui';
import { Ic } from '../icons';
import { T } from '../theme';
import { useStore } from '../store';
import { exportAll, linkSystemFolder } from '../exporter';

const fmtAt = (ts) => {
  const d = new Date(ts);
  const hm = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return hm;
};

export default function Files({ visible, onClose, toast }) {
  const s = useStore();
  const [preview, setPreview] = useState(null);
  const [backing, setBacking] = useState(false);

  const files = useMemo(() => (s.exportedFiles || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0)), [s.exportedFiles]);

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

  const iconOf = (name) => (/_转写\.txt$/.test(name) ? 'mic' : /手帐\.md$/.test(name) ? 'book' : 'doc');

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
        <Text style={{ fontSize: 11.5, color: T.sub, marginBottom: 6 }}>全部记忆都以文档形式保存在这里 · 在 App 内直接阅读</Text>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          {files.length ? files.map((f) => (
            <Pressable key={f.name} onPress={() => setPreview(f)} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
              <Card style={{ paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: T.orangeSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Ic name={iconOf(f.name)} size={17} color={T.orangeDeep} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.text }} numberOfLines={1}>{f.name}</Text>
                    <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }}>{fmtAt(f.at || 0)} · {String(f.content || '').length} 字</Text>
                  </View>
                  <Ic name="chevR" size={15} color="#C6BFB4" />
                </View>
              </Card>
            </Pressable>
          )) : (
            <Card style={{ alignItems: 'center', paddingVertical: 34 }}>
              <View style={{ width: 56, height: 56, borderRadius: 99, backgroundColor: T.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ic name="box" size={24} color={T.orangeDeep} />
              </View>
              <Text style={{ fontSize: 13, color: T.text, fontWeight: '700', marginTop: 12 }}>还没有备份文档</Text>
              <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 5, lineHeight: 17, textAlign: 'center' }}>备份后，画像 / 课程笔记 / 每条记录的转写与提炼{'\n'}都会以文档形式出现在这里</Text>
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

        {/* 文档预览（App 内阅读，不跳文件夹） */}
        <Modal visible={!!preview} animationType="slide" onRequestClose={() => setPreview(null)}>
          <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: 56, paddingHorizontal: 16 }}>
            {preview ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Pressable onPress={() => setPreview(null)} style={{ backgroundColor: '#fff', borderRadius: 99, padding: 8, marginRight: 10 }}>
                    <Ic name="chevL" size={16} color={T.sub} />
                  </Pressable>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, flex: 1 }} numberOfLines={1}>{preview.name}</Text>
                </View>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}>
                  <Card style={{ marginTop: 0 }}>
                    <MarkdownText text={preview.content || '（空文档）'} style={{ fontSize: 12.5, color: T.text2 }} />
                  </Card>
                </ScrollView>
              </>
            ) : null}
          </View>
        </Modal>
      </View>
    </Modal>
  );
}
