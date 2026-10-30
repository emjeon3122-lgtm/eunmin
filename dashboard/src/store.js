// 이 PC의 브라우저(IndexedDB)에 올린 엑셀 파일을 저장해 두었다가 다음에 열 때 다시 불러온다.
// 사용자가 '이 PC에 저장'을 켠 경우에만 저장한다. 저장소를 쓸 수 없는 환경이면 조용히 끈다.
const Store = (() => {
  const DB = '실적대시보드';
  const STORE = 'session';
  const KEY = 'latest';

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function run(mode, fn) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  // session: { savedAt, files: [{ name, buf }], months: { '파일|시트': 'YYYY-MM' } }
  const save = (session) => run('readwrite', (s) => s.put(session, KEY));
  const load = () => run('readonly', (s) => s.get(KEY));
  const clear = () => run('readwrite', (s) => s.delete(KEY));
  const available = () => { try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch { return false; } };

  return { save, load, clear, available };
})();
