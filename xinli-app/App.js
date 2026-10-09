import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TextInput, StatusBar, Platform, Pressable, Animated, Keyboard } from 'react-native';
import { T } from './src/theme';
import { Ic } from './src/icons';
import { Card, TabBar, Toast, ActionSheet, Sheet, Btn, GhostBtn, PulseDot } from './src/ui';
import { initStore, useStore, getState } from './src/store';
import { runArchivist, nightlyMaintenance } from './src/pipeline';
import { useRecorder } from './src/useRecorder';
import Today from './src/screens/Today';
import Journal from './src/screens/Journal';
import Ask from './src/screens/Ask';
import Me from './src/screens/Me';

const TABS = [
  { key: 'today', icon: 'home', label: '今日' },
  { key: 'journal', icon: 'book', label: '手帐' },
  { key: 'ask', icon: 'chat', label: '对话' },
  { key: 'me', icon: 'user', label: '我的' },
];

const mmss = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

/* 开始记录：归属由用户主动选择（不靠 AI 猜）——💡灵感闲聊 / 📖课堂录音（选课） */
function RecStartSheet({ visible, onClose, courses, onStart }) {
  const [pickClass, setPickClass] = useState(false);
  const [newCourse, setNewCourse] = useState('');
  useEffect(() => { if (visible) { setPickClass(false); setNewCourse(''); } }, [visible]);
  const bigBtn = (icon, title, sub, onPress, fg, bg) => (
    <Pressable onPress={onPress} style={({ pressed }) => [
      { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, backgroundColor: bg, marginBottom: 9 },
      pressed && { opacity: 0.7 },
    ]}>
      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <Ic name={icon} size={20} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '800', color: T.text }}>{title}</Text>
        <Text style={{ fontSize: 10.5, color: T.sub, marginTop: 2, lineHeight: 15 }}>{sub}</Text>
      </View>
      <Ic name="chevR" size={16} color="#C6BFB4" />
    </Pressable>
  );
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: T.text, marginBottom: 12 }}>开始记录</Text>
      {bigBtn('sparkle', '灵感闲聊', '随想 · 约定 · 吐槽 → 待办 / 心情 / 画像，不进课程', () => { onClose(); onStart({ mode: 'casual' }); }, T.purple, T.purpleSoft)}
      {bigBtn('book', '课堂录音', '选一门课 → 转写 · 分段提炼 · 笔记与复习卡片', () => setPickClass(true), T.orangeDeep, T.orangeSoft)}
      {pickClass ? (
        <View style={{ borderTopWidth: 0.5, borderTopColor: T.line, paddingTop: 10 }}>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: T.sub, marginBottom: 8 }}>这节课是——</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {courses.map((c) => (
              <Pressable key={c} onPress={() => { onClose(); onStart({ mode: 'class', course: c }); }}
                style={({ pressed }) => [{ borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: T.orangeSoft }, pressed && { opacity: 0.6 }]}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: T.orangeDeep }}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput value={newCourse} onChangeText={setNewCourse} placeholder="新课程名…" placeholderTextColor={T.sub} returnKeyType="done"
              style={{ flex: 1, fontSize: 13, color: T.text, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }} />
            <Pressable onPress={() => { if (newCourse.trim()) { onClose(); onStart({ mode: 'class', course: newCourse.trim() }); } }}
              style={({ pressed }) => [{ marginLeft: 8, backgroundColor: T.orange, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 }, pressed && { opacity: 0.7 }]}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>开始</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/* 录音控制浮层：录音中点 FAB 只会打开这里（不会误结束）；
 * 「丢弃」需按住 700ms 进度填满才执行，防手滑 */
function RecPanel({ visible, onClose, sec, mode, course, onStop, onDiscard }) {
  const hold = useRef(new Animated.Value(0)).current;
  const holdAni = useRef(null);
  const startHold = () => {
    holdAni.current = Animated.timing(hold, { toValue: 1, duration: 700, useNativeDriver: false }).start((fin) => {
      hold.setValue(0);
      if (fin.finished) { onClose(); onDiscard(); }
    });
  };
  const cancelHold = () => { if (holdAni.current) holdAni.current.stop(); hold.setValue(0); };
  const fillW = hold.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ alignItems: 'center', paddingBottom: 4 }}>
        <PulseDot />
        <Text style={{ fontSize: 36, fontWeight: '900', color: T.text, marginTop: 10, fontVariant: ['tabular-nums'] }}>{mmss(sec)}</Text>
        <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 2 }}>
          {mode === 'casual' ? '💡 灵感闲聊 · 完成后轻量整理' : `📖 ${course || '课堂'} · 完成后转写+提炼`}
        </Text>
      </View>
      <Btn text="完成 · 保存并整理" onPress={() => { onClose(); onStop(); }} style={{ marginTop: 16 }} />
      <GhostBtn text="继续录音" onPress={onClose} style={{ marginTop: 8 }} />
      <Pressable onPressIn={startHold} onPressOut={cancelHold} delayPressIn={0}
        style={{ marginTop: 8, borderRadius: 14, borderWidth: 1.5, borderColor: '#F5B8B0', backgroundColor: T.redSoft, paddingVertical: 13, alignItems: 'center', overflow: 'hidden' }}>
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: fillW, backgroundColor: 'rgba(224,84,71,0.20)' }} />
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.red }}>按住不放 · 丢弃这段录音</Text>
      </Pressable>
    </Sheet>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('today');
  const [toastMsg, setToastMsg] = useState(null);
  const [fabMenu, setFabMenu] = useState(false);
  const [askPrefill, setAskPrefill] = useState('');
  const [recPanel, setRecPanel] = useState(false);
  const [startSheet, setStartSheet] = useState(false);
  const [kb, setKb] = useState(false);
  const toastTimer = useRef(null);
  const io = useRecorder((m) => toast(m));
  const pulse = useRef(new Animated.Value(1)).current;
  const s = useStore();
  const courses = Object.keys((s && s.courseNotes) || {}).filter((k) => k !== '日常');

  const toast = (m) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2400);
  };

  useEffect(() => {
    (async () => {
      await initStore();
      setReady(true);
      setTimeout(() => runArchivist(), 3000); /* 日终归档 */
    })();
  }, []);

  /* 键盘弹出时隐藏 FAB（输入优先），收起即恢复——四个 Tab 一律常驻录音入口 */
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKb(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  /* 记忆整理自动运转·兜底之二：App 活跃期间每 30 分钟检查一次，超 20 小时未维护则触发
   * （移动端没有严格 cron：启动归档兜底之一 + 此处 + lastNightlyAt 幂等标记，三重保证） */
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - (getState().lastNightlyAt || 0) > 20 * 3600e3) {
        nightlyMaintenance().catch(() => {});
      }
    }, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (io.rec.on) {
      const a = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }), Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true })]));
      a.start();
      return () => a.stop();
    }
  }, [io.rec.on, pulse]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ic name="sparkle" size={34} color={T.orange} />
        <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, marginTop: 14, letterSpacing: 2 }}>团 子</Text>
        <Text style={{ fontSize: 11, color: T.sub, marginTop: 6 }}>记忆整理中…</Text>
      </View>
    );
  }

  const showFab = !kb;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, maxWidth: 430, alignSelf: 'center', width: '100%', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0 }}>
        {tab === 'today' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 180, paddingHorizontal: 12 }} keyboardShouldPersistTaps="handled">
            <Today toast={toast} goAsk={(q) => { setAskPrefill(q); setTab('ask'); }} goJournal={() => setTab('journal')} />
          </ScrollView>
        )}
        {tab === 'journal' && <Journal toast={toast} goAsk={(q) => { setAskPrefill(q); setTab('ask'); }} />}
        {tab === 'ask' && <Ask toast={toast} prefill={askPrefill} clearPrefill={() => setAskPrefill('')} />}
        {tab === 'me' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 180, paddingHorizontal: 12 }} keyboardShouldPersistTaps="handled">
            <Me toast={toast} go={setTab} />
          </ScrollView>
        )}

        <TabBar tabs={TABS} active={tab} onChange={setTab} fabGap />

        {/* 中央录音 FAB：四个 Tab 常驻（键盘弹出时让位）；点按先选场景（课堂/灵感），录音中点击弹控制浮层 */}
        {showFab ? (
          <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' }} pointerEvents="box-none">
            <Animated.View style={{ transform: [{ scale: io.rec.on ? pulse : 1 }] }}>
              <Pressable
                onPress={io.rec.on ? () => setRecPanel(true) : () => setStartSheet(true)}
                onLongPress={() => !io.rec.on && setFabMenu(true)}
                delayLongPress={300}
                accessibilityLabel={io.rec.on ? '录音控制' : '开始记录'}
                style={({ pressed }) => [
                  {
                    width: 58, height: 58, borderRadius: 99, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: io.rec.on ? T.red : T.orange,
                    shadowColor: io.rec.on ? T.red : T.orange, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
                    borderWidth: 4, borderColor: '#fff',
                  }, pressed && { opacity: 0.8 },
                ]}>
                <Ic name={io.rec.on ? 'pause' : 'mic'} size={24} color="#fff" stroke={2} />
              </Pressable>
            </Animated.View>
            {io.rec.on ? (
              <View style={{ position: 'absolute', top: -20, alignItems: 'center', backgroundColor: 'rgba(30,30,35,.82)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10.5, color: '#fff', fontVariant: ['tabular-nums'] }}>
                  {io.rec.mode === 'casual' ? '💡' : '📖'}{io.rec.mode === 'class' && io.rec.course ? `${io.rec.course.slice(0, 4)} ` : ''}{mmss(io.rec.sec)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <RecStartSheet visible={startSheet} onClose={() => setStartSheet(false)} courses={courses}
          onStart={(meta) => io.start(meta)} />
        <RecPanel visible={recPanel} onClose={() => setRecPanel(false)} sec={io.rec.sec}
          mode={io.rec.mode} course={io.rec.course}
          onStop={io.stop} onDiscard={io.discard} />

        <ActionSheet
          visible={fabMenu} onClose={() => setFabMenu(false)}
          title="除了录音，还可以"
          options={[
            { icon: 'camera', label: '拍照（板书/PPT）', onPress: () => io.takePhoto() },
            { icon: 'image', label: '从相册选择', onPress: () => io.pickPhoto() },
            { icon: 'doc', label: '文档（txt/md）', onPress: () => io.pickDoc() },
          ]}
        />
        <Toast msg={toastMsg} />
      </SafeAreaView>
    </View>
  );
}
