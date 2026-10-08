# 团子 Dango · 实施状态（2026-10-08）

> 仓库：github.com/ChenPu2002/Dango（main 分支）
> 本地：~/campus-echo-demo/

## 总体架构（已实现）

```
FAB录音/拍照/文档 → ASR(火山Seed-ASR) → 提炼(DeepSeek-flash多模态)
  → 合并引擎(卡片订正/待办提取/课程笔记与画像滚动重写)
  → 今日工作台(心情四态+今日待办+今日卡片+时间线)
  → 日终归档Agent(卡片按日失效/待办carry-drop/日结/周结)
  → 手帐引擎(全文检索+全屏阅读器+编辑, 镜像同步至 文档/团子/)
  → 对话Agent(工具循环: 检索/读档案/记待办/改画像, 带执行轨迹)
```

## 分项状态

| 模块 | 状态 | 说明 |
|---|---|---|
| **R1 信息架构** 4Tab+中央FAB | ✅ 已实现已验证 | 今日/手帐/对话/我的；FAB单击录音、长按菜单(拍照/相册/文档) |
| 录音→转写→提炼→合并 | ✅ 真机验证 | 实测：录“虚拟语气+还书+交作文”→1卡片+2待办+英语笔记 |
| **R2 手帐引擎** | ✅ 已实现（建议人工过一遍交互） | 搜索/chips/全屏阅读器/画像与笔记编辑/同步；未做完整真机回归 |
| **R3 有机记忆** 日终归档 | ✅ 已实现已触发 | 启动时运行（logcat 🧹）；待办 carry/drop LLM 决策逻辑在 pipeline.js runArchivist |
| **R4 对话Agent** 工具循环 | ⚙️ 代码完成，**未完成真机验证** | src/agent.js：10个工具(search/read/add_todo/update_profile等)+8轮循环+轨迹/取消；Ask.js 已接 |
| 文档固化(SAF) | ✅ | 固定 文档/团子/，覆盖式写入，团子手帐.md 为记忆档案 |
| 密钥 | ✅ | src/secrets.js 本地持有不入库；仓库只有 example |

## 未完成/待验证清单（去别处继续时从这里接手）

1. **Agent 对话真机回归**：打开对话Tab → 问“我最近的作业有哪些” → 应看到 🔧 检索轨迹 + 引用回答；说“帮我记一下…” → 待办真的出现
2. **手帐交互人工过一遍**：搜索/阅读器/编辑画像保存/同步按钮
3. **日终归档的 carry/drop** 需要隔天数据才能完整验证（可改 store 里 visibleFrom 模拟）
4. 已知小尾巴：Me.js 里残留未使用的 loadFiles 函数（死代码，可删）
5. 助手人格文案统一为「团团」未完全过一遍（部分提示词仍写“团子”）

## 关键文件索引

| 文件 | 职责 |
|---|---|
| xinli-app/src/agent.js | **Agent Runtime**：工具目录/执行/循环/轨迹 |
| xinli-app/src/pipeline.js | 处理管线 + 合并引擎 + runArchivist(日终归档) |
| xinli-app/src/useRecorder.js | FAB 的录音/拍照/文档录入 |
| xinli-app/src/screens/Today.js | 今日工作台（心情/待办/卡片deck/时间线） |
| xinli-app/src/screens/Journal.js | 手帐（文档引擎） |
| xinli-app/src/screens/Ask.js | 对话（Agent前端） |
| xinli-app/src/exporter.js | SAF 文档固化 |
| xinli-app/src/api.js | DeepSeek/火山ASR客户端 + 全部提示词 |
| docs/DESIGN-v2.md | 本轮重设计方案（R1-R4） |
| docs/DESIGN-memory.md | 记忆机制设计（三层记忆/合并式提炼） |
| docs/API.md | 内外部API约定 |

## 构建与调试

```bash
cd xinli-app && npm install
cp src/secrets.example.js src/secrets.js   # 填Key
npx expo prebuild -p android
cd android && ./gradlew assembleRelease -x lint --rerun-tasks
adb install -r app/build/outputs/apk/release/app-release.apk
# 观察日志：adb logcat -s ReactNativeJS | grep dango
# 坑：gradle 缓存旧bundle → 必须带 --rerun-tasks；改JS后先跑 babel 语法检查
```
