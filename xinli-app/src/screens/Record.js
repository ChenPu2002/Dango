import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import * as Audio from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Card, Section, Chip, PulseDot, Toast, ActionSheet } from '../ui';
import { T } from '../theme';
import { useStore, fmtTime } from '../store';
import { addAudioJob, addPhotoJob, addDocJob, retryJob, deleteJob, discardFile } from '../pipeline';

/* ASR 友好的录音参数：m4a/aac 16k 单声道 */
const ASR_PRESET = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 48000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
};

const KIND = { audio: { icon: '🎧', label: '录音' }, photo: { icon: '📷', label: '照片' }, doc: { icon: '📄', label: '文档' } };
const STATUS = {
  queued: { c: 'w', t: '排队中' }, asr: { c: 'p', t: '转写中' },
  llm: { c: 'p', t: '提炼中' }, merge: { c: 'p', t: '合并中' }, done: { c: 'g', t: '完成' }, error: { c: 'r', t: '失败' },
};

function PlayBtn({ uri }) {
  const player = Audio.useAudioPlayer({ uri });
  const [playing, setPlaying] = useState(false);
  return (
    <Pressable onPress={() => { playing ? player.pause() : player.play(); setPlaying(!playing); }}
      style={{ width: 30, height: 30, borderRadius: 99, backgroundColor: T.orange, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 11 }}>{playing ? '⏸' : '▶'}</Text>
    </Pressable>
  );
}

