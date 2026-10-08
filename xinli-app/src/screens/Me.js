import React, { useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import { Card, Section, Row, Divider, Btn, SwitchMIUI } from '../ui';
import { T } from '../theme';
import { useStore, setState } from '../store';
import { exportAll } from '../exporter';
import { clearMemoryFile } from '../pipeline';

export default function Me({ toast, go }) {
  const s = useStore();
  const [cfg, setCfg] = useState(s.settings);
  const [dirty, setDirty] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activeCards = s.cards.filter((c) => c.status === 'active');
  const totalMin = Math.round(s.jobs.filter((j) => j.kind === 'audio').reduce((a, j) => a + (j.dur || 0), 0) / 60);

  const save = () => {
    setState((st) => ({ ...st, settings: cfg }));
    setDirty(false);
    toast('已保存 · 下次处理即生效');
  };

  const field = (label, key, ph, mask) => (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 11, color: T.sub, marginBottom: 5 }}>{label}</Text>
      <TextInput
        value={cfg[key]} onChangeText={(v) => { setCfg({ ...cfg, [key]: v }); setDirty(true); }}
        placeholder={ph} placeholderTextColor={T.sub}
        secureTextEntry={mask} autoCapitalize="none" autoCorrect={false}
        style={{ fontSize: 12, color: T.text, backgroundColor: '#F7F8FA', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}
      />
    </View>
  );

  const clearAll = () => Alert.alert('清空全部数据？', '时间线、卡片、待办、心情将全部删除（API 配置保留）', [
    { text: '取消', style: 'cancel' },
    { text: '确认清空', style: 'destructive', onPress: async () => {
      for (const d of ['xinli-recordings', 'xinli-photos', 'xinli-docs']) {
        await FS.deleteAsync(FS.documentDirectory + d + '/', { idempotent: true }).catch(() => {});
      }
      await clearMemoryFile().catch(() => {});
      setState((st) => ({ ...st, jobs: [], cards: [], todos: [], moods: [], funs: [], dailies: [], weeklies: [], courseNotes: {}, profile: { text: '', updatedAt: 0 }, exportedFiles: [] }));
      toast('已清空（含记忆文件）');
    } },
  ]);

  const audioJobs = s.jobs.filter((j) => j.kind === 'audio');
  const totalKB = s.jobs.reduce((a, j) => a + (j.size || 0), 0) / 1024;

  return (
    <View>
      <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.text }}>我的</Text>
      </View>

      <Section title="AI 服务配置">
        <Card>
          {field('LLM 接口地址（OpenAI 兼容）', 'llmUrl', 'https://api.deepseek.com/chat/completions')}
          {field('LLM API Key', 'llmKey', 'sk-...', true)}
          {field('模型', 'llmModel', 'deepseek-flash')}
          {field('ASR API Key（火山 Seed-ASR）', 'asrKey', '火山 x-api-key', true)}
          {dirty ? <Btn text="保存配置" onPress={save} style={{ marginTop: 14 }} /> : (
            <Text style={{ fontSize: 11, color: T.sub, textAlign: 'center', marginTop: 12 }}>
              当前：{cfg.llmModel} · 配置仅存手机本地
            </Text>
          )}
        </Card>
      </Section>

      <Section title="本学期">
        <Card style={{ flexDirection: 'row' }}>
          {[
            ['课程', Object.keys(s.courseNotes || {}).length],
            ['录音', `${totalMin}分钟`],
            ['活跃卡片', activeCards.length],
            ['已归档', s.cards.length - activeCards.length],
            ['日结', (s.dailies || []).length],
          ].map(([l, v]) => (
            <View key={l} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>{v}</Text>
              <Text style={{ fontSize: 10, color: T.sub, marginTop: 3 }}>{l}</Text>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="文档固化（手机本地）">
        <Card style={{ paddingHorizontal: 16 }}>
          <Row icon="folder" iconBg={T.blueSoft} iconColor={T.blue} title="文档同步位置" sub={s.settings.exportDir ? '已授权 · 文档/团子/' : '未授权（首次同步时引导授权）'} />
          <Divider />
          <Row icon="upload" iconBg={T.orangeSoft} title="立即导出全部" sub={exporting ? '导出中…' : '课程笔记 + 近30条记录（转写/提炼）'}
            onPress={async () => {
              if (!s.settings.exportDir) { toast('先选择存储位置'); return; }
              setExporting(true);
              try { const n = await exportAll(); toast(`已导出 ${n} 个文件 → 文档/团子`); }
              catch (e) { toast('导出失败: ' + String((e && e.message) || e).slice(0, 40)); }
              setExporting(false);
            }} />
          <Divider />
          <Row icon="book" iconBg={T.orangeSoft} title="浏览与编辑记忆" sub="画像/课程笔记/档案 · 在「手帐」页操作"
            onPress={() => go && go('journal')} />

          <Divider />
          <Row icon="sync" iconBg={T.greenSoft} iconColor={T.green} title="处理完自动导出" sub="每条记录完成提炼后自动写入文档目录"
            right={<SwitchMIUI on={!!s.settings.exportAuto} onChange={(v) => setState((st) => ({ ...st, settings: { ...st.settings, exportAuto: v } }))} />} />
        </Card>
      </Section>


      <Section title="设备协同（预留）">
        <Card>
          <Row icon="sliders" iconBg="#F0EDE7" iconColor="#9A948B" title="电脑端 / 心力球设备" sub="接入方案已预留 · 暂未启用" right={
            <View style={{ backgroundColor: '#F0EDE7', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: T.sub }}>v2</Text>
            </View>
          } />
        </Card>
      </Section>

      <Section title="本地数据">
        <Card style={{ paddingHorizontal: 16 }}>
          <Row icon="mic" iconBg={T.purpleSoft} iconColor={T.purple} title="录音" sub={audioJobs.length ? `${audioJobs.length} 段 · 存于应用沙盒` : '暂无'} right={<Text style={{ fontSize: 12, color: T.sub }}>{audioJobs.length} 段</Text>} />
          <Divider />
          <Row icon="layers" iconBg={T.orangeSoft} title="复习卡片" sub={`累计生成`} right={<Text style={{ fontSize: 12, color: T.sub }}>{s.cards.length} 张</Text>} />
          <Divider />
          <Row icon="box" iconBg={T.greenSoft} iconColor={T.green} title="占用空间" sub="音频/照片/文档均为本地存储" right={<Text style={{ fontSize: 12, color: T.sub }}>{totalKB > 1024 ? (totalKB / 1024).toFixed(1) + ' MB' : totalKB.toFixed(0) + ' KB'}</Text>} />
        </Card>
        <Btn text="清空全部数据" tone="danger" onPress={clearAll} style={{ marginTop: 14 }} />
      </Section>

      <Section title="关于">
        <Card style={{ paddingHorizontal: 16 }}>
          <Row icon="sparkle" iconBg={T.orangeSoft} title="团子" sub="手机端自操作 Agent · 录音/照片 → ASR/多模态 → 结构化提炼" right={<Text style={{ fontSize: 12, color: T.sub }}>v0.5</Text>} />
        </Card>
      </Section>
    </View>
  );
}