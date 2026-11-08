import { viteStaticCopy } from 'vite-plugin-static-copy';

export default {
  plugins: [
    viteStaticCopy({
      structured: false,
      targets: [
        { src: 'node_modules/@mercuryworkshop/scramjet/dist/scramjet.js', dest: 'scramjet' },
        { src: 'node_modules/@mercuryworkshop/scramjet/dist/scramjet.wasm', dest: 'scramjet' },
        { src: 'node_modules/@mercuryworkshop/scramjet-controller/dist/controller.api.js', dest: 'controller' },
        { src: 'node_modules/@mercuryworkshop/scramjet-controller/dist/controller.inject.js', dest: 'controller' },
        { src: 'node_modules/@mercuryworkshop/scramjet-controller/dist/controller.sw.js', dest: 'controller', rename: 'controller.bundle.js' },
      ],
    }),
  ],
  server: {
    headers: { 'Service-Worker-Allowed': '/' },
  },
};
