import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Card, Section } from '../ui';
import { T } from '../theme';
import { useStore, fmtDate } from '../store';

const W = 320, H = 110, PADX = 24, PADY = 14;

/* Apple Watch 式四态 */
function moodState(v) {
  if (v >= 4) return { en: 'PERFECT', zh: '状态极佳', color: '#2FA47A' };
  if (v >= 3) return { en: 'GOOD', zh: '状态不错', color: '#6BBF59' };
  if (v >= 2) return { en: 'BAD', zh: '有点低落', color: '#F5A623' };
  return { en: 'BOOM', zh: '需要休息', color: '#F04C3C' };
}

/* 平滑曲线（Catmull-Rom → Bezier），健康 App 风格：无 emoji、渐变填充 */
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return d;
}

function MoodCurve({ moods }) {
  const list = moods.slice(0, 10).reverse();
  if (list.length === 1) {
    const p = { x: W / 2, y: H - PADY - list[0].score * ((H - PADY * 2) / 5) };
    return (
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <Circle cx={p.x} cy={p.y} r={5} fill={T.orange} />
        </Svg>
        <Text style={{ fontSize: 10.5, color: T.sub }}>记录更多后生成情绪曲线</Text>
      </View>
    );
  }
  const pts = list.map((m, i) => ({
    x: PADX + (i * (W - PADX * 2)) / (list.length - 1),
    y: H - PADY - (m.score || 3) * ((H - PADY * 2) / 5),
  }));
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1].x},${H - 2} L${pts[0].x},${H - 2} Z`;
  const last = pts[pts.length - 1];
  return (
    <View>
      <Svg width="100%" height={H + 8} viewBox={`0 0 ${W} ${H + 8}`}>
        <Defs>
          <LinearGradient id="moodg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FF6900" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#FF6900" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        <Path d={`M${PADX},${H - PADY} L${W - PADX},${H - PADY}`} stroke="#F0EBE6" strokeWidth="1" />
        <Path d={area} fill="url(#moodg)" />
        <Path d={line} fill="none" stroke={T.orange} strokeWidth="2.5" strokeLinecap="round" />
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 4.5 : 2.5} fill={i === pts.length - 1 ? T.orange : '#FFC9A3'} />
        ))}
        <Circle cx={last.x} cy={last.y} r={9} fill="#FF6900" opacity="0.15" />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ fontSize: 9.5, color: T.sub }}>{fmtDate(list[0].createdAt)}</Text>
        <Text style={{ fontSize: 9.5, color: T.sub, fontWeight: '700' }}>{fmtDate(list[list.length - 1].createdAt)} · 最新</Text>
      </View>
    </View>
  );
}

export default function Mood() {
  const s = useStore();
  const moods = s.moods;
  const latest = moods[0];

  if (!moods.length) {
    return (
      <View>
        <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: T.text }}>心情指数 🌙</Text>
        </View>
        <Card style={{ alignItems: 'center', paddingVertical: 30 }}>
          <Text style={{ fontSize: 30 }}>🌙</Text>
          <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 8, lineHeight: 20 }}>
            还没有心情记录{'\n'}录一段语音日记，AI 会感知你的情绪
          </Text>
        </Card>
      </View>
    );
  }

  /* 情绪指数：最近 3 条均值（HRV 式指标，1-5） */
  const idx = moods.slice(0, 3).reduce((a, m) => a + (m.score || 3), 0) / Math.min(3, moods.length);
  const prev = moods.length > 3 ? moods.slice(3, 6).reduce((a, m) => a + (m.score || 3), 0) / Math.min(3, moods.length - 3) : null;
  const trend = prev == null ? '' : idx > prev + 0.2 ? '↑ 好转' : idx < prev - 0.2 ? '↓ 走低' : '→ 平稳';

  const byDay = [];
  moods.slice(0, 30).forEach((m) => {
    const key = fmtDate(m.createdAt);
    const last = byDay[byDay.length - 1];
    if (last && last.key === key) last.items.push(m);
    else byDay.push({ key, items: [m] });
  });

  return (
    <View>
      <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.text }}>心情指数 🌙</Text>
        <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 4 }}>由 AI 从你的录音中感知 · 仅存本地</Text>
      </View>

      <Card>
        {(() => {
          const st = moodState(idx);
          const all = [moodState(1.2), moodState(2.4), moodState(3.3), moodState(4.5)];
          return (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 34, fontWeight: '900', color: st.color, letterSpacing: 1 }}>{st.en}</Text>
                <Text style={{ fontSize: 13, color: T.sub, marginLeft: 10 }}>{st.zh}</Text>
                {trend ? (
                  <View style={{ marginLeft: 8, backgroundColor: trend.startsWith('↑') ? T.greenSoft : trend.startsWith('↓') ? T.redSoft : '#F2F3F5', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: trend.startsWith('↑') ? T.green : trend.startsWith('↓') ? T.red : T.sub }}>{trend}</Text>
                  </View>
                ) : null}
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 15 }}>{latest.emoji}</Text>
              </View>
              {/* 四态标尺 */}
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                {all.map((a, i) => (
                  <View key={i} style={{ flex: 1, height: 5, borderRadius: 99, marginRight: 5, backgroundColor: a.en === st.en ? a.color : '#F0EBE6' }} />
                ))}
              </View>
            </View>
          );
        })()}
        <View style={{ marginTop: 6 }}><MoodCurve moods={moods} /></View>
      </Card>

      {(s.weeklies || []).length ? (
        <Section title="周记" right="夜间自动压缩">
          {s.weeklies.slice(0, 2).map((w) => (
            <Card key={w.range}>
              <Text style={{ fontSize: 10.5, color: T.sub, marginBottom: 4 }}>{w.range}</Text>
              <Text style={{ fontSize: 12.5, color: T.text2, lineHeight: 20 }}>{w.summary}</Text>
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title="情绪记录" right={`${moods.length} 条`}>
        {byDay.map((day) => (
          <Card key={day.key}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: T.orangeDeep, marginBottom: 6 }}>{day.key}</Text>
            {day.items.map((m) => (
              <View key={m.id} style={{ borderLeftWidth: 2, borderLeftColor: '#FFD3B0', paddingLeft: 10, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: moodState(m.score || 3).color, fontWeight: '800' }}>{moodState(m.score || 3).en}</Text>
                  <Text style={{ fontSize: 10.5, color: T.sub, marginLeft: 8 }}>{new Date(m.createdAt).toTimeString().slice(0, 5)}</Text>
                  <Text style={{ fontSize: 10, color: T.sub, marginLeft: 8 }}>{(m.tags || []).join(' ')}</Text>
                </View>
                {(m.moments || []).map((mo, i) => (
                  <Text key={i} style={{ fontSize: 12, color: T.text2, lineHeight: 19, marginTop: 3 }}>
                    <Text style={{ color: T.sub, fontSize: 10.5 }}>{mo.t || ''}  </Text>{mo.text}
                  </Text>
                ))}
              </View>
            ))}
          </Card>
        ))}
      </Section>
    </View>
  );
}
