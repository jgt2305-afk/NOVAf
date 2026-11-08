// The Scramjet controller bundle exposes shouldRoute() and route(); this worker
// wrapper connects those functions to the browser's fetch interception events.
importScripts('/controller/controller.bundle.js');

const scramjet = self.$scramjetController;

if (!scramjet || typeof scramjet.shouldRoute !== 'function' || typeof scramjet.route !== 'function') {
  throw new Error('Scramjet controller bundle did not expose its routing API.');
}

self.addEventListener('fetch', (event) => {
  if (scramjet.shouldRoute(event)) {
    event.respondWith(scramjet.route(event));
  }
});
