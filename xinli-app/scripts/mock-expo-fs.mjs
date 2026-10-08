export const documentDirectory = 'file:///mock/';
export const cacheDirectory = 'file:///mock-cache/';
export const EncodingType = { UTF8: 'utf8', Base64: 'base64' };
export const StorageAccessFramework = {
  getUriForDirectoryInRoot: (d) => `content://mock/tree/${d}`,
  requestDirectoryPermissionsAsync: async () => ({ granted: false }),
  makeDirectoryAsync: async () => {},
  createFileAsync: async () => { throw new Error('mock: SAF 不可用'); },
};
export const makeDirectoryAsync = async () => {};
export const copyAsync = async () => {};
export const readAsStringAsync = async () => { throw new Error('mock read'); };
export const writeAsStringAsync = async () => {};
export const deleteAsync = async () => {};
export const getInfoAsync = async () => ({ exists: false, size: 0 });
