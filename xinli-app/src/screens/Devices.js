import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Card, Section, Bar, GhostBtn, PulseDot } from '../ui';
import { T } from '../theme';
import { CMD_LABEL } from '../api';

function ago(t) {
  if (!t) return '刚刚';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 5 ? '刚刚' : s < 60 ? `${s}秒前` : `${Math.round(s / 60)}分钟前`;
}
function dur(s) {
  const m = Math.floor(s / 60);
  return m ? `${m}分${s % 60}秒` : `${s}秒`;
}
const fileIcon = (name = '') => /\.(jpe?g|png|webp|heic)$/i.test(name) ? '🖼️'
  : /\.pdf$/i.test(name) ? '📕' : /\.docx?$/i.test(name) ? '📘'
  : /\.(webm|m4a|mp3|wav)$/i.test(name) ? '🎙️' : '📄';

/* ===== 工作台：真实上传 + 真实录音 ===== */
function Workbench({ uploadAndProcess, rec, startRec, stopRec }) {
  const tile = (icon, label, sub, onPress, danger) => (
    <Pressable onPress={onPress} style={({ pressed }) => [
      { flex: 1, backgroundColor: '#fff', borderRadius: 16, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderWidth: 1, borderColor: danger ? '#F5B8B0' : '#FFF0E4', marginRight: 8 },
      T.shadow, pressed && { opacity: 0.6 },
    ]}>
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <Text style={{ fontSize: 12, fontWeight: '800', color: danger ? T.red : T.text, marginTop: 5 }}>{label}</Text>
      <Text style={{ fontSize: 9.5, color: T.sub, marginTop: 2, textAlign: 'center' }}>{sub}</Text>
    </Pressable>
  );
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, flex: 1 }}>⚡ 实时工作台</Text>
        <View style={{ backgroundColor: T.greenSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 9.5, fontWeight: '700', color: T.green }}>真实链路</Text>
        </View>
      </View>
      <Text style={{ fontSize: 11, color: T.sub, marginTop: 3 }}>手机上传 / 录音 → 电脑真实处理 → 产出文件回传</Text>
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        {tile('📷', '课堂照片', '压缩归档+回传预览', () => uploadAndProcess('photo'))}
        {tile('📄', 'Word/文档', 'textutil 转PDF', () => uploadAndProcess('doc'))}
        {rec.on
          ? tile('⏹', `停止 ${dur(rec.sec)}`, '上传并归档', stopRec, true)
          : tile('🎙️', '真实录音', '手机麦克风·归档', startRec)}
      </View>
      {rec.on ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <PulseDot />
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.red, marginLeft: 8 }}>正在录音 {dur(rec.sec)} · 点击上方按钮停止并上传</Text>
        </View>
      ) : null}
    </Card>
  );
}

/* ===== 产出文件 ===== */
function Artifacts({ artifacts, openArtifact }) {
  return (
    <Section title="产出文件" right={artifacts.length ? `${artifacts.length} 个` : '真实文件'}>
      <Card>
        {artifacts.length ? artifacts.map((a) => (
          <Pressable key={a.id + String(a.ts)} onPress={() => openArtifact(a.url)} style={({ pressed }) => [
            { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: T.line }, pressed && { opacity: 0.55 },
          ]}>
            <Text style={{ fontSize: 20, marginRight: 10 }}>{fileIcon(a.name)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }} numberOfLines={1}>{a.name}</Text>
              <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }}>{a.from || '电脑'} · {ago(a.ts)}</Text>
            </View>
            <View style={{ backgroundColor: T.orangeSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: T.orangeDeep }}>打开</Text>
            </View>
          </Pressable>
        )) : (
          <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center', paddingVertical: 16, lineHeight: 20 }}>还没有产出{'\n'}上传照片/文档或录音后，电脑生成的文件会出现在这里</Text>
        )}
      </Card>
    </Section>
  );
}

