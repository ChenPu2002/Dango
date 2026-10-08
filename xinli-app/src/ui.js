/* MIUI 风格基础组件 */
import React, { useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, Animated, Dimensions, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { T } from './theme';

export function Card({ children, style }) {
  return <View style={[{ backgroundColor: T.card, borderRadius: T.radius, paddingHorizontal: 16, paddingVertical: 14, marginTop: 10 }, T.shadow, style]}>{children}</View>;
}

export function Section({ title, right, children }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 22, marginBottom: 2 }}>
        <View style={{ width: 4, height: 14, borderRadius: 2, backgroundColor: T.orange, marginRight: 8 }} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: T.text }}>{title}</Text>
        <View style={{ flex: 1 }} />
        {right ? <Text style={{ fontSize: 12, color: T.sub }}>{right}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Chip({ text, tone }) {
  const c = tone === 'g' ? [T.greenSoft, T.green] : tone === 'p' ? [T.orangeSoft, T.orangeDeep]
    : tone === 'r' ? [T.redSoft, T.red] : ['#F2F3F5', T.sub];
  return <View style={{ backgroundColor: c[0], borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginRight: 6, marginTop: 6, alignSelf: 'flex-start' }}>
    <Text style={{ fontSize: 10, fontWeight: '600', color: c[1] }}>{text}</Text>
  </View>;
}

export function Row({ icon, iconBg, title, sub, right, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }, pressed && onPress && { opacity: 0.55 }]}>
      {icon ? (
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: iconBg || T.orangeSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Text style={{ fontSize: 16 }}>{icon}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: T.text, fontWeight: '500' }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {right}
      {onPress ? <Text style={{ fontSize: 16, color: '#C6CBD2', marginLeft: 6 }}>›</Text> : null}
    </Pressable>
  );
}

export function Divider() {
  return <View style={{ height: 0.5, backgroundColor: T.line, marginLeft: 46 }} />;
}

export function SwitchMIUI({ on, onChange }) {
  return (
    <Pressable onPress={() => onChange && onChange(!on)}>
      <View style={{ width: 46, height: 27, borderRadius: 999, backgroundColor: on ? T.orange : '#E3E6EA', padding: 2.5, justifyContent: 'center' }}>
        <View style={{ width: 22, height: 22, borderRadius: 999, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, transform: [{ translateX: on ? 19 : 0 }] }} />
      </View>
    </Pressable>
  );
}

export function Btn({ text, onPress, tone, style }) {
  const danger = tone === 'danger';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      {
        borderRadius: 14, paddingVertical: 12, alignItems: 'center',
        backgroundColor: danger ? T.redSoft : T.orange,
        borderWidth: danger ? 1 : 0, borderColor: '#F5B8B0',
      }, pressed && { opacity: 0.7 }, style,
    ]}>
      <Text style={{ color: danger ? T.red : '#fff', fontSize: 14, fontWeight: '700' }}>{text}</Text>
    </Pressable>
  );
}

export function GhostBtn({ text, onPress, style }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      { flex: 1, borderRadius: 12, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#FFD9BC', backgroundColor: '#FFF8F2' },
      pressed && { opacity: 0.6 }, style,
    ]}>
      <Text style={{ color: T.orange, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </Pressable>
  );
}

export function Bar({ pct, tone }) {
  return (
    <View style={{ height: 7, borderRadius: 99, backgroundColor: '#F0F1F3', marginTop: 6, overflow: 'hidden', flex: 1 }}>
      <View style={{ width: `${Math.min(100, Math.max(0, pct))}%`, flex: 1, borderRadius: 99, backgroundColor: tone || T.orange }} />
    </View>
  );
}

/* 呼吸红点（录音中） */
export function PulseDot() {
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([Animated.timing(op, { toValue: 0.25, duration: 600, useNativeDriver: true }), Animated.timing(op, { toValue: 1, duration: 600, useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [op]);
  return <Animated.View style={{ width: 9, height: 9, borderRadius: 99, backgroundColor: T.red, opacity: op }} />;
}

/* Toast */
export function Toast({ msg }) {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(op, { toValue: msg ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [msg]);
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center', opacity: op,
    }}>
      <View style={{ backgroundColor: 'rgba(30,30,35,.92)', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, maxWidth: '86%' }}>
        <Text style={{ color: '#fff', fontSize: 12.5, textAlign: 'center', lineHeight: 18 }}>{msg || ''}</Text>
      </View>
    </Animated.View>
  );
}

/* MIUI 底部弹层 */
export function Sheet({ visible, onClose, children }) {
  const { height } = Dimensions.get('window');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: T.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: height * 0.82 }} onPress={() => {}}>
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}>
            <View style={{ width: 38, height: 4.5, borderRadius: 99, backgroundColor: '#DFE2E7' }} />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 34 }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{children}</KeyboardAvoidingView></ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* 轻量 Markdown 渲染（**粗体** `代码` # 标题 - 列表） */
