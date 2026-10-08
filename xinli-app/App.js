import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StatusBar, Platform, Pressable, Animated } from 'react-native';
import { T } from './src/theme';
import { Ic } from './src/icons';
import { Card, TabBar, Toast, ActionSheet } from './src/ui';
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

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('today');
  const [toastMsg, setToastMsg] = useState(null);
  const [fabMenu, setFabMenu] = useState(false);
  const [askPrefill, setAskPrefill] = useState('');
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

  const mmss = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  const showFab = tab !== 'ask';

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

        <TabBar tabs={TABS} active={tab} onChange={setTab} fabGap={showFab} />

        {/* 中央录音 FAB：泊在 Tab 栏中间缺口（对话页隐藏，输入框优先） */}
        {showFab ? (
          <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' }} pointerEvents="box-none">
            <Animated.View style={{ transform: [{ scale: io.rec.on ? pulse : 1 }] }}>
              <Pressable
                onPress={io.rec.on ? io.stop : io.start}
                onLongPress={() => !io.rec.on && setFabMenu(true)}
                delayLongPress={300}
                accessibilityLabel="录音按钮"
                style={({ pressed }) => [
                  {
                    width: 58, height: 58, borderRadius: 99, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: io.rec.on ? T.red : T.orange,
                    shadowColor: io.rec.on ? T.red : T.orange, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
                    borderWidth: 4, borderColor: '#fff',
                  }, pressed && { opacity: 0.8 },
                ]}>
                <Ic name={io.rec.on ? 'stop' : 'mic'} size={24} color="#fff" stroke={2} />
              </Pressable>
            </Animated.View>
            {io.rec.on ? (
              <Pressable onPress={io.discard} style={{ position: 'absolute', right: 96, bottom: 14, backgroundColor: T.redSoft, borderWidth: 1.5, borderColor: '#F0C4BE', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ fontSize: 12, color: T.red, fontWeight: '700' }}>丢弃 {mmss(io.rec.sec)}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

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
