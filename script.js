import LibcurlTransport from '@mercuryworkshop/libcurl-transport';
import { defaultConfigDev, Plugin, Tap } from '@mercuryworkshop/scramjet';
import { Controller } from '@mercuryworkshop/scramjet-controller';
import { UrlWatcherPlugin } from '@mercuryworkshop/scramjet-utils';
import { siYoutube, siTiktok, siNetflix, siSpotify, siTwitch, siReddit, siInstagram, siDiscord, siDuckduckgo } from 'simple-icons';

const tabsNode = document.querySelector('#browser-tabs');
const homeView = document.querySelector('#home-view');
const framesNode = document.querySelector('#frames');
const addressInput = document.querySelector('#address-input');
const connectionStatus = document.querySelector('#connection-status');
const toast = document.querySelector('#toast');
const errorPanel = document.querySelector('#error-panel');
const errorToggle = document.querySelector('#error-toggle');
const errorCount = document.querySelector('#error-count');
const errorList = document.querySelector('#error-list');
const tabs = [];
const searchPrefix = 'https://duckduckgo.com/?q=';
const errorStorageKey = 'nova-error-log-v2';
let diagnostics = [];
const appLogos = {
  youtube: siYoutube,
  tiktok: siTiktok,
  netflix: siNetflix,
  spotify: siSpotify,
  twitch: siTwitch,
  reddit: siReddit,
  instagram: siInstagram,
  discord: siDiscord,
};
let activeId = null;
let controller = null;
let toastTimer;

try {
  const saved = JSON.parse(localStorage.getItem(errorStorageKey) || '[]');
  if (Array.isArray(saved)) diagnostics = saved.slice(0, 100);
} catch {}

function renderDiagnostics() {
  errorCount.textContent = String(diagnostics.length);
  errorList.replaceChildren();
  if (!diagnostics.length) {
    const empty = document.createElement('p');
    empty.className = 'error-empty';
    empty.textContent = 'No diagnostic reports are saved yet.';
    errorList.append(empty);
  } else {
    for (const entry of diagnostics) {
      const card = document.createElement('article');
      card.className = 'error-entry';
      const heading = document.createElement('h4');
      heading.textContent = `${entry.name || 'Error'}${entry.source ? ` · ${entry.source}` : ''}`;
      const message = document.createElement('p');
      message.textContent = entry.message || 'No error message was supplied.';
      card.append(heading, message);
      if (entry.request) {
        const context = document.createElement('p');
        context.className = 'error-context';
        const request = entry.request;
        context.textContent = [request.method, request.target, request.destination && `type=${request.destination}`, request.status && `status=${request.status}`].filter(Boolean).join(' · ');
        card.append(context);
      }
      if (entry.stack) {
        const details = document.createElement('details');
        details.className = 'error-stack';
        const summary = document.createElement('summary');
        summary.textContent = 'Full error / stack';
        const pre = document.createElement('pre');
        pre.textContent = entry.stack;
        details.append(summary, pre);
        card.append(details);
      }
      const meta = document.createElement('small');
      const when = new Date(entry.time);
      meta.textContent = `${entry.tab ? `${entry.tab} · ` : ''}${Number.isNaN(when.valueOf()) ? '' : when.toLocaleString()}`;
      card.append(meta);
      errorList.append(card);
    }
  }
}

function recordDiagnostic(entry, { openPanel = false } = {}) {
  const normalized = {
    source: String(entry.source || 'Unknown source').slice(0, 120),
    name: String(entry.name || 'Error').slice(0, 120),
    message: String(entry.message || '').slice(0, 2000),
    stack: String(entry.stack || '').slice(0, 6000),
    request: entry.request || null,
    tab: String(entry.tab || '').slice(0, 120),
    time: entry.time || new Date().toISOString(),
  };
  const now = Date.now();
  const previous = diagnostics[0];
  if (previous?.source === normalized.source && previous?.name === normalized.name && previous?.message === normalized.message && previous?.request?.target === normalized.request?.target && now - Date.parse(previous.time) < 1500) return;
  diagnostics.unshift(normalized);
  diagnostics = diagnostics.slice(0, 100);
  try { localStorage.setItem(errorStorageKey, JSON.stringify(diagnostics)); } catch {}
  renderDiagnostics();
  if (openPanel) {
    errorPanel.hidden = false;
    errorToggle.setAttribute('aria-expanded', 'true');
  }
}

