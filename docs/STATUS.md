# 团子 Dango · 实施状态（2026-10-09 晨）

> 仓库：github.com/ChenPu2002/Dango（main 分支）
> 本地：~/campus-echo-demo/
> 本轮：STATUS 旧清单 5 项全部收口 + 一轮完整视觉重设计（去 emoji 化）

## 本轮完成（2026-10-09 晚 · 第七轮：真机反馈修复 + 全链路验证）

用户真机使用后四项反馈全部修复，**真机逐屏截图 + harness 双重验证**，详见 `docs/VERIFY-r7.md`（含 11 项截图证据索引 `docs/shots/r7-*.png`）：

| 事项 | 结果 | 验证 |
|---|---|---|
| 阅读器删除按钮丑（缩左下角） | ✅ Btn 重做为 solid/ghost 主次体系（带图标）：档案=问团团(实心)+删除(等宽红描边)；课程=编辑(实心)+问团团(描边)；顺带消除「问团团」颜色渲染异常 | 真机截图 r7-03/04 |
| 记忆分层未实证 | ✅ 新增 test-memory-flow.mjs：70/20/2 天跨度数据跑 nightlyMaintenance，12 断言全过（深冷/瘦身/周结/月结生成并清移/音频清理/卡片降温）；真机「立即整理」真 LLM 跑通「整理完成：日结」 | harness + 真机 r7-10 |
| 跨天缺失日结真 bug | ✅ maybeDailyRollup 原只补"今天"，某天没开 App 该天日结永久缺失 → 改按天补齐（≤3 天） | test-memory-flow 断言 |
| 编辑待办键盘遮挡 | ✅ Sheet Modal 加 translucent flags + KAV(height) 包整面板，键盘弹出时含保存按钮整体上浮 | 真机截图 r7-05 |
| 空会话残留 | ✅ pruneEmpty：启动/切走/关抽屉/新建四时机清理无消息会话 | 真机截图 r7-09 |
| DDL 修改闭环 | ✅ chips「明天」→保存→「明天到期」橙徽标 | 真机 r7-after-due |
| 对话页 FAB 常驻 + 工具卡人读化 | ✅ FAB 泊 Tab 缺口；真 LLM 验证：brief 标题/展开无 id/人读结果/〔来源〕引用 | 真机 r7-06/07/08 |

真机 LLM key 在 App 内「我的→模型服务」配置（AsyncStorage），install -r 不清数据，链路全程可用。

## 前次完成（2026-10-09 晚 · 第六轮：录音防误触 / 工具结果人读化 / Agent CRUD / 记忆分层防冗余）

用户七项反馈一次收口：

| 事项 | 结果 | 验证 |
|---|---|---|
| 对话页录音键消失 | ✅ FAB 四 Tab 常驻（Tab 栏中央缺口泊位），仅键盘弹出时让位；录音中 FAB 上方悬浮 ⏺ 时长胶囊 | 代码走查 |
| 录音丢弃/结束易误触 | ✅ 录音中点 FAB 不再直接结束，改弹「录音控制浮层」：时长大字 + 完成·保存并整理 / 继续录音 / **按住 700ms 进度填满才丢弃**（松手即取消）；原行内"丢弃"小按钮移除 | 代码走查（真机回归项） |
| 工具结果省略 + 裸 ID | ✅ agent.js 新增 humanizeArgs/humanizeResult：按工具定制人读文案（命中列表〔日期〕标题/待办•✓+截止/心情 emoji 分数…），过滤 id 等机器字段；卡片标题改用 brief 人话；结果完整不截断（maxHeight 300 内嵌滚动）；get_todos 增 dueText（逾期/今天到期） | test-crud.mjs 4 例断言 |
| 手帐/待办 AI CRUD 预留接口 | ✅ 工具目录 11→20：update_todo(改文/改截止)/reopen_todo/delete_todo、list_courses/delete_course_note、get_cards/add_card/update_card/archive_card/delete_card；AGENT_SYS 增"先查后改（拿 id 再操作）"规则；ActionChips 适配 13 种动作（删除类红 chip） | test-crud.mjs 22 例全过 |
| 待办误触/单条删改/DDL | ✅ 已完成行整行不再可点（点勾选框才恢复）；行尾 ⋯ 显式菜单（编辑内容与截止/恢复/删除）；TodoEditSheet=文本+截止快捷 chips(无/今天/明天/后天/下周)+自然语言自定义；「清除已完成」加 Alert 确认；pipeline 新增 updateTodo(id,{text,due}) | 代码走查（真机回归项） |
| 超长课堂录音 | ✅ map-reduce：转写 >6500 字按句界分块(~5500字/块)→逐段 SEGMENT_SYS 提要点（UI 显示"分段提炼 n/m…"）→汇总成完整笔记；api.js 新增 SEGMENT_SYS | test-crud.mjs：拼接无损/不撕裂句子/短文不分块 |
| 两个月信息冗余 | ✅ 三层压缩链补全：日结→周结→**月结(monthlies, 新)**；夜间维护新增 **转写瘦身**（>14 天留 300 字）与**深冷**（>60 天只留标题+摘要）；手帐页新增「记忆分层」卡（工作/知识/沉淀三层计数 + 流转路径说明 + 立即整理=runArchivist+强制夜间维护）；exporter/手帐 chips/阅读器全支持月结 | test-archivist.mjs 非 LLM 9 例过（LLM 例需真 key） |
| 手帐卡片底部弹出难受 | ✅ 阅读器改 iOS push 式：右侧滑入(260ms ease-out)/右滑出(200ms)，transparent Modal + Animated translateX | 代码走查（真机回归项） |

