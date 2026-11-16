'use strict';
const CACHE='madar-ui-4.56-siwc-reauth-buildlabel';
const FILES=['/','/index.html','/app.js','/extras.js','/knowledge_graph.js','/mastery_core.js','/offline_studio.js','/secure_backup.js','/vault_ui.js','/vault_ui.css','/pdf_simple.js','/pdf_simple.css','/dashboard_v452.js','/dashboard_v452.css','/simple_nav.js','/simple_nav.css','/curriculum_tree.js','/curriculum_tree.css','/learning_quality.js','/learning_quality.css','/ai_assessment.js','/ai_assessment.css','/observer.js','/observer.css','/styles.css','/knowledge_graph.css','/pwa.js','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('madar-ui-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
 if(!FILES.includes(u.pathname))return;
 e.respondWith(fetch(e.request).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c))}return res}).catch(()=>caches.match(e.request)));
});