export default function Record({ toast, go }) {
  const s = useStore();
  const recorder = Audio.useAudioRecorder(ASR_PRESET);
  const [rec, setRec] = useState({ on: false, sec: 0 });
  const [menu, setMenu] = useState(null); // {job}
  const timer = React.useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  const start = async () => {
    const perm = await Audio.requestRecordingPermissionsAsync();
    if (!perm.granted) { toast('需要麦克风权限'); return; }
    try {
      await Audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      /* 确保 prepare 完成（useAudioRecorder 异步预备，直接 record 可能静默失败）*/
      try { await recorder.prepareToRecordAsync(ASR_PRESET); } catch (e) { console.log('[dango] prepare warn:', String(e.message).slice(0, 80)); }
      if (recorder.isRecording) { console.log('[dango] already recording'); }
      else recorder.record();
      await new Promise((r) => setTimeout(r, 500));
      console.log('[dango] record started → isRecording =', recorder.isRecording, 'uri =', recorder.uri);
      if (!recorder.isRecording) throw new Error('麦克风未能启动');
      setRec({ on: true, sec: 0 });
      timer.current = setInterval(() => setRec((r) => ({ ...r, sec: r.sec + 1 })), 1000);
    } catch (e) { setRec({ on: false, sec: 0 }); toast('录音启动失败: ' + String((e && e.message) || e).slice(0, 60)); }
  };

  const stop = async () => {
    clearInterval(timer.current);
    try {
      await recorder.stop();
      await new Promise((r) => setTimeout(r, 400)); /* 等原生落盘并更新 uri */
      const uri = recorder.uri;
      const dur = rec.sec;
      console.log('[dango] stopped → uri =', uri, 'dur =', dur);
      setRec({ on: false, sec: 0 });
      if (!uri) { toast('未生成录音文件（请重试）'); return; }
      await addAudioJob(uri, dur);
      toast('录音已保存 · 转写+提炼自动进行中 🚀');
    } catch (e) { setRec({ on: false, sec: 0 }); toast('停止失败: ' + String((e && e.message) || e).slice(0, 60)); }
  };

  const takePhoto = async () => {
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) {
      await addPhotoJob(r.assets[0].uri, r.assets[0].fileSize || 0);
      toast('照片已加入提炼队列 🚀');
    }
  };
  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) {
      await addPhotoJob(r.assets[0].uri, r.assets[0].fileSize || 0);
      toast('照片已加入提炼队列 🚀');
    }
  };
  const pickDoc = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'text/markdown', 'text/*'] });
    if (!r.canceled && r.assets && r.assets[0]) {
      const a = r.assets[0];
      if (!/\.(txt|md|markdown|csv)$/i.test(a.name || '')) { toast('文档暂支持 txt / md'); return; }
      await addDocJob(a.uri, a.name, a.size || 0);
      toast('文档已加入提炼队列 🚀');
    }
  };

  const discard = async () => {
    clearInterval(timer.current);
    try {
      await recorder.stop();
      await new Promise((r) => setTimeout(r, 300));
      await discardFile(recorder.uri);
    } catch (_) {}
    setRec({ on: false, sec: 0 });
    toast('已丢弃，不处理 🗑️');
  };

  const mmss = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  return (
    <View>
      <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.text }}>录音 · 提炼 🎙️</Text>
        <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 4 }}>录音/拍照/选文档 → 自动转写 → AI 提炼 → 更新今日·卡片·心情·搭子</Text>
      </View>

      {/* 录音按钮 */}
      <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
        <Pressable onPress={rec.on ? stop : start} accessibilityLabel="录音按钮" style={({ pressed }) => [
          {
            width: 108, height: 108, borderRadius: 99, alignItems: 'center', justifyContent: 'center',
            backgroundColor: rec.on ? T.red : T.orange,
            shadowColor: rec.on ? T.red : '#F97C1F', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 5,
          }, pressed && { opacity: 0.75 },
        ]}>
          <Text style={{ fontSize: 40 }}>{rec.on ? '⏹' : '⏺'}</Text>
        </Pressable>
        {rec.on ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
            <PulseDot />
            <Text style={{ fontSize: 15, fontWeight: '800', color: T.red, marginLeft: 8, fontVariant: ['tabular-nums'] }}>{mmss(rec.sec)}</Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={discard} style={{ borderRadius: 99, borderWidth: 1.5, borderColor: '#F5B8B0', backgroundColor: T.redSoft, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: T.red }}>丢弃</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: T.sub, marginTop: 14 }}>点击开始录音（手机麦克风）</Text>
        )}
        <View style={{ flexDirection: 'row', marginTop: 18 }}>
          {[
            { icon: '📷', label: '拍照', fn: takePhoto },
            { icon: '🖼️', label: '相册', fn: pickPhoto },
            { icon: '📄', label: '文档', fn: pickDoc },
          ].map((b) => (
            <Pressable key={b.label} onPress={b.fn} style={({ pressed }) => [
              { alignItems: 'center', backgroundColor: '#FFF8F2', borderWidth: 1, borderColor: '#FFD9BC', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 9, marginHorizontal: 6 },
              pressed && { opacity: 0.6 },
            ]}>
              <Text style={{ fontSize: 20 }}>{b.icon}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: T.orangeDeep, marginTop: 3 }}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Section title="处理动态" right={`${s.jobs.length} 条`}>
        <Card>
          {s.jobs.length ? s.jobs.slice(0, 15).map((j) => (
            <Pressable key={j.id} onLongPress={() => setMenu({ job: j })} delayLongPress={350}
              style={{ paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: T.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>{KIND[j.kind].icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.text }} numberOfLines={1}>
                    {j.status === 'done' && j.extract ? (j.extract.title || j.title) : j.title}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }}>
                    {fmtTime(j.createdAt)}
                    {j.kind === 'audio' && j.dur ? ` · ${Math.round(j.dur)}秒` : ''}
                    {j.size ? ` · ${(j.size / 1024).toFixed(0)}KB` : ''}
                    {j.status !== 'done' ? ` · ${j.statusText}` : ''}
                    {j.status === 'error' && j.error ? `\n⚠️ ${j.error}` : ''}
                  </Text>
                </View>
                {j.kind === 'audio' && j.status === 'done' ? <PlayBtn uri={j.uri} /> : null}
                {j.status === 'error' ? (
                  <Pressable onPress={() => { retryJob(j.id); toast('已重新入队'); }} style={{ marginLeft: 8, backgroundColor: T.redSoft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: T.red }}>重试</Text>
                  </Pressable>
                ) : (
                  <View style={{ marginLeft: 8 }}><Chip text={STATUS[j.status].t} tone={STATUS[j.status].c} /></View>
                )}
              </View>
              {j.status === 'done' && j.extract ? (
                <Text style={{ fontSize: 11.5, color: T.text2, lineHeight: 19, marginTop: 6 }} numberOfLines={2}>
                  {(j.extract.summary || '').slice(0, 80)}
                </Text>
              ) : null}
            </Pressable>
          )) : (
            <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center', paddingVertical: 18, lineHeight: 20 }}>
              还没有记录{'\n'}录一段音 / 拍张板书试试，处理完会自动出现在今日、卡片、心情、搭子
            </Text>
          )}
        </Card>
      </Section>

      <Card style={{ backgroundColor: T.greenSoft, borderWidth: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: T.green, marginBottom: 4 }}>🔒 隐私</Text>
        <Text style={{ fontSize: 11.5, color: '#3E8A73', lineHeight: 20 }}>
          音频与照片仅存手机本地；转写与提炼调用云端 API（DeepSeek / 火山 ASR），完成即弃，不留存第三方。
        </Text>
      </Card>

      <ActionSheet
        visible={!!menu} onClose={() => setMenu(null)}
        title={menu ? `${menu.job.title} · ${fmtTime(menu.job.createdAt)}` : ''}
        options={menu ? [
          menu.job.status === 'error' && { icon: '🔄', label: '重新处理', onPress: () => { retryJob(menu.job.id); toast('已重新入队'); } },
          { icon: '🗑️', label: '删除这条记录', tone: 'danger', onPress: async () => { await deleteJob(menu.job.id); toast('已删除'); } },
          { icon: '🧹', label: '删除记录及其生成的卡片/待办', tone: 'danger', onPress: async () => { await deleteJob(menu.job.id, true); toast('已删除记录及产物'); } },
        ] : []}
      />
    </View>
  );
}