function unpackProxyUrl(rawUrl) {
  try {
    const outer = new URL(rawUrl);
    if (!outer.pathname.startsWith('/~/sj/')) return { target: `${outer.host}${outer.pathname}` };
    const pieces = outer.pathname.split('/').slice(5).join('/');
    const decoded = decodeURIComponent(pieces);
    const remote = new URL(decoded);
    return { target: `${remote.host}${remote.pathname}` };
  } catch {
    return { target: String(rawUrl || '') };
  }
}

let serverDiagnosticCursor = 0;
async function pollServerDiagnostics() {
  try {
    const response = await fetch(`/api/diagnostics?after=${serverDiagnosticCursor}`, { cache: 'no-store' });
    if (!response.ok) return;
    const events = await response.json();
    for (const event of events) {
      serverDiagnosticCursor = Math.max(serverDiagnosticCursor, event.id);
      recordDiagnostic({ source: event.source, name: event.name, message: event.message, time: new Date(event.time).toISOString() });
    }
  } catch {}
}
setInterval(pollServerDiagnostics, 1200);
pollServerDiagnostics();
renderDiagnostics();

errorToggle.addEventListener('click', () => {
  errorPanel.hidden = !errorPanel.hidden;
  errorToggle.setAttribute('aria-expanded', String(!errorPanel.hidden));
});
document.querySelector('#close-errors').addEventListener('click', () => {
  errorPanel.hidden = true;
  errorToggle.setAttribute('aria-expanded', 'false');
});
document.querySelector('#clear-errors').addEventListener('click', () => {
  diagnostics = [];
  try { localStorage.removeItem(errorStorageKey); } catch {}
  renderDiagnostics();
});

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.data?.source !== 'nova-proxy-server') return;
  const tab = tabs.find((candidate) => candidate.iframe?.contentWindow === event.source);
  if (!tab) return;
  recordDiagnostic({ ...event.data.diagnostic, source: 'Nova server', tab: tab.title }, { openPanel: true });
});

window.addEventListener('error', (event) => {
  recordDiagnostic({ source: 'Nova window', name: event.error?.name || 'Error', message: event.message, stack: event.error?.stack || '', request: { target: event.filename, line: event.lineno, column: event.colno } }, { openPanel: true });
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  recordDiagnostic({ source: 'Nova promise', name: reason?.name || 'Unhandled rejection', message: reason?.message || String(reason || 'No rejection reason was supplied.'), stack: reason?.stack || '' }, { openPanel: true });
});

function setStatus(message, ready = false) {
  connectionStatus.classList.toggle('ready', ready);
  connectionStatus.querySelector('span').textContent = ready ? '●' : '○';
  connectionStatus.lastChild.textContent = ` ${message}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function logoSvg(icon, label, className = 'brand-logo') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.classList.add(className);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', icon.path);
  path.setAttribute('fill', /^0{3,6}$/i.test(icon.hex) ? '#f4f7ff' : `#${icon.hex}`);
  svg.append(path);
  return svg;
}

for (const [brand, icon] of Object.entries(appLogos)) {
  const badge = document.querySelector(`.app-icon.${brand}`);
  if (badge) {
    badge.replaceChildren(logoSvg(icon, `${icon.title} logo`));
    badge.setAttribute('aria-label', `${icon.title} logo`);
  }
}

document.querySelectorAll('.media-card').forEach((card) => {
  const brand = card.classList.contains('video-card') ? 'youtube' : card.classList.contains('short-card') ? 'tiktok' : 'spotify';
  const icon = appLogos[brand];
  const heading = card.querySelector('h3');
  if (heading && icon) heading.prepend(logoSvg(icon, `${icon.title} logo`));
});

document.querySelectorAll('.ddg-mark').forEach((badge) => {
  badge.replaceChildren(logoSvg(siDuckduckgo, 'DuckDuckGo logo', 'ddg-logo'));
});

function activeTab() {
  return tabs.find((tab) => tab.id === activeId);
}

function renderTabs() {
  tabsNode.replaceChildren();
  for (const tab of tabs) {
    const item = document.createElement('div');
    item.className = `browser-tab${tab.id === activeId ? ' active' : ''}`;

    const select = document.createElement('button');
    select.className = 'tab-select';
    select.type = 'button';
    select.title = tab.url || 'Nova start page';
    select.textContent = tab.title;
    select.addEventListener('click', () => activateTab(tab.id));

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.type = 'button';
    close.setAttribute('aria-label', `Close ${tab.title}`);
    close.textContent = '×';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });

    item.append(select, close);
    tabsNode.append(item);
  }
}

function activateTab(id) {
  activeId = id;
  const tab = activeTab();
  if (!tab) return;
  homeView.hidden = !tab.home;
  for (const item of tabs) {
    if (item.iframe) item.iframe.closest('.frame-panel').hidden = item.id !== id || item.home;
  }
  addressInput.value = tab.home ? '' : tab.url;
  renderTabs();
}

