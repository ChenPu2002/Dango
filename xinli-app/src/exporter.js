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
  L.push('\n## 🗄️ 月结\n');
  const ml = (st.monthlies || []).slice(0, 6);
  if (!ml.length) L.push('（暂无）');
  ml.forEach((m) => L.push(`- **${m.range}** ${m.summary}`));
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

/* 备份 = 刷新 App 内文档索引（云文档页数据源，纯 store）+（已关联系统文件夹时）静默镜像写盘。
 * 永远不弹系统授权窗；文件夹关联只能通过 云文档 页脚的显式入口 */
export async function exportAll() {
  const st = getState();
  const entries = [{ name: MEMORY_FILE, content: buildMemoryMd(st) }];
  st.jobs.filter((j) => j.status === 'done').forEach((j) => {
    jobFiles(j).forEach((f) => entries.push({ name: f.name, content: f.content }));
  });
  const at = Date.now();
  setState((s2) => ({ ...s2, exportedFiles: entries.slice(0, 120).map((e) => ({ name: e.name, at, content: String(e.content).slice(0, 4000) })) }));

  const root = (() => {
    let r = st.settings.exportRoot;
    if (!r && st.settings.exportDir && st.settings.exportDir.includes('/tree/')) r = st.settings.exportDir.split('/document/')[0];
    return r;
  })();
  if (root) {
    try {
      const dir = deriveDirUri(root);
      await SAF.makeDirectoryAsync(`${root}/document/${encodeURIComponent('primary:Documents')}`, FOLDER).catch(() => {});
      for (const e of entries.slice(0, 31)) {
        try { await writeSafe(dir, e.name, e.content); } catch (_) {}
      }
      console.log('[dango] 📤 镜像同步完成', Math.min(entries.length, 31), '个');
    } catch (e) { console.log('[dango] 镜像同步失败', String((e && e.message) || e).slice(0, 60)); }
  }
  console.log('[dango] 📤 文档索引已刷新', entries.length, '个');
  return entries.length;
}

/* 显式关联系统文件夹（云文档页脚唯一入口，用户主动点击才可能弹系统选择器） */
export async function linkSystemFolder() {
  const dir = await ensureExportDir({ ask: true });
  return !!dir;
}

/* 删除一条记录在云文档中的衍生物（索引条目 + 已关联时的镜像文件） */
export async function removeJobFiles(job) {
  const names = jobFiles(job).map((f) => f.name);
  setState((s) => ({ ...s, exportedFiles: (s.exportedFiles || []).filter((f) => !names.includes(f.name)) }));
  const st = getState();
  const root = st.settings.exportRoot || (st.settings.exportDir && st.settings.exportDir.includes('/tree/') ? st.settings.exportDir.split('/document/')[0] : '');
  if (!root) return;
  const dir = deriveDirUri(root);
  for (const n of names) {
    try { await FS.deleteAsync(`${dir}%2F${encodeURIComponent(n)}`, { idempotent: true }); } catch (_) {}
  }
}

/* 兼容旧入口名 */
export const pickExportDir = ensureExportDir;
