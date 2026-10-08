import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StatusBar, Platform, Pressable, Animated } from 'react-native';
import { T } from './src/theme';
import { Card, TabBar, Toast, ActionSheet } from './src/ui';
import { initStore, useStore } from './src/store';
import { runArchivist } from './src/pipeline';
import { useRecorder } from './src/useRecorder';
import Today from './src/screens/Today';
import Journal from './src/screens/Journal';
import Ask from './src/screens/Ask';
import Me from './src/screens/Me';

const TABS = [
  { key: 'today', icon: '🏠', label: '今日' },
  { key: 'journal', icon: '📖', label: '手帐' },
  { key: 'ask', icon: '💬', label: '对话' },
  { key: 'me', icon: '⚙️', label: '我的' },
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
        <Text style={{ fontSize: 40 }}>🍡</Text>
        <Text style={{ fontSize: 14, color: T.sub, marginTop: 12 }}>团子启动中…</Text>
      </View>
    );
  }

  const mmss = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, maxWidth: 430, alignSelf: 'center', width: '100%', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0 }}>
        {tab === 'today' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 160, paddingHorizontal: 12 }} keyboardShouldPersistTaps="handled">
            <Today toast={toast} goAsk={(q) => { setAskPrefill(q); setTab('ask'); }} goJournal={() => setTab('journal')} />
          </ScrollView>
        )}
        {tab === 'journal' && <Journal toast={toast} goAsk={(q) => { setAskPrefill(q); setTab('ask'); }} />}
        {tab === 'ask' && <Ask toast={toast} prefill={askPrefill} clearPrefill={() => setAskPrefill('')} />}
        {tab === 'me' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 160, paddingHorizontal: 12 }} keyboardShouldPersistTaps="handled">
            <Me toast={toast} go={setTab} />
          </ScrollView>
        )}

        <TabBar tabs={TABS} active={tab} onChange={setTab} fabGap />

        {/* 中央录音 FAB */}
        <View style={{ position: 'absolute', bottom: 34, left: 0, right: 0, alignItems: 'center' }}>
          <Animated.View style={{ transform: [{ scale: io.rec.on ? pulse : 1 }] }}>
            <Pressable
              onPress={io.rec.on ? io.stop : io.start}
              onLongPress={() => !io.rec.on && setFabMenu(true)}
              delayLongPress={300}
              accessibilityLabel="录音按钮"
              style={({ pressed }) => [
                {
                  width: 62, height: 62, borderRadius: 99, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: io.rec.on ? T.red : T.orange,
                  shadowColor: io.rec.on ? T.red : '#F97C1F', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6,
                  borderWidth: 4, borderColor: '#fff',
                }, pressed && { opacity: 0.8 },
              ]}>
              <Text style={{ fontSize: 24, color: '#fff' }}>{io.rec.on ? '⏹' : '⏺'}</Text>
            </Pressable>
          </Animated.View>
          {io.rec.on ? (
            <Pressable onPress={io.discard} style={{ position: 'absolute', right: 60, top: 16, backgroundColor: T.redSoft, borderWidth: 1.5, borderColor: '#F5B8B0', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, color: T.red, fontWeight: '700' }}>丢弃 {mmss(io.rec.sec)}</Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 9.5, color: '#fff', marginTop: -8, backgroundColor: 'rgba(0,0,0,.25)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>录音 · 长按更多</Text>
          )}
        </View>

        <ActionSheet
          visible={fabMenu} onClose={() => setFabMenu(false)}
          title="除了录音，还可以"
          options={[
            { icon: '📷', label: '拍照（板书/PPT）', onPress: () => io.takePhoto() },
            { icon: '🖼️', label: '从相册选择', onPress: () => io.pickPhoto() },
            { icon: '📄', label: '文档（txt/md）', onPress: () => io.pickDoc() },
          ]}
        />
        <Toast msg={toastMsg} />
      </SafeAreaView>
    </View>
  );
}