function createTab() {
  const tab = { id: crypto.randomUUID(), title: 'New tab', home: true, mode: 'home', url: '', iframe: null, frame: null };
  tabs.push(tab);
  activateTab(tab.id);
  addressInput.focus({ preventScroll: true });
  return tab;
}

function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  tab.iframe?.closest('.frame-panel')?.remove();
  if (!tabs.length) {
    createTab();
    return;
  }
  if (activeId === id) activateTab(tabs[Math.max(0, index - 1)].id);
  else renderTabs();
}

function resolveInput(raw) {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {}
  if (!/\s/.test(value) && /^(localhost|([\w-]+\.)+[a-z]{2,})(:\d+)?([/?#].*)?$/i.test(value)) {
    return `https://${value}`;
  }
  const query = searchPrefix + encodeURIComponent(value);
  return query;
}

function makeFramePanel(tab) {
  const panel = document.createElement('section');
  panel.className = 'frame-panel';
  panel.dataset.tabId = tab.id;
  const iframe = document.createElement('iframe');
  iframe.className = 'proxy-frame';
  iframe.name = `nova-${tab.id}`;
  iframe.title = tab.title;
  panel.append(iframe);
  framesNode.append(panel);
  tab.iframe = iframe;
  return iframe;
}

function clearFrame(tab) {
  tab.iframe?.closest('.frame-panel')?.remove();
  tab.iframe = null;
  tab.frame = null;
}

function openLocalPage(path, title) {
  const tab = activeTab();
  if (!tab) return;
  if (tab.mode !== 'local' || tab.url !== new URL(path, location.href).href) {
    clearFrame(tab);
    const iframe = makeFramePanel(tab);
    iframe.title = title;
    iframe.src = path;
  }
  tab.home = false;
  tab.mode = 'local';
  tab.url = new URL(path, location.href).href;
  tab.title = title;
  activateTab(tab.id);
}

function navigate(raw) {
  const destination = resolveInput(raw);
  if (!destination) return;
  if (!controller) {
    showToast('The proxy is still starting. Try again in a moment.');
    recordDiagnostic({ source: 'Nova navigation', name: 'Error', message: 'Navigation was requested before the proxy controller was ready.', request: { target: raw.trim() } }, { openPanel: true });
    return;
  }

  const tab = activeTab();
  if (!tab) return;
  let parsed;
  try {
    parsed = new URL(destination);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only web addresses are supported.');
  } catch (error) {
    showToast(error.message || 'Enter a valid website address.');
    return;
  }

  if (tab.mode !== 'remote') {
    clearFrame(tab);
    const iframe = makeFramePanel(tab);
    iframe.title = 'Proxied website';
    tab.frame = controller.createFrame(iframe, {
      plugins: [new UrlWatcherPlugin((url) => {
        if (activeId !== tab.id || tab.mode !== 'remote') return;
        tab.url = url;
        addressInput.value = url;
        try { tab.title = new URL(url).hostname.replace(/^www\./, ''); } catch {}
        renderTabs();
      })],
    });
    const diagnostics = new Plugin(`nova-errors-${tab.id}`);
    Tap.tap(tab.frame.hooks.error.request, ({ error, rawrequest }) => {
      const isPageRequest = ['document', 'iframe'].includes(rawrequest?.destination);
      recordDiagnostic({
        source: 'Scramjet request',
        name: error?.name || 'Error',
        message: error?.message || String(error),
        stack: error?.stack || '',
        request: { method: rawrequest?.method, destination: rawrequest?.destination, ...unpackProxyUrl(rawrequest?.rawUrl) },
        tab: tab.title,
      }, { openPanel: isPageRequest });
    }, diagnostics);
    tab.mode = 'remote';
  }

  tab.home = false;
  tab.url = destination;
  tab.title = parsed.hostname.replace(/^www\./, '') || 'Website';
  addressInput.value = destination;
  tab.frame.go(destination);
  activateTab(tab.id);
}

function showHome() {
  const tab = activeTab();
  if (!tab) return;
  tab.home = true;
  tab.mode = 'home';
  tab.title = 'New tab';
  activateTab(tab.id);
}

document.querySelector('#new-tab').addEventListener('click', createTab);
document.querySelector('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  showHome();
});
document.querySelector('#address-form').addEventListener('submit', (event) => {
  event.preventDefault();
  navigate(addressInput.value);
});
document.querySelector('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  navigate(document.querySelector('#search-input').value);
});
document.querySelector('#app-grid').addEventListener('click', (event) => {
  const local = event.target.closest('[data-open-local]');
  if (local) {
    event.preventDefault();
    openLocalPage(local.dataset.openLocal, local.dataset.title || 'Nova app');
    return;
  }
  const link = event.target.closest('[data-open-url]');
  if (!link) return;
  event.preventDefault();
  navigate(link.dataset.openUrl);
});
document.querySelector('.media-grid').addEventListener('click', (event) => {
  const link = event.target.closest('[data-open-url]');
  if (!link) return;
  event.preventDefault();
  navigate(link.dataset.openUrl);
});
document.querySelector('#go-back').addEventListener('click', () => {
  const tab = activeTab();
  if (tab?.frame) tab.frame.back();
  else if (tab?.mode === 'local') tab.iframe?.contentWindow?.history.back();
});
document.querySelector('#go-forward').addEventListener('click', () => {
  const tab = activeTab();
  if (tab?.frame) tab.frame.forward();
  else if (tab?.mode === 'local') tab.iframe?.contentWindow?.history.forward();
});
document.querySelector('#reload-page').addEventListener('click', () => {
  const tab = activeTab();
  if (tab?.frame) tab.frame.reload();
  else if (tab?.mode === 'local') tab.iframe?.contentWindow?.location.reload();
});
document.querySelector('#go-home').addEventListener('click', showHome);
document.querySelector('#search-input').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') event.currentTarget.value = '';
});
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.key.toLowerCase() === 'l') {
    event.preventDefault();
    addressInput.focus();
    addressInput.select();
  } else if (event.key.toLowerCase() === 't') {
    event.preventDefault();
    createTab();
  } else if (event.key.toLowerCase() === 'w' && tabs.length > 1) {
    event.preventDefault();
    closeTab(activeId);
  }
});

