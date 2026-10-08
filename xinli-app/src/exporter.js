/* 文档固化 v2：
 * - 固定目录：文档/团子（一次授权，不允许更换）
 * - 团子手帐.md：应用独占维护的活文档（画像/课程笔记/日结/周记），全量重写、用户只读
 * - 每条记录的转写/提炼文件照旧；删除只能通过 App 内操作 */
import * as FS from 'expo-file-system/legacy';
import { getState, setState, uid } from './store';

const SAF = FS.StorageAccessFramework;
const FOLDER = '团子';
const MEMORY_FILE = '团子手帐.md';
const MIME = { '.md': 'text/markdown', '.txt': 'text/plain' };

/* 记录已授权目录（tree uri），推导固定子目录的确定性 URI */
export function deriveDirUri(root) {
  const docPath = encodeURIComponent(`primary:Documents/${FOLDER}`);
  return `${root}/document/${docPath}`;
}

/* 确保目录可用：已授权则直接推导；未授权时仅 ask=true（用户手势链路）才弹系统授权
 * —— 后台路径（启动归档/自动同步）绝不能弹系统窗，静默跳过等用户下次手动同步 */
export async function ensureExportDir({ ask } = {}) {
  const st = getState();
  let root = st.settings.exportRoot;
  /* 迁移：旧 exportDir 里提取 tree 部分（保留已授予的权限，并回归正牌 团子 目录） */
  if (!root && st.settings.exportDir && st.settings.exportDir.includes('/tree/')) {
    root = st.settings.exportDir.split('/document/')[0];
  }
  if (!root) {
    if (!ask) return null; /* 无授权且非用户手势：静默跳过，不弹系统授权窗 */
    const perm = await SAF.requestDirectoryPermissionsAsync(SAF.getUriForDirectoryInRoot('Documents'));
    if (!perm.granted) return null;
    root = perm.directoryUri.split('/document/')[0];
    setState((s) => ({ ...s, settings: { ...s.settings, exportRoot: root } }));
  } else {
    setState((s) => ({ ...s, settings: { ...s.settings, exportRoot: root } }));
  }
  const dirUri = deriveDirUri(root);
  /* 确保 团子 子目录存在（SAF 不自动创建父目录；已存在时 makeDirectoryAsync 会抛错，忽略即可） */
  const parentUri = `${root}/document/${encodeURIComponent('primary:Documents')}`;
  try { await SAF.makeDirectoryAsync(parentUri, FOLDER); } catch (_) {}
  setState((s) => ({ ...s, settings: { ...s.settings, exportDir: dirUri } }));
  return dirUri;
}

/* 覆盖式写入：已有文件直接更新（不产生 (1) 副本），不存在则创建；
 * 写后回读校验——个别机型（OPPO/ColorOS）的 DocumentsProvider 会"假成功"，必须确认落盘 */
async function writeSafe(dirUri, fileName, content, mime) {
  const ext = (fileName.match(/\.\w+$/) || ['.txt'])[0];
  const m = mime || MIME[ext] || 'text/plain';
  const fileUri = `${dirUri}%2F${encodeURIComponent(fileName)}`;
  let wrote = false;
  try {
    await FS.writeAsStringAsync(fileUri, content, { encoding: FS.EncodingType.UTF8 });
    wrote = true;
  } catch (_) {}
  if (!wrote) {
    const nu = await SAF.createFileAsync(dirUri, fileName, m);
    await FS.writeAsStringAsync(nu, content, { encoding: FS.EncodingType.UTF8 });
  }
  const back = await FS.readAsStringAsync(fileUri, { encoding: FS.EncodingType.UTF8 }).catch(() => null);
  if (back !== content) throw new Error(`写入未生效: ${fileName}`);
  /* 记录到已导出清单（同名去重，保留最新时间） */
  setState((st) => {
    const rest = (st.exportedFiles || []).filter((f) => f.name !== fileName);
    return { ...st, exportedFiles: [{ name: fileName, at: Date.now(), content: String(content).slice(0, 4000) }, ...rest].slice(0, 100) };
  });
}

