import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Card, Section, Bar, GhostBtn } from '../ui';
import { T } from '../theme';

function FlipCard({ q, a, no }) {
  const [flip, setFlip] = useState(false);
  return (
    <Pressable onPress={() => setFlip(!flip)} style={{ width: 210, height: 150, marginRight: 10 }}>
      {flip ? (
        <View style={{ flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: T.orangeSoft, backgroundColor: '#fff', padding: 14, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13.5, color: T.text2, lineHeight: 22, textAlign: 'center' }}>{a}</Text>
          <Text style={{ fontSize: 10, color: T.sub, textAlign: 'center', marginTop: 10 }}>点我翻回题目</Text>
        </View>
      ) : (
        <View style={{ flex: 1, borderRadius: 16, backgroundColor: T.orange, padding: 14, justifyContent: 'center' }}>
          <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,.85)', textAlign: 'center', marginBottom: 8 }}>卡片 {no}/32</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', textAlign: 'center', lineHeight: 24 }}>{q}</Text>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,.8)', textAlign: 'center', marginTop: 8 }}>点我翻面看答案</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function Notes({ sendTask }) {
  return (
    <View>
      <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.text }}>课堂笔记本 📚</Text>
        <Text style={{ fontSize: 12.5, color: T.sub, marginTop: 4 }}>课表自动关联 · 12 门课已导入教务系统</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, paddingLeft: 14 }} contentContainerStyle={{ paddingRight: 14 }}>
        {['高等数学', '管理学', '大学英语', '毛概', '微观经济'].map((c, i) => (
          <View key={c} style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, backgroundColor: i === 0 ? T.orange : '#fff' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: i === 0 ? '#fff' : T.sub }}>{c}</Text>
          </View>
        ))}
      </ScrollView>

      <Card style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7F0', borderWidth: 0 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: T.orangeDeep }}>6<Text style={{ fontSize: 13 }}>天</Text></Text>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 12.5, color: T.orangeDeep, fontWeight: '600' }}>距高数期中考试</Text>
          <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 2 }}>已生成「抱佛脚卡片」32 张 · 已复习 12 张</Text>
          <Bar pct={38} />
        </View>
      </Card>

      <Card>
        <Text style={{ fontSize: 14, fontWeight: '800', color: T.text, marginBottom: 4 }}>📝 11.18 泰勒公式 · AI 笔记</Text>
        <Text style={{ fontSize: 12.5, color: T.text2, lineHeight: 23 }}>
          • <Text style={{ fontWeight: '700' }}>核心思想</Text>：用多项式 p(x) 局部逼近复杂函数 f(x)，误差由余项 Rₙ(x) 控制{'\n'}
          • <Text style={{ fontWeight: '700' }}>必背 3 展开</Text>：eˣ、sin x、ln(1+x) 在 x₀=0 处（麦克劳林）{'\n'}
          • <Text style={{ fontWeight: '700' }}>高频考点</Text>：用泰勒公式求极限 / 证明不等式，期中必出大题 ⭐{'\n'}
          • <Text style={{ fontWeight: '700' }}>你的卡点</Text>：上次作业余项 o(xⁿ) 位置写错，本次已标重点
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <GhostBtn text="📄 电脑转 Word 提纲" onPress={() => sendTask('word')} style={{ marginRight: 8 }} />
          <GhostBtn text="🖨️ 打印卡片" onPress={() => sendTask('print')} />
        </View>
      </Card>

      <Section title="抱佛脚卡片" right="点击卡片翻面">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ paddingHorizontal: 2 }}>
          <FlipCard no={13} q="eˣ 在 x=0 处的三阶泰勒展开是？" a="1 + x + x²/2! + x³/3! + o(x³)" />
          <FlipCard no={14} q="泰勒公式是用来干嘛的？" a="用多项式局部逼近复杂函数，误差用余项 Rₙ(x) 控制" />
          <FlipCard no={15} q="老师划的期中范围？" a="第三章～第五章，泰勒公式必出大题 ⭐" />
        </ScrollView>
      </Section>

      <Card style={{ alignItems: 'center', backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 }}>
        <Text style={{ fontSize: 12, color: T.sub }}>复习 20 张解锁「考前冲刺模式」· 错题自动回炉 🔁</Text>
      </Card>
    </View>
  );
}