createTab();

async function startProxy() {
  if (!('serviceWorker' in navigator)) throw new Error('This browser does not support service workers.');
  setStatus('Starting proxy');
  const registration = await navigator.serviceWorker.register('/controller/controller.sw.js', { scope: '/' });
  await registration.update();
  await navigator.serviceWorker.ready;

  // Wait for this page to be controlled by the current (possibly just updated)
  // worker. A truthy controller may still be the old worker from a prior load.
  const serviceworker = await new Promise((resolve, reject) => {
    let poll;
    const finish = (worker, error) => {
      clearTimeout(timeout);
      clearInterval(poll);
      navigator.serviceWorker.removeEventListener('controllerchange', checkController);
      if (error) reject(error);
      else resolve(worker);
    };
    const checkController = () => {
      const active = registration.active;
      if (active?.state === 'activated' && navigator.serviceWorker.controller === active) finish(active);
    };
    const timeout = setTimeout(() => {
      finish(null, new Error('The proxy service worker did not take control. Reload Nova and try again.'));
    }, 10000);
    poll = setInterval(checkController, 100);
    navigator.serviceWorker.addEventListener('controllerchange', checkController);
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', checkController));
    checkController();
  });
  if (!serviceworker) throw new Error('The proxy service worker did not start. Reload the page and try again.');

  const wisp = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/`;
  const transport = new LibcurlTransport({ wisp });
  const originalRequest = transport.request.bind(transport);
  transport.request = async (remote, method, body, headers, signal) => {
    const result = await originalRequest(remote, method, body, headers, signal);
    if (result.status >= 400) {
      const url = new URL(remote);
      const destination = headers.find(([name]) => name.toLowerCase() === 'sec-fetch-dest')?.[1] || '';
      const isPageRequest = ['document', 'iframe'].includes(destination);
      recordDiagnostic({
        source: 'Libcurl response',
        name: `HTTP ${result.status}`,
        message: `The remote server responded ${result.status}${result.statusText ? ` ${result.statusText}` : ''}.`,
        request: { method, target: `${url.hostname}${url.pathname}`, destination, status: result.status },
        tab: url.hostname,
      }, { openPanel: isPageRequest });
    }
    return result;
  };
  controller = new Controller({
    serviceworker,
    transport,
    scramjetConfig: defaultConfigDev,
  });
  await controller.wait();
  setStatus('Proxy ready', true);
}

startProxy().catch((error) => {
  console.error('Nova proxy failed to start:', error);
  setStatus('Proxy unavailable');
  recordDiagnostic({ source: 'Nova startup', name: error.name || 'Error', message: error.message || String(error), stack: error.stack || '' }, { openPanel: true });
  showToast(error.message || 'Could not start the proxy.');
});