export function MarkdownText({ text, style }) {
  const inline = (str, key) => {
    const parts = String(str).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return parts.map((seg, i) => {
      if (/^\*\*.+\*\*$/.test(seg)) return <Text key={key + '-' + i} style={{ fontWeight: '800' }}>{seg.slice(2, -2)}</Text>;
      if (/^`.+`$/.test(seg)) return <Text key={key + '-' + i} style={{ backgroundColor: '#F3F0F7', color: '#6B5FD8', fontSize: 11.5, paddingHorizontal: 3 }}>{seg.slice(1, -1)}</Text>;
      return <Text key={key + '-' + i}>{seg}</Text>;
    });
  };
  return (
    <Text style={style}>
      {String(text == null ? '' : text).split('\n').map((line, i) => {
        if (/^#{1,4}\s/.test(line)) return <Text key={i} style={{ fontWeight: '800', fontSize: 14, marginTop: 6, marginBottom: 2 }}>{inline(line.replace(/^#+\s/, ''), 'h' + i)}</Text>;
        if (/^[-*]\s/.test(line)) return <Text key={i} style={{ marginLeft: 8, lineHeight: 21 }}>{'\u2022 '}{inline(line.replace(/^[-*]\s/, ''), 'l' + i)}</Text>;
        return <Text key={i} style={{ lineHeight: 21 }}>{inline(line, 'p' + i)}</Text>;
      })}
    </Text>
  );
}

/* MIUI 长按菜单（操作列表）*/
export function ActionSheet({ visible, onClose, title, options }) {
  const { height } = Dimensions.get('window');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 20, maxHeight: height * 0.6 }} onPress={() => {}}>
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 38, height: 4.5, borderRadius: 99, backgroundColor: '#DFE2E7' }} />
          </View>
          {title ? <Text style={{ textAlign: 'center', fontSize: 12.5, color: T.sub, paddingVertical: 8, paddingHorizontal: 20 }} numberOfLines={2}>{title}</Text> : null}
          {options.filter(Boolean).map((o) => (
            <Pressable key={o.label} onPress={() => { onClose(); setTimeout(o.onPress, 180); }}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, marginHorizontal: 14, marginTop: 6, borderRadius: 14, backgroundColor: o.tone === 'danger' ? T.redSoft : '#F7F8FA' }, pressed && { opacity: 0.55 }] }>
              <Text style={{ fontSize: 14.5, fontWeight: '600', color: o.tone === 'danger' ? T.red : T.text }}>{o.icon ? o.icon + '  ' : ''}{o.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={({ pressed }) => [{ paddingVertical: 14, alignItems: 'center', marginTop: 6 }, pressed && { opacity: 0.5 }]}>
            <Text style={{ fontSize: 14, color: T.sub }}>取消</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* 单行/多行编辑弹层 */
export function InputSheet({ visible, onClose, title, initial, placeholder, multiline, onSubmit }) {
  const [v, setV] = React.useState(initial || '');
  React.useEffect(() => { if (visible) setV(initial || ''); }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: T.text, marginBottom: 12 }}>{title}</Text>
      <TextInput
        value={v} onChangeText={setV} placeholder={placeholder || ''} placeholderTextColor={T.sub}
        multiline={multiline} autoFocus
        style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 14, color: T.text, minHeight: multiline ? 110 : 46, textAlignVertical: 'top' }}
      />
      <Btn text="保存" onPress={() => { onClose(); setTimeout(() => onSubmit(v), 180); }} style={{ marginTop: 14 }} />
    </Sheet>
  );
}
export function TabBar({ tabs, active, onChange, fabGap }) {
  const n = tabs.length;
  return (
    <View style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,.96)',
      borderTopWidth: 0.5, borderTopColor: T.line, flexDirection: 'row', paddingTop: 7, paddingBottom: 18,
    }}>
      {tabs.map((t, i) => (
        <Pressable key={t.key} onPress={() => onChange(t.key)} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 20, opacity: active === t.key ? 1 : 0.45, marginBottom: 2 }}>{t.icon}</Text>
          <Text style={{ fontSize: 10.5, fontWeight: '600', color: active === t.key ? T.orange : T.sub }}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