function BallCard({ d, send }) {
  const rec = d.status === 'recording';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 26, marginRight: 10 }}>🔮</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '800', color: T.text }}>{d.name}</Text>
          <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }}>上次心跳 {ago(d.lastSeen)}{d.sim ? ' · 演示数据' : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: !d.online ? '#F2F3F5' : rec ? T.redSoft : T.greenSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          {d.online && rec ? <PulseDot /> : <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: !d.online ? '#C6CBD2' : rec ? T.red : T.green }} />}
          <Text style={{ fontSize: 10, fontWeight: '700', color: !d.online ? T.sub : rec ? T.red : T.green, marginLeft: 5 }}>
            {!d.online ? '离线' : rec ? '录音中' : '待机'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        <View style={{ flex: 1, marginRight: 14 }}>
          <Text style={{ fontSize: 10, color: T.sub }}>电量 🔋</Text>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.text, marginTop: 1 }}>{(d.meta.battery || 0).toFixed(0)}%</Text>
          <Bar pct={d.meta.battery || 0} tone={T.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, color: T.sub }}>存储 💾</Text>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.text, marginTop: 1 }}>{(d.meta.storage || 0).toFixed(1)} / {d.meta.total || 32} G</Text>
          <Bar pct={((d.meta.storage || 0) / (d.meta.total || 32)) * 100} />
        </View>
      </View>
      {rec ? <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.red, marginTop: 10 }}>⏺ 本段已录 {dur(d.meta.session || 0)}</Text> : null}
      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        {rec ? (
          <>
            <GhostBtn text="⏸ 停止" onPress={() => send(d.id, 'stop_recording')} style={{ marginRight: 8 }} />
            <GhostBtn text="🔄 同步到电脑" onPress={() => send(d.id, 'sync')} />
          </>
        ) : (
          <>
            <GhostBtn text="⏺ 开始录音" onPress={() => send(d.id, 'start_recording')} style={{ marginRight: 8 }} />
            <GhostBtn text="🔄 同步到电脑" onPress={() => send(d.id, 'sync')} />
          </>
        )}
      </View>
      <Pressable onPress={() => send(d.id, 'burn')} style={({ pressed }) => [{ marginTop: 8, borderRadius: 12, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#F5B8B0', backgroundColor: T.redSoft }, pressed && { opacity: 0.6 }]}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: T.red }}>🔥 一键焚毁</Text>
      </Pressable>
    </Card>
  );
}

function PcCard({ d, send }) {
  const m = d.meta || {};
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 26, marginRight: 10 }}>💻</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '800', color: T.text }}>{d.name}</Text>
          <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }}>{m.os || ''} · 上次心跳 {ago(d.lastSeen)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: d.online ? T.green : '#C6CBD2' }} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: d.online ? T.green : T.sub, marginLeft: 5 }}>{d.online ? '在线' : '离线'}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        {[['CPU', `${m.cpu ?? '--'}%`], ['内存', `${m.mem ?? '--'}%`], ['磁盘剩余', `${m.diskFreeGb ?? '--'}G`], ['已运行', `${m.uptimeH ?? '--'}h`]].map(([l, v]) => (
          <View key={l} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: T.sub }}>{l}</Text>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.text, marginTop: 2 }}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        <GhostBtn text="📸 截屏" onPress={() => send(d.id, 'screenshot')} style={{ marginRight: 8 }} />
        <GhostBtn text="🔍 找文件" onPress={() => send(d.id, 'find_file', { q: '论文' })} style={{ marginRight: 8 }} />
        <GhostBtn text="📂 归档目录" onPress={() => send(d.id, 'open_downloads')} style={{ marginRight: 8 }} />
        <GhostBtn text="📊 报告" onPress={() => send(d.id, 'sysinfo')} />
      </View>
    </Card>
  );
}

export default function Devices(props) {
  const { devices, feed, send, online } = props;
  return (
    <View>
      <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.text }}>工作台 🧰</Text>
        <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 4 }}>
          {online ? '多端实时 · 手机 ⇄ 后台 ⇄ 电脑 CLI' : '演示模式（./run.sh 启动真实链路）'}
        </Text>
      </View>

      <Workbench uploadAndProcess={props.uploadAndProcess} rec={props.rec} startRec={props.startRec} stopRec={props.stopRec} />

      <Artifacts artifacts={props.artifacts} openArtifact={props.openArtifact} />

      <Section title="在线设备">
        <View>
          {devices.length ? devices.map((d) => d.type === 'ball'
            ? <BallCard key={d.id} d={d} send={send} />
            : <PcCard key={d.id} d={d} send={send} />
          ) : (
            <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ fontSize: 30 }}>📡</Text>
              <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 8, lineHeight: 20 }}>还没有设备接入{'\n'}在电脑上运行下方 CLI 命令</Text>
            </Card>
          )}
        </View>
      </Section>

      <Section title="指令动态" right={feed.length ? `共 ${feed.length} 条` : ''}>
        <Card>
          {feed.length ? feed.map((f) => (
            <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: T.line }}>
              <Text style={{ fontSize: 16, marginRight: 10 }}>{f.status === 'done' ? '✅' : f.status === 'run' ? '⚙️' : '📤'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: T.text }}>{f.name}</Text>
                <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2 }} numberOfLines={2}>{f.detail || `→ ${f.dev}`}</Text>
              </View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: f.status === 'done' ? T.green : T.sub }}>{f.status === 'done' ? '完成 ✓' : f.status === 'run' ? '执行中' : '已下发'}</Text>
            </View>
          )) : (
            <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center', paddingVertical: 16 }}>还没有指令 · 点上面的按钮试试</Text>
          )}
        </Card>
      </Section>

      <Section title="如何接入设备">
        <Card>
          <Text style={{ fontSize: 12, fontWeight: '700', color: T.text, marginBottom: 4 }}>电脑 agent（真实工具执行）</Text>
          <Text style={{ fontFamily: 'Menlo, monospace', fontSize: 11, color: T.orangeDeep, backgroundColor: '#2E2A3D', borderRadius: 10, padding: 10, lineHeight: 20 }}>node cli.js start --name "我的电脑"</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: T.text, marginTop: 12, marginBottom: 4 }}>心力球设备模拟器</Text>
          <Text style={{ fontFamily: 'Menlo, monospace', fontSize: 11, color: T.orangeDeep, backgroundColor: '#2E2A3D', borderRadius: 10, padding: 10, lineHeight: 20 }}>node cli.js ball</Text>
        </Card>
      </Section>

      <Card style={{ backgroundColor: T.greenSoft, borderWidth: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: T.green, marginBottom: 4 }}>🔒 传输与安全</Text>
        <Text style={{ fontSize: 11.5, color: '#3E8A73', lineHeight: 20 }}>全程本地局域网：文件经后台上传/取回，电脑真实处理（sips 压缩、textutil 转 PDF/Word、screencapture 截屏），产出文件统一落盘 ~/Downloads/拾光/ 并回传手机。</Text>
      </Card>
    </View>
  );
}
