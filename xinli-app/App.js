import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StatusBar, Platform } from 'react-native';
import { T } from './src/theme';
import { TabBar, Toast } from './src/ui';
import { initStore } from './src/store';
import Today from './src/screens/Today';
import Ask from './src/screens/Ask';
import Cards from './src/screens/Cards';
import Buddy from './src/screens/Buddy';
import Mood from './src/screens/Mood';
import Record from './src/screens/Record';
import Me from './src/screens/Me';

const TABS = [
  { key: 'today', icon: '🏠', label: '今日' },
  { key: 'ask', icon: '💬', label: '问答' },
  { key: 'cards', icon: '🃏', label: '卡片' },
  { key: 'buddy', icon: '🧸', label: '搭子' },
  { key: 'record', icon: '📝', label: '记录' },
  { key: 'me', icon: '⚙️', label: '我的' },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('today');
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    (async () => {
      await initStore();
      setReady(true);
    })();
  }, []);

  const toast = (m) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2400);
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 40 }}>🔮</Text>
        <Text style={{ fontSize: 14, color: T.sub, marginTop: 12 }}>团子启动中…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, maxWidth: 430, alignSelf: 'center', width: '100%', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0 }}>
        {tab === 'ask' ? (
          <View style={{ flex: 1 }}>
            <Ask toast={toast} />
          </View>
        ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 12 }} keyboardShouldPersistTaps="handled">
          {tab === 'today' && <Today go={setTab} toast={toast} />}
          {tab === 'cards' && <Cards toast={toast} />}
          {tab === 'buddy' && <Buddy toast={toast} />}
          {tab === 'mood' && <Mood />}
          {tab === 'record' && <Record toast={toast} go={setTab} />}
          {tab === 'me' && <Me toast={toast} go={setTab} />}
        </ScrollView>
        )}
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
        <Toast msg={toastMsg} />
      </SafeAreaView>
    </View>
  );
}
