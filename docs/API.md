# API 需求清单

> 分两部分：**① 内部同步 API**（已实现，手机 Web / CLI / 后台之间）；**② 外部 API 需求**（需要你提供，接入后 Demo 从模拟数据变成真管线）。

---

## ① 内部同步 API（已实现）

参考 multica daemon 模式：CLI 注册 → 心跳保活（5s）→ 指令随心跳响应下发 → 结果回传广播。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/devices/register` | CLI 启动时注册；带旧 `id+token` 可复用身份 |
| POST | `/api/devices/:id/heartbeat` | 心跳上报 `status`+`meta`；**响应体携带待执行指令** `commands[]` |
| POST | `/api/devices/:id/commands` | 手机下发指令 `{cmd, payload}` → 进入设备指令队列 |
| POST | `/api/devices/:id/commands/:cid/result` | CLI 回传执行结果 `{ok, detail}` |
| GET | `/api/devices` | 设备列表（手机端看板） |
| GET | `/events` | SSE：`hello` / `device` / `command` / `command_result` 四类事件 |

指令集（`cmd`）：`start_recording` / `stop_recording` / `sync` / `burn`（心力球）；`screenshot` / `find_file` / `open_downloads` / `sysinfo` / `word` / `print`（电脑）。

---

## ② 外部 API 需求（请提供）

### 1. ASR 录音转写（最优先）

**场景**：单条音频 10s ～ 3h；16kHz 单声道、低码率 m4a/wav/mp3；中文为主、可能夹英文术语。

**需要的能力**：
- 文件上传转写（multipart 或先给下载 URL），支持长音频（异步任务 + 轮询/回调均可）
- **分句级时间戳**（生成时间线、跳转播放要用）
- **说话人分离**（2～6 人，小组讨论/例会区分谁说了什么）
- 中文标点、口语顺滑（去「嗯呃」）加分

**我期望的响应结构**（vendor 是讯飞/火山/腾讯等都行，我来适配，按这个给我信息即可）：

```json
{
  "text": "全文……",
  "segments": [
    { "start": 0.0, "end": 8.4, "text": "这节课讲泰勒公式", "speaker": "SPK1" }
  ]
}
```

**请提供**：base_url、鉴权方式（app key/secret 或 bearer token）、长音频限制与计费量级。

### 2. LLM 结构化总结（✅ 已接入）

> **当前已接入**：OpenRouter · `deepseek/deepseek-v4.1-flash`（多模态，直接读图）
> 照片/文档上传后自动提炼为结构化笔记（标题/摘要/提纲/关键词/复习卡片）并生成 Word。

换任意 OpenAI 兼容服务（含私有部署）：

```bash
XINLI_LLM_URL=https://your-endpoint/v1/chat/completions   # 默认 OpenRouter
XINLI_LLM_KEY=sk-xxx                                        # 默认读 OPENROUTER_API_KEY
XINLI_LLM_MODEL=deepseek/deepseek-v4.1-flash                # 默认同左
```

**提炼输出 schema**（cli.js 内部约定，换模型时保持）：

```json
{
  "title": "标题",
  "summary": "2-3句摘要",
  "outline": ["提纲要点"],
  "keywords": ["关键词"],
  "points": ["关键细节/公式/任务"],
  "cards": [{ "q": "问题", "a": "答案" }]
}
```

多模态图片走 `content: [{type:"image_url", image_url:{url:"data:image/jpeg;base64,..."}}, ...]`。

### 3. 心力球设备接入协议（有的话）

目前用 `cli.js ball` 模拟器顶着，接真机时需要：

- 连接方式：BLE GATT（Service/Characteristic UUID 表）还是 USB/串口，或官方 App 数据导出格式
- 音频：格式、采样率、码率、加密方式、如何分片拉取
- 状态读取：电量 / 存储 / 录制状态 的特征值或命令字
- 控制指令：开始/停止/同步/焚毁 的命令格式

**请提供**：任意形式的协议文档或抓包样例。

### 4. 环境变量约定（我这边已预留）

```bash
XINLI_ASR_URL=        # ASR 服务地址
XINLI_ASR_KEY=        # ASR 鉴权
XINLI_LLM_URL=        # LLM 服务地址（OpenAI 兼容）
XINLI_LLM_KEY=        # LLM key
XINLI_LLM_MODEL=      # 模型名
XINLI_BALL_PROTO=     # 设备协议文档路径/地址
```
