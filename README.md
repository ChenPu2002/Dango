# 团子 Dango 🍡

> 手机端的录音提炼学习陪伴 App（React Native / Expo · Android）。录音 → ASR 转写 → LLM 提炼 → 自动更新待办 / 复习卡片 / 情绪状态，配合「心力球」全天候录音设备使用。

## 功能

- 🎙️ **一键录音**：手机麦克风录制，停止后自动转写（火山 Seed-ASR）→ 结构化提炼（DeepSeek 多模态）
- 📷 **拍照/相册/文档**：课堂板书照片直接多模态读图提炼；txt/md 文档提炼
- 🧠 **三层记忆（冷热分层）**：画像与课程笔记滚动重写（有界热记忆），全部转写/提炼固化到手机 `文档/团子/`（冷档案），问答时按关键词检索档案
- ✅ **待办自动提取**：录音里说到的任务/截止自动进待办
- 🃏 **今日卡片**：知识卡片当日有效，重复知识只订正不重复，隔天自动失效
- 💬 **问答**：随时用自然语言查自己的历史记录（本地记忆 RAG）
- 🌙 **情绪四态**：PERFECT / GOOD / BAD / BOOM，跟随最新录音状态
- 📁 **文档固化**：`团子手帐.md`（App 维护的长期记忆档案）+ 每条记录的转写/提炼文件，用户可在 App 内查看与编辑画像
- 🔮 **设备协同（预留）**：`server.js` / `cli.js` 为多端协同后台与电脑 agent 的预留实现（暂停启用）

## 快速开始

```bash
cd xinli-app
npm install
cp src/secrets.example.js src/secrets.js   # 填入你的 DeepSeek / 火山 ASR Key
npx expo prebuild -p android               # 生成 android 工程
cd android && ./gradlew assembleRelease    # 打 Release APK
adb install -r app/build/outputs/apk/release/app-release.apk
```

密钥也可在 App 内「我的 → AI 服务配置」填写（优先级：本地配置 > 内置默认）。

## 目录

```
├── xinli-app/          # RN/Expo 工程（App 本体）
│   ├── App.js          # Tab 路由 / 全局状态
│   └── src/
│       ├── api.js      # DeepSeek + 火山 ASR 客户端、提示词
│       ├── pipeline.js # 处理管线：ASR→提炼→合并记忆→文档固化
│       ├── store.js    # AsyncStorage 持久化 + 发布订阅
│       ├── exporter.js # SAF 文档固化（固定 文档/团子/）
│       └── screens/    # 今日/问答/卡片/搭子/记录/我的
├── server.js           # 多端协同后台（预留）
├── cli.js              # 电脑 agent CLI（预留）
├── index.html          # 早期 Web 原型（存档）
└── docs/               # 设计文档与 API 约定
```

## 文档

- [docs/API.md](docs/API.md) — 内外部 API 约定（ASR/LLM）
- [docs/DESIGN-memory.md](docs/DESIGN-memory.md) — 记忆机制设计
- [docs/PLAN.md](docs/PLAN.md) — 早期最小功能规划
