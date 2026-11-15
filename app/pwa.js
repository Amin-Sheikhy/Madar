'use strict';
// Cache only public UI assets; learner data and AI responses remain local/uncached.
if ('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='127.0.0.1' || location.hostname==='localhost')) {
  window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});
}