新增回归脚本 `scripts/test-crud.mjs`（不依赖 LLM key）：待办/卡片/课程笔记 CRUD 22 例 + humanize 过滤 id + splitText 分块不变量。
本机无 secrets.js（空 key 模板），LLM 相关断言（archivist carry/drop、日结）需真机真 key 复跑。

## 总体架构（已实现）

```
FAB录音/拍照/文档 → ASR(火山Seed-ASR) → 提炼(DeepSeek多模态)
  → 合并引擎(卡片订正/待办提取/课程笔记与画像滚动重写)
  → 今日工作台(心情四态+今日待办+今日卡片+时间线)
  → 日终归档Agent(卡片按日失效/待办carry-drop/日结/周结)
  → 手帐引擎(全文检索+全屏阅读器+编辑, 镜像同步至 文档/团子/)
  → 对话Agent(工具循环: 检索/读档案/记待办/改画像/看心情, 带执行轨迹)
```

## 本轮完成（2026-10-09 下午 · 第五轮：工具调用 UI 对齐 ETA 源设计）

对照 [Eta](https://github.com/Mangi-11/Eta) 的 chat_home 实际截图（工具调用=独立边框卡片，置于回答上方，含参数/结果详情）重做：
- ToolCallCard：图标+工具名+参数摘要+运行中呼吸点/完成✓+展开箭头；展开显示完整「参数」「结果」JSON
- agent.js 步骤携带完整 args/result（此前只有 brief）
- 三态真机验证：运行中（卡片上方+当前卡呼吸点）/ 完成（✓+摘要，回答在卡下）/ 展开详情

## 前次完成（2026-10-09 下午 · 第四轮：交互动效打磨）

| 事项 | 结果 | 验证 |
|---|---|---|
| 云文档行点击态 | ✅ 漏改的 android_ripple 暖色前景反馈补上 | 代码对齐 Journal/Today |
| 执行轨迹 ETA 式重构 | ✅ 运行中：紧凑胶囊显示当前步骤（单行）；完成后：折叠为「执行过程 · N 步」可点开编号列表再收起 | 真机三态截图（运行中/完成/展开） |
| 会话抽屉弹出方向 | ✅ 从底部弹窗改为**左侧滑入**（Animated translateX + 右侧遮罩渐隐 + 长投影） | 真机截图 |

## 前次完成（2026-10-09 中午 · 第三轮：记忆与会话大升级）

| 功能 | 结果 | 验证 |
|---|---|---|
| 对话多会话 | ✅ 左上抽屉：会话列表/新建/切换/长按删除；标题自动取首问；旧 chats 自动迁移 | 真机：新建→发消息→标题更新→切换→列表确认 |
| 待办完成交互 | ✅ 点完成→原位划线沉入"已完成"区（不再消失）；再点恢复；"清除已完成"批量清理 | 真机截图 |
| 截止时间系统 | ✅ parseDue 归一化（周五/下周三/明天/10月12日→零点时间戳，中文自然周语义）；行内徽标（逾期N天红/今天到期红/明天橙）；**今日页到期提醒横幅**；"遗留"标记说明前日待办 | 单测 9 例 + 真机截图 |
| visibleFrom 隐藏 bug | ✅ 非补零日期 '2026-10-9' 导致 Date 解析失败→新待办被隐藏。统一补零 ISO 字符串比较 + 旧数据迁移 | 真机：Agent 加的待办立即出现 |
| 隐私级联删除 | ✅ 删除记录(含衍生)：卡片/待办/心情/云文档条目/当日日结 + **课程笔记与画像 LLM 从剩余记录重建**（REBUILD_SYS）；手帐阅读器新增删除入口 | 真机：删"短录音片段"→档案消失、云文档无残留、笔记重建 |
| 笔记连续性 | ✅ mergeExtract 现在把现有课程笔记喂给合并 LLM（之前根本没传，笔记无法"吸收旧笔记"） | 代码路径+harness 通过 |
| 点击态 | ✅ 待办/文档行 android_ripple 暖色前景反馈（替代中间白四周透明的默认水波纹） | 真机 |
| 手帐分组 | ✅ 分区标题（课程笔记/小结/日期·周X）+ 分隔线，档案按日期分组 | 真机截图 |

## 前次完成（2026-10-09 上午 · 第二轮整改）

| 事项 | 结果 |
|---|---|
| 待办列表封顶（误改） | ✅ 恢复显示全部待办 |
| 手帐筛选 chips 被拉伸平铺 | ✅ 改为普通 View 行 + 紧贴文字的紧凑 pill（暖灰底），不再均分拉伸 |
| 手帐卡片贴边 | ✅ 页面统一 12px 边距（原 paddingHorizontal:2 几乎贴边） |
| 对话气泡塞满两侧 | ✅ 左右 14px 页边距；用户气泡 78% / 团团气泡 88% 圆角气泡+细边框，有呼吸感 |
| **备份跳系统文件夹（选到"心力球"）** | ✅ exportAll 重构：备份=纯 store 的文档索引刷新（云文档页数据源）+已关联时静默镜像写盘；**绝不弹系统授权窗**。文件夹关联仅保留云文档页脚一个显式入口（可选）。真机验证：点立即备份→停留 App 内，toast 已更新 9 个文档 |

## 前次完成（2026-10-09 上午 · UX 大把关整改）

| 事项 | 结果 |
|---|---|
| FAB/TabBar 底部系统重构 | ✅ FAB 真正泊进 Tab 栏缺口（删掉"长按更多"标签）；对话页隐藏 FAB（输入框优先，Tab 四等分）；全部内容页留白避让，无遮挡 |
| 今日待办无限增长 | ✅ 封顶 4 条 + "还有 N 件"溢出行 |
| 心情卡 hashtag 超框 | ✅ 标签独立换行行（最多4个），不再右侧挤压溢出 |
| 我的页冗余清理 | ✅ 删除"文档同步位置"授权引导行、"浏览与编辑记忆"冗余行、"设备协同"占位 section |
| **云文档**（用户核心需求） | ✅ 新增 Files.js：App 内云存储式文档交互（列表/预览/立即备份），文件夹仅作为底部一行说明"备份位置：手机存储/文档/团子"，用户全程停留在 App 内 |
| Me 信息架构重排 | ✅ 本学期 → 云文档 → AI 配置 → 本地数据 → 关于 |

## 前一轮完成（2026-10-09 凌晨）

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

1. **OPPO 真机 SAF 写入路由**：AOSP 模拟器全链路落盘成功；OPPO 真机上 write→read 自洽（回读校验通过、云文档列表正常）但 `/storage/emulated/0/Documents/团子` 物理不可见——疑似 ColorOS DocumentsProvider 把写入路由到非标准视图。App 内体验不受影响（云文档走 store）；待白天用系统文件管理器人工确认物理位置。
2. 设备上存在一条 10.9 日结（内容为昨晚"碎念"的总结），但今天 0 条记录，按当前代码 rollup 守卫不可能生成——推断为昨晚会话旧进程跨午夜、旧版本逻辑所为。渲染端行为正确。若再现，给 maybeDailyRollup 加触发日志即可定位。
3. adb 无法输入中文，add_todo 的真机端到端（LLM 决策）未直接测；工具层由 Node harness 验证、get_moods 真机验证了同一循环，风险低。
4. 本轮按要求**未做任何录音/扬声器播放测试**（用户夜间休息）。
5. 重建式删除会丢弃用户手动编辑过的笔记内容（从记录重生成）——确认弹窗已说明；如需保留可先手动备份。

## 关键文件索引

| 文件 | 职责 |
|---|---|
| xinli-app/src/icons.js | **自绘线性图标集**（Ic 组件，SF Symbols 手感） |
| xinli-app/src/agent.js | Agent Runtime：20 个工具(CRUD 全集)/执行/8轮循环/轨迹/结果人读化 |
| xinli-app/src/pipeline.js | 处理管线 + 合并引擎 + 长录音分段提炼 + runArchivist(日终归档) + nightlyMaintenance(周结/月结/瘦身) |
| xinli-app/src/useRecorder.js | FAB 的录音/拍照/文档录入 |
| xinli-app/src/screens/Today.js | 今日工作台（心情/待办/卡片deck/时间线） |
| xinli-app/src/screens/Journal.js | 手帐（文档引擎） |
| xinli-app/src/screens/Ask.js | 对话（Agent前端） |
| xinli-app/src/exporter.js | SAF 文档固化（ensureExportDir 带 ask 门控） |
| xinli-app/src/api.js | DeepSeek/火山ASR客户端 + 全部提示词 |
| xinli-app/scripts/test-archivist.mjs | 归档 Agent 的 Node 验证 harness |
| xinli-app/scripts/test-crud.mjs | Agent CRUD 工具 + 分块 + 人读化的 Node 验证（无需 LLM key） |
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
