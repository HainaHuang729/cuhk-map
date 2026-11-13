window.CUHK_GPS_STORE = (()=>{
  const dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open('cuhk-web-gps-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('sessions',{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  function run(mode,fn){return dbPromise.then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('sessions',mode),request=fn(tx.objectStore('sessions'));
    tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('本地保存中断'));
  }));}
  return {put:value=>run('readwrite',s=>s.put(value)),remove:id=>run('readwrite',s=>s.delete(id)),all:()=>run('readonly',s=>s.getAll())};
})();
