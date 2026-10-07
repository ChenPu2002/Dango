import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Audio from 'expo-audio';
import { Card, Section, Chip, ActionSheet } from '../ui';
import Svg, { Path } from 'react-native-svg';
import { T } from '../theme';
import { useStore, fmtTime, fmtDate } from '../store';
import { deleteJob } from '../pipeline';

const KIND = { audio: { icon: '🎧', label: '录音' }, photo: { icon: '📷', label: '课堂照片' }, doc: { icon: '📄', label: '文档' } };

function PlayBtn({ uri }) {
  const player = Audio.useAudioPlayer({ uri });
  const [playing, setPlaying] = useState(false);
  return (
    <Pressable onPress={() => { playing ? player.pause() : player.play(); setPlaying(!playing); }}
      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
      <View style={{ width: 30, height: 30, borderRadius: 99, backgroundColor: T.orange, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 11 }}>{playing ? '⏸' : '▶'}</Text>
      </View>
      <Text style={{ fontSize: 11.5, color: T.orangeDeep, marginLeft: 8, fontWeight: '700' }}>{playing ? '暂停' : '播放原声'}</Text>
    </Pressable>
  );
}

function Entry({ j, go, onMenu }) {
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
          <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '700', color: T.text }} numberOfLines={1}>
            {KIND[j.kind].icon} {ex ? (ex.title || j.title) : j.title}
          </Text>
          <Text style={{ fontSize: 11, color: T.sub, transform: [{ rotate: open ? '180deg' : '0deg' }] }}>▾</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {processing ? <Chip text={j.statusText} tone="p" /> : (
            <>
              {ex && ex.cards ? <Chip text={`卡片 ${ex.cards.length} 张`} /> : null}
              {ex && ex.todos && ex.todos.length ? <Chip text={`待办 ${ex.todos.length} 条`} tone="p" /> : null}
              {ex && ex.mood && ex.mood.emoji ? <Chip text={`心情 ${ex.mood.emoji}`} tone="g" /> : null}
            </>
          )}
        </View>
        {open && !processing && ex ? (
          <View style={{ borderTopWidth: 0.5, borderTopColor: T.line, marginTop: 10, paddingTop: 10 }}>
            <Text style={{ fontSize: 12.5, color: T.text2, lineHeight: 21 }}>{ex.summary}</Text>
            {ex.outline && ex.outline.length ? (
              <Text style={{ fontSize: 12, color: T.text2, lineHeight: 21, marginTop: 6 }}>
                {ex.outline.map((o) => `• ${o}`).join('\n')}
              </Text>
            ) : null}
            {ex.points && ex.points.length ? (
              <Text style={{ fontSize: 12, color: T.text, lineHeight: 21, marginTop: 6, fontWeight: '500' }}>
                {ex.points.map((p) => `★ ${p}`).join('\n')}
              </Text>
            ) : null}
            {ex.keywords && ex.keywords.length ? (
              <Text style={{ fontSize: 11, color: T.sub, marginTop: 6 }}>#{ex.keywords.join('  #')}</Text>
            ) : null}
            {j.kind === 'audio' ? <PlayBtn uri={j.uri} /> : null}
            {j.asrText ? (
              <Pressable onPress={() => setShowRaw(!showRaw)} style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.orangeDeep }}>{showRaw ? '收起原文' : '查看转写原文'}</Text>
                {showRaw ? (
                  <Text style={{ fontSize: 11.5, color: T.sub, lineHeight: 19, marginTop: 6 }}>{j.asrText}</Text>
                ) : null}
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Card>
      </Pressable>
    </View>
  );
}

