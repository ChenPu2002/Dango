import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Card, PulseDot, MarkdownText } from '../ui';
import { T } from '../theme';
import { useStore, setState, getState, uid } from '../store';
import { llmChat, ASK_SYS, buildAskContext } from '../api';

const QUICK = ['我这周学了什么？', '高数作业是哪几题？', '我最近的心情怎么样？', '周五要交什么？'];

export default function Ask({ toast }) {
    const s = useStore();
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef(null);
  const chats = s.chats || []; // 旧→新，最新在底部

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [chats.length, thinking]);

  const send = async (text) => {
    const question = (text || q).trim();
    if (!question || thinking) return;
    setQ('');
    const chatId = uid();
    setState((st) => ({ ...st, chats: [...st.chats, { id: chatId, q: question, a: '', at: Date.now() }].slice(-50) }));
    setThinking(true);
    try {
      const ctx = buildAskContext(getState(), question);
      const a = await llmChat([
        { role: 'system', content: ASK_SYS },
        { role: 'user', content: `记忆上下文：\n${ctx}\n\n用户提问：${question}` },
      ], 800);
      setState((st) => ({ ...st, chats: st.chats.map((c) => (c.id === chatId ? { ...c, a } : c)) }));
    } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 80);
      setState((st) => ({ ...st, chats: st.chats.map((c) => (c.id === chatId ? { ...c, a: '查询失败：' + msg } : c)) }));
    }
    setThinking(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 14, marginTop: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: T.text }}>问答 💬</Text>
          <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 3 }}>随时问你的历史记录 · 基于本地记忆（画像/笔记/卡片/转写）</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}
          onContentSizeChange={() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {!chats.length ? (
            <Card style={{ alignItems: 'center', paddingVertical: 18 }}>
              <Text style={{ fontSize: 28 }}>💬</Text>
              <Text style={{ fontSize: 12, color: T.sub, marginTop: 6 }}>试试这些问题</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                {QUICK.map((t) => (
                  <Pressable key={t} onPress={() => send(t)} style={({ pressed }) => [{ backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, margin: 4 }, pressed && { opacity: 0.6 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: T.orangeDeep }}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {chats.map((c) => (
            <View key={c.id} style={{ marginTop: 12 }}>
              <View style={{ alignSelf: 'flex-end', backgroundColor: T.orange, borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 2, paddingVertical: 10, maxWidth: '84%' }}>
                <Text style={{ fontSize: 13.5, color: '#fff', lineHeight: 21 }}>{c.q}</Text>
              </View>
              <View style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 2, paddingVertical: 10, maxWidth: '92%', marginTop: 8, ...T.shadow }}>
                {c.a ? (
                  <MarkdownText text={c.a} style={{ fontSize: 13, color: T.text2 }} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <PulseDot />
                    <Text style={{ fontSize: 12, color: T.sub, marginLeft: 8 }}>翻查记忆中…</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
          {chats.length > 3 ? (
            <Pressable onPress={() => setState((st) => ({ ...st, chats: [] }))} style={{ alignSelf: 'center', marginTop: 12 }}>
              <Text style={{ fontSize: 11, color: T.sub }}>清空对话</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {/* 输入行：固定底部，键盘弹出自动上推 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 88, borderTopWidth: 0.5, borderTopColor: T.line, backgroundColor: T.bg }}>
          <TextInput
            value={q} onChangeText={setQ} placeholder="问点什么…（如：作业是哪几题？）"
            placeholderTextColor={T.sub}
            onSubmitEditing={() => send()} returnKeyType="send"
            style={{ flex: 1, fontSize: 13.5, color: T.text, backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11, ...T.shadow }}
          />
          <Pressable onPress={() => send()} disabled={thinking} style={({ pressed }) => [
            { marginLeft: 10, backgroundColor: q.trim() && !thinking ? T.orange : '#E3E6EA', borderRadius: 99, paddingHorizontal: 18, paddingVertical: 11 }, pressed && { opacity: 0.7 },
          ]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>发送</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
