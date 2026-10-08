/* Node 测试钩子：把 react-native 生态依赖映射到 mock，并把 src/*.js 强制按 ESM 加载
 * 用法：node --import ./scripts/register.mjs scripts/test-archivist.mjs */
const MOCKS = {
  react: new URL('./mock-react.mjs', import.meta.url).href,
  '@react-native-async-storage/async-storage': new URL('./mock-async-storage.mjs', import.meta.url).href,
  'expo-file-system/legacy': new URL('./mock-expo-fs.mjs', import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) return { url: MOCKS[specifier], shortCircuit: true };
  /* RN 习惯的扩展名省略导入（'./store'）→ 补 .js */
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL && context.parentURL.includes('/xinli-app/')) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  if (url.startsWith('file:') && url.includes('/xinli-app/src/') && url.endsWith('.js')) {
    return { ...r, format: 'module' }; /* src 无 package type，Node 默认按 CJS 解析，强制 ESM */
  }
  return r;
}
