# Dango 项目守则

## 参考 Eta 再动手（用户定稿，必须遵守）

改动**对话 / Agent / 上下文 / 记忆管理**相关逻辑前，必须先参考 [Eta](https://github.com/Mangi-11/Eta)（其 Runtime 核心参考 [Pi Coding Agent](https://github.com/earendil-works/pi)）的对应实现——观察源码、学习源码、品味源码，再下结论。**不要拍脑袋定参数、不要轻举妄动**：任何魔数（轮数/截断长度/压缩阈值）都要有出处（Eta/Pi 的做法或明确推理），并写进 docs/DESIGN-context.md。

Eta 关键设计（README 层面已确认，细节以源码为准）：
- 单一 Agent Loop：聊天页与系统助手入口共用
- 上下文压缩：**按服务商实际返回的输入用量判断**（不估算 token），需配置窗口大小才启用
- Steering：追加指令在当前 turn 完成后进入下一轮
- 消息操作：复制/编辑/从某轮删除/重新生成
- 中断恢复：不自动重放操作

## 构建与验证（血泪教训）

- 改 JS 后构建：`cd xinli-app/android && JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ./gradlew assembleRelease -x lint`（build.gradle 已强制 bundle 永不 up-to-date）
- **验证新代码进包**：APK 内 bundle 与 generated bundle md5 对比（ASCII grep hermes 字节码不可靠）
- 真机验证用 `adb shell uiautomator dump` 控件树文本（比截图硬）；OPPO 裁剪 ReactNativeJS 日志，console.log 不可见
- Node harness：`node --import ./scripts/register.mjs scripts/test-crud.mjs` 等（无需 LLM key）
