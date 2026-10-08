/* 对话：Agent Runtime 前端（工具循环 + 执行轨迹 + 行动结果 + 取消） */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Card, MarkdownText, PulseDot } from '../ui';
import { Ic } from '../icons';
import { T } from '../theme';
import { useStore, setState, uid } from '../store';
import { runAgent } from '../agent';

const QUICK = ['我最近的作业有哪些？', '上周学了什么？', '帮我记一下周五要交大纲', '我现在心情怎么样？'];

function StepLine({ steps }) {
  if (!steps || !steps.length) return null;
  return (
    <View style={{ marginTop: 6, backgroundColor: '#F5F2ED', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
      {steps.slice(-4).map((st, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 14, alignItems: 'center', marginRight: 6 }}>
            <View style={{ width: 4.5, height: 4.5, borderRadius: 99, backgroundColor: T.orange }} />
          </View>
          <Text style={{ flex: 1, fontSize: 10.5, color: T.sub, lineHeight: 16 }}>{st.brief}</Text>
        </View>
      ))}
    </View>
  );
}

function ActionChips({ actions }) {
  if (!actions || !actions.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
      {actions.map((a, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: T.greenSoft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginTop: 4 }}>
          <Ic name="check" size={11} color={T.green} stroke={2.4} />
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: T.green, marginLeft: 4 }}>
            {a.name === 'add_todo' ? `已添加：${(a.args && a.args.text) || ''}` : a.name === 'complete_todo' ? `已完成：${(a.result && a.result.completed) || ''}` : a.name === 'update_profile' ? '画像已更新' : `${(a.args && a.args.course) || ''}笔记已更新`}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function Ask({ toast, prefill, clearPrefill }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);
  const scrollRef = useRef(null);
  const chats = s.chats || [];

  useEffect(() => {
    if (prefill) { setQ(prefill); clearPrefill(); }
  }, [prefill]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [chats.length, running]);

  const send = async (text) => {
    const question = (text || q).trim();
    if (!question || running) return;
    setQ('');
    const chatId = uid();
    setState((st) => ({ ...st, chats: [...st.chats, { id: chatId, q: question, a: '', steps: [], actions: [], at: Date.now() }].slice(-40) }));
    setRunning(true);
    cancelRef.current = false;
    try {
      const { answer, steps, actions } = await runAgent(question, {
        onStep: (newSteps) => setState((st) => ({ ...st, chats: st.chats.map((c) => (c.id === chatId ? { ...c, steps: newSteps } : c)) })),
        cancelled: () => cancelRef.current,
      });
      setState((st) => ({ ...st, chats: st.chats.map((c) => (c.id === chatId ? { ...c, a: answer, steps, actions } : c)) }));
    } catch (e) {
      setState((st) => ({ ...st, chats: st.chats.map((c) => (c.id === chatId ? { ...c, a: '出错: ' + String((e && e.message) || e).slice(0, 60) } : c)) }));
    }
    setRunning(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 14, marginTop: 10 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: T.text }}>对话</Text>
          <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 3 }}>团团会自己查你的记忆再回答 · 也能帮你记事</Text>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}
          onContentSizeChange={() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
          {!chats.length ? (
            <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
              <View style={{ width: 52, height: 52, borderRadius: 99, backgroundColor: T.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ic name="sparkle" size={22} color={T.orange} />
              </View>
              <Text style={{ fontSize: 12, color: T.sub, marginTop: 12 }}>试试这些（团团会真的去查 / 去记）</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
                {QUICK.map((t) => (
                  <Pressable key={t} onPress={() => send(t)} style={({ pressed }) => [{ backgroundColor: T.orangeSoft, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 8, margin: 4 }, pressed && { opacity: 0.6 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: T.orangeDeep }}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {chats.map((c) => (
            <View key={c.id} style={{ marginTop: 16 }}>
              <View style={{ alignSelf: 'flex-end', backgroundColor: T.orange, borderRadius: 18, borderBottomRightRadius: 5, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '78%' }}>
                <Text style={{ fontSize: 13.5, color: '#fff', lineHeight: 21 }}>{c.q}</Text>
              </View>
              <View style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 0.5, borderColor: T.line, borderRadius: 18, borderTopLeftRadius: 5, paddingHorizontal: 14, paddingVertical: 11, maxWidth: '88%', marginTop: 8, ...T.shadow }}>
                {c.a ? (
                  <>
                    <MarkdownText text={c.a} style={{ fontSize: 13, color: T.text2 }} />
                    <ActionChips actions={c.actions} />
                    {c.steps && c.steps.length ? <StepLine steps={c.steps} /> : null}
                  </>
                ) : (
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <PulseDot />
                      <Text style={{ fontSize: 12, color: T.sub, marginLeft: 8 }}>团团思考中…</Text>
                    </View>
                    <StepLine steps={c.steps} />
                  </View>
                )}
              </View>
            </View>
          ))}
          {chats.length > 3 ? (
            <Pressable onPress={() => setState((st) => ({ ...st, chats: [] }))} style={{ alignSelf: 'center', marginTop: 14 }}>
              <Text style={{ fontSize: 11, color: T.sub }}>清空对话</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 90, backgroundColor: T.bg }}>
          <TextInput value={q} onChangeText={setQ} placeholder="问点什么，或让团团记点事…" placeholderTextColor={T.sub}
            onSubmitEditing={() => send()} returnKeyType="send"
            style={{ flex: 1, fontSize: 13.5, color: T.text, backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11, ...T.shadow }} />
          {running ? (
            <Pressable onPress={() => { cancelRef.current = true; }} style={{ marginLeft: 10, backgroundColor: T.redSoft, borderWidth: 1.5, borderColor: '#F0C4BE', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: T.red }}>停止</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => send()} style={({ pressed }) => [{ marginLeft: 10, backgroundColor: q.trim() ? T.orange : '#E8E4DD', borderRadius: 99, paddingHorizontal: 18, paddingVertical: 11 }, pressed && { opacity: 0.7 }]}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>发送</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
