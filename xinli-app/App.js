import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StatusBar, Platform, Pressable, Animated, Keyboard } from 'react-native';
import { T } from './src/theme';
import { Ic } from './src/icons';
import { Card, TabBar, Toast, ActionSheet, Sheet, Btn, GhostBtn, PulseDot } from './src/ui';
import { initStore, useStore } from './src/store';
import { runArchivist } from './src/pipeline';
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

/* 录音控制浮层：录音中点 FAB 只会打开这里（不会误结束）；
 * 「丢弃」需按住 700ms 进度填满才执行，防手滑 */
function RecPanel({ visible, onClose, sec, onStop, onDiscard }) {
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
        <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 2 }}>正在录制 · 完成后自动转写并整理</Text>
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
  const [kb, setKb] = useState(false);
  const toastTimer = useRef(null);
  const io = useRecorder((m) => toast(m));
  const pulse = useRef(new Animated.Value(1)).current;

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

        {/* 中央录音 FAB：四个 Tab 常驻（键盘弹出时让位）；录音中点击弹出控制浮层，防误触 */}
        {showFab ? (
          <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' }} pointerEvents="box-none">
            <Animated.View style={{ transform: [{ scale: io.rec.on ? pulse : 1 }] }}>
              <Pressable
                onPress={io.rec.on ? () => setRecPanel(true) : io.start}
                onLongPress={() => !io.rec.on && setFabMenu(true)}
                delayLongPress={300}
                accessibilityLabel={io.rec.on ? '录音控制' : '开始录音'}
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
                <Text style={{ fontSize: 10.5, color: '#fff', fontVariant: ['tabular-nums'] }}>⏺ {mmss(io.rec.sec)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <RecPanel visible={recPanel} onClose={() => setRecPanel(false)} sec={io.rec.sec}
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
