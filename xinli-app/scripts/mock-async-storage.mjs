const DB = new Map();
export default {
  getItem: async (k) => (DB.has(k) ? DB.get(k) : null),
  setItem: async (k, v) => { DB.set(k, String(v)); },
  removeItem: async (k) => { DB.delete(k); },
};
