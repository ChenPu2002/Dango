import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Card, Section, Bar, ActionSheet, InputSheet } from '../ui';
import { T } from '../theme';
import { useStore, setState, uid } from '../store';
import { deleteTodo, editTodo, toggleTodo } from '../pipeline';

export default function Buddy({ toast }) {
  const s = useStore();
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(null); // {todo}
  const [edit, setEdit] = useState(null); // {todo}
  const todos = s.todos;
  const done = todos.filter((t) => t.done).length;

  const add = () => {
    if (!text.trim()) return;
    setState((st) => ({ ...st, todos: [{ id: uid(), text: text.trim(), due: '', from: '手动添加', done: false, createdAt: Date.now() }, ...st.todos] }));
    setText('');
    toast('已添加');
  };

  return (
    <View>
      <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.text }}>我的搭子 🧸</Text>
        <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 4 }}>录音里提到的任务会自动出现在这里</Text>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: T.orange, marginRight: 14 }}>{done}/{todos.length}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.text }}>{todos.length ? `还剩 ${todos.length - done} 件` : '暂无待办'}</Text>
          <Bar pct={todos.length ? (done / todos.length) * 100 : 0} />
        </View>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            value={text} onChangeText={setText} placeholder="快速记一条…"
            placeholderTextColor={T.sub} onSubmitEditing={add} returnKeyType="done"
            style={{ flex: 1, fontSize: 13.5, color: T.text, backgroundColor: '#F7F8FA', borderRadius: 12, paddingHorizontal: 2, paddingVertical: 10 }}
          />
          <Pressable onPress={add} style={{ marginLeft: 10, backgroundColor: T.orange, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>添加</Text>
          </Pressable>
        </View>
      </Card>

      <Section title="待办" right={todos.length ? `${done} 已完成` : ''}>
        <Card>
          {todos.length ? todos.map((t) => (
            <Pressable key={t.id} onLongPress={() => setMenu({ todo: t })} delayLongPress={350} onPress={() => toggleTodo(t.id)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: T.line }}>
              <Pressable onPress={() => toggleTodo(t.id)} style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: t.done ? T.orange : '#CFC7E8', backgroundColor: t.done ? T.orange : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                {t.done ? <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text> : null}
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, color: t.done ? T.sub : T.text, textDecorationLine: t.done ? 'line-through' : 'none' }}>{t.text}</Text>
                <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>来自「{t.from}」{t.due ? ` · 截止 ${t.due}` : ''} · 长按维护</Text>
              </View>
            </Pressable>
          )) : (
            <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center', paddingVertical: 16 }}>
              录音里说「明天要交…」「记得…」，提炼后会自动生成待办
            </Text>
          )}
        </Card>
      </Section>

      <ActionSheet
        visible={!!menu} onClose={() => setMenu(null)}
        title={menu ? menu.todo.text : ''}
        options={menu ? [
          { icon: menu.todo.done ? '↩️' : '✅', label: menu.todo.done ? '标记为未完成' : '标记为完成', onPress: () => toggleTodo(menu.todo.id) },
          { icon: '✏️', label: '编辑内容', onPress: () => setEdit({ todo: menu.todo }) },
          { icon: '🗑️', label: '删除这条待办', tone: 'danger', onPress: () => { deleteTodo(menu.todo.id); toast('已删除'); } },
        ] : []}
      />
      <InputSheet
        visible={!!edit} onClose={() => setEdit(null)}
        title="编辑待办"
        initial={edit ? edit.todo.text : ''}
        onSubmit={(v) => { if (edit && v.trim()) { editTodo(edit.todo.id, v.trim()); toast('已更新'); } }}
      />
    </View>
  );
}
