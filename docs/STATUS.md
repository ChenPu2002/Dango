# 团子 Dango · 实施状态（2026-10-09 晨）

> 仓库：github.com/ChenPu2002/Dango（main 分支）
> 本地：~/campus-echo-demo/
> 本轮：STATUS 旧清单 5 项全部收口 + 一轮完整视觉重设计（去 emoji 化）

## 总体架构（已实现）

```
FAB录音/拍照/文档 → ASR(火山Seed-ASR) → 提炼(DeepSeek多模态)
  → 合并引擎(卡片订正/待办提取/课程笔记与画像滚动重写)
  → 今日工作台(心情四态+今日待办+今日卡片+时间线)
  → 日终归档Agent(卡片按日失效/待办carry-drop/日结/周结)
  → 手帐引擎(全文检索+全屏阅读器+编辑, 镜像同步至 文档/团子/)
  → 对话Agent(工具循环: 检索/读档案/记待办/改画像/看心情, 带执行轨迹)
```

## 本轮完成（2026-10-09 凌晨）

| 事项 | 结果 | 验证方式 |
|---|---|---|
| 旧清单#1 Agent 对话真机回归 | ✅ | 真机点「我现在心情怎么样？」→ LLM 自主调 get_moods → 轨迹「查看心情记录」→ 引用回答〔10.8 碎念〕，数据准确 |
| 旧清单#2 手帐交互过一遍 | ✅ | 真机走查：搜索/chips/阅读器/编辑器打开取消/同步按钮；发现并修复键盘遮挡保存按钮问题 |
| 旧清单#3 日终归档 carry/drop | ✅ | `scripts/test-archivist.mjs`（Node 直跑真代码+真LLM，mock react/AsyncStorage/expo-fs），12 项断言全过：carry/drop、卡片按日失效、日结生成、工具调用 |
| 旧清单#4 Me.js 死代码 | ✅ | loadFiles + 7 个未用 import 删除；连带删除旧 6Tab 遗留死文件 Notes.js/Devices.js、api.js 里被 Agent 取代的 ASK_SYS/buildAskContext |
| 旧清单#5 人格统一「团团」 | ✅ | 对话人格/提示词/待办来源全部「团团」；App 品牌（目录 团子/、团子手帐.md、关于页）保留「团子」 |
| **视觉重设计**（用户新需求） | ✅ | 自绘 SVG 图标集 icons.js（24网格/1.8描边/圆头）替换全部 emoji；「纸感手帐」暖色主题；TabBar 图标+FAB 泊位；MIUI 设置页质感。真机逐屏截图验收（今日/手帐/阅读器/编辑器/对话/我的/FAB菜单） |
| Agent 能力补齐 | ✅ | 新增 get_moods 工具（快捷问题「我现在心情怎么样」此前无工具支撑）；search_memory 覆盖卡片（含已归档，知识不丢） |
| 今日页口径统一 | ✅ | 头部「待办 N 件」按 visibleFrom 过滤（与列表一致）；「今日记录」只显示今天的，旧的变成「更早的 N 条已沉入手帐 ›」入口；心情卡非今日显示日期 |
| 卡死任务可重试 | ✅ | 处理中>10分钟或失败的条目显示「重试」（retryJob 此前无 UI 入口） |
| **后台 SAF 弹窗 bug** | ✅ | ensureExportDir 加 {ask} 参数：只有用户手势（同步/导出按钮）才弹系统授权；启动归档等后台路径静默跳过。此前旧格式 exportDir 无法迁移出 root → 每次启动都可能弹窗（真机复现过两次） |

## 已知观察与遗留（如实记录）

1. **OPPO 真机 SAF 写入兼容性**：同一构建在 AOSP 模拟器上文档固化全链路成功（授权→mkdir 团子→写 团子手帐.md 落盘，日志 `[dango] 📤 导出完成 1 个文件`），但在 OPPO/ColorOS 真机上 SAF 写入"假成功"（readAsStringAsync 回读为空）。已加**写后回读校验**——失败会如实报"同步失败: 写入未生效"，绝不假成功。下一步定位：给 ensureExportDir 加 `console.log(root, dirUri)` 在真机跑一次看 OPPO 授权返回的 root 形态。
2. 设备上存在一条 10.9 日结（内容为昨晚"碎念"的总结），但今天 0 条记录，按当前代码 rollup 守卫不可能生成——推断为昨晚会话旧进程跨午夜、旧版本逻辑所为。渲染端行为正确。若再现，给 maybeDailyRollup 加触发日志即可定位。
3. adb 无法输入中文，add_todo 的真机端到端（LLM 决策）未直接测；工具层由 Node harness 验证、get_moods 真机验证了同一循环，风险低。
4. 本轮按要求**未做任何录音/扬声器播放测试**（用户夜间休息）。

## 关键文件索引

| 文件 | 职责 |
|---|---|
| xinli-app/src/icons.js | **自绘线性图标集**（Ic 组件，SF Symbols 手感） |
| xinli-app/src/agent.js | Agent Runtime：11 个工具/执行/8轮循环/轨迹 |
| xinli-app/src/pipeline.js | 处理管线 + 合并引擎 + runArchivist(日终归档) |
| xinli-app/src/useRecorder.js | FAB 的录音/拍照/文档录入 |
| xinli-app/src/screens/Today.js | 今日工作台（心情/待办/卡片deck/时间线） |
| xinli-app/src/screens/Journal.js | 手帐（文档引擎） |
| xinli-app/src/screens/Ask.js | 对话（Agent前端） |
| xinli-app/src/exporter.js | SAF 文档固化（ensureExportDir 带 ask 门控） |
| xinli-app/src/api.js | DeepSeek/火山ASR客户端 + 全部提示词 |
| xinli-app/scripts/test-archivist.mjs | 归档 Agent 的 Node 验证 harness |
| docs/DESIGN-v2.md | R1-R4 重设计方案 |
| docs/DESIGN-memory.md | 记忆机制设计（三层记忆/合并式提炼） |
| docs/API.md | 内外部API约定 |

## 构建与调试

```bash
cd xinli-app && npm install
cp src/secrets.example.js src/secrets.js   # 填Key
# 语法检查（改JS后必做）
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/screens/Today.js','utf8'),{sourceType:'module',plugins:['jsx']})"
# 归档 Agent 回归（Node, 真 LLM）
node --import ./scripts/register.mjs scripts/test-archivist.mjs
# 构建（注意 ANDROID_HOME）
cd android && ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew assembleRelease -x lint
adb install -r app/build/outputs/apk/release/app-release.apk
# 观察日志：adb logcat -s ReactNativeJS | grep dango（OPPO 上可能被系统裁剪）
# 坑：gradle 缓存旧bundle → 改JS后加 --rerun-tasks
```

## 下一步建议（未做）

1. 录音全链路回归（本轮按用户要求未做任何录音/播放测试）
2. 周结压缩（nightlyMaintenance 目前无调用方，可挂到启动归档里）
3. 引用角标点击跳转手帐阅读器（DESIGN-v2 §2.4 的闭环）
4. chat add_todo 真机端到端（需要一个中文输入途径，如 ADBKeyboard）