export default function Today({ go, toast }) {
  const s = useStore();
  const [menu, setMenu] = useState(null); // {job}
  const today = new Date().getDate();
  const todayJobs = s.jobs.filter((j) => new Date(j.createdAt).getDate() === today);
  const doneJobs = todayJobs.filter((j) => j.status === 'done');
  const latestMood = s.moods[0];
  const todayDigest = (s.dailies || []).find((d) => d.date === `${new Date().getMonth() + 1}.${today}`);
  return (
    <View>
      {/* 紧凑头部：日期 + 统计一行 + 今日小结 */}
      <View style={{ paddingHorizontal: 2, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: T.text, flex: 1 }}>{fmtDate(Date.now())} · 今天</Text>
          {latestMood ? <Text style={{ fontSize: 16 }}>{latestMood.emoji}</Text> : null}
        </View>
        <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 2 }}>
          {s.jobs.length ? `${doneJobs.length}/${todayJobs.length} 条完成 · 卡片 ${s.cards.filter((c) => c.status === 'active').length} 张 · 待办 ${s.todos.filter((t) => !t.done).length} 件` : '录一段音，让今天被记住'}
        </Text>
      </View>

      {latestMood ? (() => {
        const idx = latestMood.score || 3; /* 状态跟随最新一条 */
        const st = idx >= 4 ? { en: 'PERFECT', zh: '状态极佳', color: '#2FA47A' } : idx >= 3 ? { en: 'GOOD', zh: '状态不错', color: '#6BBF59' } : idx >= 2 ? { en: 'BAD', zh: '有点低落', color: '#F5A623' } : { en: 'BOOM', zh: '需要休息', color: '#F04C3C' };
        const list = s.moods.slice(0, 7).reverse();
        const W = 300, H = 44;
        const pts = list.length > 1 ? list.map((m, i) => ({ x: 10 + (i * (W - 20)) / (list.length - 1), y: H - 6 - (m.score || 3) * 7 })) : null;
        let d = '';
        if (pts) { d = `M${pts[0].x},${pts[0].y}`; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]; d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`; } }
        return (
          <Card style={{ paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 26, fontWeight: '900', color: st.color, letterSpacing: 0.5 }}>{st.en}</Text>
              <Text style={{ fontSize: 12, color: T.sub, marginLeft: 8 }}>{st.zh}</Text>
              <Text style={{ fontSize: 14, marginLeft: 6 }}>{latestMood.emoji}</Text>
              <View style={{ flex: 1 }} />
              {(latestMood.tags || []).slice(0, 2).map((t) => (
                <View key={t} style={{ backgroundColor: '#FFF0F4', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 4 }}>
                  <Text style={{ fontSize: 10, color: T.red }}>{t}</Text>
                </View>
              ))}
            </View>
            {pts ? (
              <View style={{ marginTop: 8 }}>
                <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
                  <Path d={d} fill="none" stroke={T.orange} strokeWidth="2" strokeLinecap="round" />
                </Svg>
              </View>
            ) : null}
            {(latestMood.moments || []).slice(0, 2).map((mo, i) => (
              <Text key={i} style={{ fontSize: 11.5, color: T.text2, lineHeight: 18, marginTop: 4 }}>
                <Text style={{ color: T.sub, fontSize: 10.5 }}>{mo.t || ''}  </Text>{mo.text}
              </Text>
            ))}
          </Card>
        );
      })() : null}

      {todayDigest ? (
        <Pressable onPress={() => go('mood')} style={({ pressed }) => [{ marginTop: 8 }, pressed && { opacity: 0.7 }]}>
          <View style={{ backgroundColor: '#FFF6EF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 15, marginRight: 8 }}>{todayDigest.emoji}</Text>
            <Text style={{ flex: 1, fontSize: 11.5, color: '#8A5570', lineHeight: 17 }} numberOfLines={2}>今日小结：{todayDigest.summary}</Text>
          </View>
        </Pressable>
      ) : null}

      <Section title="时间线" right={`${s.jobs.length} 条`}>
        {s.jobs.length ? (
          <View style={{ marginTop: 4 }}>
            {s.jobs.slice(0, 12).map((j) => <Entry key={j.id} j={j} go={go} onMenu={(job) => setMenu({ job })} />)}
          </View>
        ) : (
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <Text style={{ fontSize: 30 }}>🎙️</Text>
            <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 8, lineHeight: 20 }}>还没有记录{'\n'}去「录音」页录一段试试</Text>
            <Pressable onPress={() => go('record')} style={{ marginTop: 12, backgroundColor: T.orange, borderRadius: 99, paddingHorizontal: 22, paddingVertical: 10 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>去录音</Text>
            </Pressable>
          </Card>
        )}
      </Section>

      {/* 课程笔记（活文档）*/}
      {Object.keys(s.courseNotes || {}).length ? (
        <Section title="课程笔记" right="活文档·自动累积">
          {Object.entries(s.courseNotes).slice(0, 5).map(([course, note]) => (
            <Card key={course}>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: T.text }}>📘 {course}</Text>
              <Text style={{ fontSize: 11.5, color: T.text2, lineHeight: 19, marginTop: 6 }} numberOfLines={4}>{note.content}</Text>
            </Card>
          ))}
        </Section>
      ) : null}

      {/* 情绪记录（完整时间线）*/}
      {s.moods.length ? (
        <Section title="情绪记录" right={`${s.moods.length} 条`}>
          <Card>
            {s.moods.slice(0, 8).map((m) => {
              const st = (m.score || 3) >= 4 ? 'PERFECT' : (m.score || 3) >= 3 ? 'GOOD' : (m.score || 3) >= 2 ? 'BAD' : 'BOOM';
              return (
                <View key={m.id} style={{ borderLeftWidth: 2, borderLeftColor: '#FFD3B0', paddingLeft: 10, marginBottom: 9 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '800', color: (m.score||3)>=4?'#2FA47A':(m.score||3)>=3?'#6BBF59':(m.score||3)>=2?'#F5A623':'#F04C3C' }}>{st}</Text>
                    <Text style={{ fontSize: 10.5, color: T.sub, marginLeft: 8 }}>{fmtDate(m.createdAt)} {new Date(m.createdAt).toTimeString().slice(0, 5)}</Text>
                    <Text style={{ fontSize: 10, color: T.sub, marginLeft: 8 }}>{(m.tags || []).join(' ')}</Text>
                  </View>
                  {(m.moments || []).slice(0, 2).map((mo, i) => (
                    <Text key={i} style={{ fontSize: 11.5, color: T.text2, lineHeight: 18, marginTop: 3 }}>{mo.text}</Text>
                  ))}
                </View>
              );
            })}
          </Card>
        </Section>
      ) : null}

      {/* 用户画像 */}
      {s.profile && s.profile.text ? (
        <Section title="小满的画像" right="AI 滚动累积">
          <Card>
            <Text style={{ fontSize: 11.5, color: T.text2, lineHeight: 19 }}>{s.profile.text.slice(0, 300)}</Text>
          </Card>
        </Section>
      ) : null}

      <ActionSheet
        visible={!!menu} onClose={() => setMenu(null)}
        title={menu ? `${menu.job.title} · 长按菜单` : ''}
        options={menu ? [
          { icon: '🗑️', label: '删除本条记录', tone: 'danger', onPress: async () => { await deleteJob(menu.job.id); toast('已删除记录'); } },
          { icon: '🧹', label: '删除记录及其生成的卡片/待办', tone: 'danger', onPress: async () => { await deleteJob(menu.job.id, true); toast('已删除记录及产物'); } },
        ] : []}
      />
    </View>
  );
}