/* ===== 记忆文件（应用独占维护）===== */
export function buildMemoryMd(st) {
  const L = [];
  L.push('# 团子 · 记忆\n');
  L.push('> 本文件由团子 App 维护（画像可在 App 内编辑）。删除请走 App 内「清空全部数据」。\n');
  L.push('## 👤 画像\n');
  L.push(st.profile && st.profile.text ? st.profile.text : '（暂无）');
  L.push('\n## 📘 课程笔记\n');
  const cn = Object.entries(st.courseNotes || {});
  if (!cn.length) L.push('（暂无）');
  cn.forEach(([course, note]) => {
    L.push(`\n### ${course}\n`);
    L.push(note.content || '');
  });
  L.push('\n## 📅 每日小结\n');
  const dl = (st.dailies || []).slice(0, 14);
  if (!dl.length) L.push('（暂无）');
  dl.forEach((d) => L.push(`- **${d.date}** ${d.emoji || ''} ${d.summary}`));
  L.push('\n## 📆 周记\n');
  const wl = (st.weeklies || []).slice(0, 6);
  if (!wl.length) L.push('（暂无）');
  wl.forEach((w) => L.push(`- **${w.range}** ${w.summary}`));
  L.push(`\n---\n*最后更新：${new Date().toLocaleString('zh-CN')}*\n`);
  return L.join('\n');
}

export async function writeMemoryFile() {
  const dir = await ensureExportDir();
  if (!dir) return;
  await writeSafe(dir, MEMORY_FILE, buildMemoryMd(getState()));
}

/* App 内清空时调用：记忆文件写入清空标记（SAF 语义下的"删除"） */
export async function clearMemoryFile() {
  const st = getState();
  if (!st.settings.exportDir) return;
  try {
    await writeSafe(st.settings.exportDir, MEMORY_FILE, `# 团子 · 记忆\n\n> 已于 ${new Date().toLocaleString('zh-CN')} 在 App 内清空。\n`);
  } catch (_) {}
}

/* ===== 每条记录的文件 ===== */
function jobFiles(j) {
  const d = new Date(j.createdAt);
  const stamp = `${d.getMonth() + 1}${String(d.getDate()).padStart(2, '0')}`;
  const title = ((j.extract && j.extract.title) || j.title || '记录').replace(/[\\/:*?"<>|]/g, '').slice(0, 24);
  const files = [];
  if (j.asrText) files.push({ name: `${stamp}_${title}_转写.txt`, content: j.asrText });
  if (j.extract) files.push({
    name: `${stamp}_${title}_提炼.md`,
    content: `# ${j.extract.title || title}\n\n> ${d.getMonth() + 1}月${d.getDate()}日 · ${j.kind === 'audio' ? '录音' : j.kind === 'photo' ? '照片' : '文档'} · 自动提炼\n\n## 摘要\n${j.extract.summary || ''}\n\n## 提纲\n${(j.extract.outline || []).map((o) => '- ' + o).join('\n')}\n\n## 关键点\n${(j.extract.points || []).map((o) => '- ' + o).join('\n')}\n\n## 复习卡片\n${(j.extract.cards || []).map((c) => `- **Q:** ${c.q}\n  **A:** ${c.a}`).join('\n')}\n`,
  });
  return files;
}

export async function exportJob(j) {
  const dir = getState().settings.exportDir || (await ensureExportDir());
  if (!dir) return;
  for (const f of jobFiles(j)) {
    try { await writeSafe(dir, f.name, f.content); } catch (e) { console.log('[dango] 导出失败', f.name, String((e && e.message) || e).slice(0, 60)); }
  }
}

/* 全量导出：记忆文件 + 近30条记录（用户手势触发，可弹授权） */
export async function exportAll() {
  const dir = await ensureExportDir({ ask: true });
  if (!dir) throw new Error('未授权文档目录');
  let n = 0;
  await writeSafe(dir, MEMORY_FILE, buildMemoryMd(getState())); n++;
  const st = getState();
  for (const j of st.jobs.filter((x) => x.status === 'done').slice(0, 30)) {
    for (const f of jobFiles(j)) { try { await writeSafe(dir, f.name, f.content); n++; } catch (_) {} }
  }
  console.log('[dango] 📤 导出完成', n, '个文件');
  return n;
}

/* 兼容旧入口名 */
export const pickExportDir = ensureExportDir;
