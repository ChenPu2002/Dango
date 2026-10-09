/* loader：react-native 生态 mock + api.js → mock-llm + src 强制 ESM（同 loader.mjs，多一条 api 重定向） */
const MOCKS = {
  react: new URL('./mock-react.mjs', import.meta.url).href,
  '@react-native-async-storage/async-storage': new URL('./mock-async-storage.mjs', import.meta.url).href,
  'expo-file-system/legacy': new URL('./mock-expo-fs.mjs', import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) return { url: MOCKS[specifier], shortCircuit: true };
  /* 精确拦截 src 内部对 ./api 的导入 → mock-llm（secrets 保持真实） */
  if (specifier === './api' && context.parentURL && context.parentURL.includes('/xinli-app/src/')) {
    return { url: new URL('./mock-llm.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL && context.parentURL.includes('/xinli-app/')) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  if (url.startsWith('file:') && url.includes('/xinli-app/src/') && url.endsWith('.js')) {
    return { ...r, format: 'module' };
  }
  return r;
}
