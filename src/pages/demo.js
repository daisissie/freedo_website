import '@google/model-viewer';

import sc1Url from '../../assets/sc1.png';
import sc2Url from '../../assets/sc2.png';
import sc3Url from '../../assets/sc3.png';
import sc4Url from '../../assets/sc4.png';
import sc5Url from '../../assets/sc5.png';
import sc6Url from '../../assets/sc6.png';

const MODEL_LABELS = {
  zhengrong: '峥嵘 Local',
  trellis: 'Model 2',
};

const DEFAULT_ZHENGRONG_API_BASE = '/api/zhengrong';
const DEFAULT_FAL_API_BASE = '/api/fal';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveApiBase(metaName, fallbackValue, globalKeys = []) {
  const metaValue = document.querySelector(`meta[name="${metaName}"]`)?.getAttribute('content');
  const globalValue = globalKeys
    .map(key => window[key])
    .find(value => typeof value === 'string' && value.trim());
  const raw = String(metaValue || globalValue || fallbackValue).trim();
  return raw.replace(/\/+$/, '') || fallbackValue;
}

const ZHENGRONG_API_BASE = resolveApiBase(
  'zhengrong-api-base',
  DEFAULT_ZHENGRONG_API_BASE,
  ['__ZHENGRONG_API_BASE__', 'ZHENGRONG_API_BASE']
);
const FAL_API_BASE = resolveApiBase(
  'fal-api-base',
  DEFAULT_FAL_API_BASE,
  ['__FAL_API_BASE__', 'FAL_API_BASE']
);

async function readResponseMessage(response, payload = null) {
  if (payload?.error) return payload.error;
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const json = payload || (await response.json().catch(() => null));
    return json?.error || json?.message || `Request failed (${response.status})`;
  }

  const text = await response.text().catch(() => '');
  return text || `Request failed (${response.status})`;
}

async function apiRequest(path, options = {}) {
  const config = { ...options };
  const headers = { ...(config.headers || {}) };
  const isFormData = typeof FormData !== 'undefined' && config.body instanceof FormData;

  if (config.body && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  config.headers = headers;

  const response = await fetch(path, config);
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    let message = await readResponseMessage(response, payload);

    if (!message && response.status === 404 && LOCAL_HOSTNAMES.has(window.location.hostname)) {
      message = 'Local API routes unavailable. Run `npm run dev` or deploy to EdgeOne.';
    }

    throw new Error(message || `Request failed (${response.status})`);
  }

  return payload;
}

function getActiveModelChoice() {
  return document.querySelector('#model-seg .seg-btn.active')?.dataset.value || 'zhengrong';
}

function getTextureSize() {
  const sliderValue = Number(document.getElementById('sl-tex').value);
  const textureIndex = Math.round(sliderValue / 100 * 2);
  return [1024, 2048, 4096][textureIndex];
}

function getDecimationTarget() {
  const sliderValue = Number(document.getElementById('sl-simplify').value);
  return Math.round((sliderValue / 100) * 1995000 + 5000);
}

function readGenerationSettings() {
  const rawSeed = Number(document.getElementById('seed-input').value);

  return {
    decimationTarget: getDecimationTarget(),
    resolution: Number(
      document.querySelector('#resolution-seg .seg-btn.active')?.dataset.value || 1024
    ),
    seed: Number.isFinite(rawSeed) ? rawSeed : 42,
    sparseStructureSteps: Number(document.getElementById('sl-sparse').value),
    ssGuidanceStrength: +(Number(document.getElementById('sl-sparse').value) / 5).toFixed(1),
    textureSize: getTextureSize(),
  };
}

function formatCompactNumber(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}

function applyModelHud(modelChoice, settings) {
  document.getElementById('hud-provider').textContent = MODEL_LABELS[modelChoice];
  document.getElementById('hud-resolution').textContent = String(settings.resolution);
  document.getElementById('hud-tex').textContent = `${settings.textureSize} px`;
  document.getElementById('hud-seed').textContent = String(settings.seed);
}

function syncSettingsLabels() {
  document.getElementById('val-simplify').textContent = formatCompactNumber(getDecimationTarget());
  document.getElementById('val-tex').textContent = `${getTextureSize()} px`;
  document.getElementById('val-sparse').textContent = document.getElementById('sl-sparse').value;
}

function buildZhengrongFormData(file, settings) {
  const formData = new FormData();
  formData.append('file', file, file.name);
  return formData;
}

async function downloadBlobUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await readResponseMessage(response));
  return URL.createObjectURL(await response.blob());
}

async function generateZhengrong(file, settings, onProgress) {
  const initial = await apiRequest(`${ZHENGRONG_API_BASE}/generate_3d`, {
    method: 'POST',
    body: buildZhengrongFormData(file, settings),
  });

  if (initial?.state) {
    return { state: initial.state };
  }

  if (!initial?.job_id) {
    throw new Error('Server returned neither state nor job_id.');
  }

  for (;;) {
    await delay(3000);

    const status = await apiRequest(`${ZHENGRONG_API_BASE}/job_status`, {
      method: 'POST',
      body: JSON.stringify({ job_id: initial.job_id }),
    });

    if (status.status === 'done') {
      if (!status.state) throw new Error('Server response missing "state".');
      return { state: status.state };
    }

    if (status.status === 'error') {
      throw new Error(status.error || 'Generation failed on server.');
    }

    if (onProgress) onProgress(status.status);
  }
}

async function extractZhengrongGlbBlob(modelState) {
  const response = await fetch(`${ZHENGRONG_API_BASE}/extract_glb`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(modelState),
  });

  if (!response.ok) {
    throw new Error(await readResponseMessage(response));
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return URL.createObjectURL(await response.blob());
  }

  const payload = await response.json().catch(() => null);
  if (!payload?.glb_job_id) {
    throw new Error('Server did not return GLB data.');
  }

  for (;;) {
    await delay(4000);

    const status = await apiRequest(`${ZHENGRONG_API_BASE}/glb_status`, {
      method: 'POST',
      body: JSON.stringify({ glb_job_id: payload.glb_job_id }),
    });

    if (status.status === 'done') break;
    if (status.status === 'error') {
      throw new Error(status.error || 'GLB extraction failed on server.');
    }
  }

  return downloadBlobUrl(
    `${ZHENGRONG_API_BASE}/download_glb?id=${encodeURIComponent(payload.glb_job_id)}`
  );
}

async function submitTrellis(file, settings) {
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('resolution', String(settings.resolution));
  formData.append('seed', String(settings.seed));
  formData.append('decimationTarget', String(settings.decimationTarget));
  formData.append('textureSize', String(settings.textureSize));
  formData.append('ssGuidanceStrength', String(settings.ssGuidanceStrength));
  formData.append('remesh', 'true');

  const job = await apiRequest(`${FAL_API_BASE}/submit`, {
    method: 'POST',
    body: formData,
  });

  return job.requestId;
}

async function pollTrellis(requestId) {
  for (;;) {
    await delay(2500);

    const status = await apiRequest(`${FAL_API_BASE}/status/${encodeURIComponent(requestId)}`);

    if (status.queuePosition != null) {
      genSubstep.textContent = `Queue position: ${status.queuePosition}…`;
    }

    if (status.status === 'COMPLETED') {
      const result = await apiRequest(`${FAL_API_BASE}/result/${encodeURIComponent(requestId)}`);
      return downloadBlobUrl(result.downloadUrl);
    }

    if (status.status === 'FAILED') {
      throw new Error(status.error || 'Generation failed.');
    }
  }
}

const STATE = {
  IDLE: 'idle',
  FILE: 'file',
  GENERATING: 'generating',
  GENERATED: 'generated',
  EXPORTING: 'exporting',
};

let state = STATE.IDLE;
let selectedFile = null;
let lastGlbUrl = null;
let lastModelChoice = 'zhengrong';
let lastRunSettings = readGenerationSettings();

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const dzPreview = document.getElementById('dz-preview');
const previewImg = document.getElementById('preview-img');
const previewFname = document.getElementById('preview-filename');
const dzRemove = document.getElementById('dz-remove');
const btnGenerate = document.getElementById('btn-generate');
const btnExtract = document.getElementById('btn-extract');
const btnSaveLibrary = document.getElementById('btn-save-library');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const stEmpty = document.getElementById('state-empty');
const stGenerating = document.getElementById('state-generating');
const stGenerated = document.getElementById('state-generated');
const genBar = document.getElementById('gen-bar');
const genPct = document.getElementById('gen-pct');
const genSubstep = document.getElementById('gen-substep');
const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const toolbar = document.getElementById('preview-toolbar');
const meshViewer = document.getElementById('mesh-viewer');
const toast = document.getElementById('toast');

document.querySelectorAll('.seg').forEach(seg => {
  seg.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('.seg-btn').forEach(button => button.classList.remove('active'));
      btn.classList.add('active');
    });
  });
});

document.getElementById('sl-simplify').addEventListener('input', syncSettingsLabels);
document.getElementById('sl-tex').addEventListener('input', syncSettingsLabels);
document.getElementById('sl-sparse').addEventListener('input', syncSettingsLabels);

document.getElementById('btn-random-seed').addEventListener('click', () => {
  document.getElementById('seed-input').value = Math.floor(Math.random() * 2147483647);
  if (state === STATE.GENERATED) {
    applyModelHud(lastModelChoice, { ...lastRunSettings, seed: Number(document.getElementById('seed-input').value) });
  }
});

dropzone.addEventListener('click', event => {
  if (event.target.closest('.dz-remove')) return;
  fileInput.click();
});

fileInput.addEventListener('change', event => {
  if (event.target.files[0]) loadFile(event.target.files[0]);
});

dropzone.addEventListener('dragover', event => {
  event.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

dropzone.addEventListener('drop', event => {
  event.preventDefault();
  dropzone.classList.remove('drag-over');
  if (event.dataTransfer.files[0]) loadFile(event.dataTransfer.files[0]);
});

dzRemove.addEventListener('click', event => {
  event.stopPropagation();
  clearFile();
});

function loadFile(file) {
  if (!file.type.match(/image\/(png|jpeg|webp)/)) {
    showToast('Unsupported format — use PNG, JPG or WEBP.');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showToast('File too large — max 10 MB.');
    return;
  }

  selectedFile = file;
  previewImg.src = URL.createObjectURL(file);
  previewFname.textContent = file.name;
  dzPreview.style.display = 'block';
  dzRemove.style.display = 'flex';
  dropzone.classList.add('has-file');
  setState(STATE.FILE);
}

function clearFile() {
  selectedFile = null;
  previewImg.src = '';
  dzPreview.style.display = 'none';
  dzRemove.style.display = 'none';
  dropzone.classList.remove('has-file');
  fileInput.value = '';
  setState(STATE.IDLE);
}

function setState(nextState) {
  state = nextState;

  btnGenerate.disabled = false;
  btnGenerate.classList.remove('loading');
  btnExtract.disabled = true;
  btnExtract.classList.remove('loading');
  btnSaveLibrary.disabled = true;
  statusDot.className = 'status-dot';
  toolbar.classList.remove('visible');

  stEmpty.classList.remove('visible');
  stGenerating.classList.remove('visible');
  stGenerated.classList.remove('visible');

  step1.className = 'step';
  step2.className = 'step';

  switch (nextState) {
    case STATE.IDLE:
      stEmpty.classList.add('visible');
      statusText.textContent = 'No image selected';
      btnGenerate.disabled = true;
      step1.classList.add('active');
      break;

    case STATE.FILE:
      stEmpty.classList.add('visible');
      statusDot.classList.add('ready');
      statusText.textContent = `Ready · ${selectedFile ? trimName(selectedFile.name) : ''}`;
      step1.classList.add('active');
      break;

    case STATE.GENERATING:
      stGenerating.classList.add('visible');
      statusDot.classList.add('running');
      statusText.textContent = 'Generating mesh…';
      btnGenerate.disabled = true;
      btnGenerate.classList.add('loading');
      step1.classList.add('active');
      break;

    case STATE.GENERATED:
      stGenerated.classList.add('visible');
      toolbar.classList.add('visible');
      statusDot.classList.add('done');
      statusText.textContent = 'Mesh ready';
      btnExtract.disabled = false;
      btnSaveLibrary.disabled = false;
      step1.classList.add('done');
      step2.classList.add('active');
      break;

    case STATE.EXPORTING:
      stGenerated.classList.add('visible');
      toolbar.classList.add('visible');
      statusDot.classList.add('running');
      statusText.textContent = 'Exporting GLB…';
      btnExtract.disabled = true;
      btnExtract.classList.add('loading');
      step1.classList.add('done');
      step2.classList.add('active');
      break;
  }
}

function trimName(name) {
  return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}

btnGenerate.addEventListener('click', async () => {
  if (!selectedFile || (state !== STATE.FILE && state !== STATE.GENERATED)) return;

  let progressTimer = null;

  lastGlbUrl = null;
  lastModelChoice = getActiveModelChoice();
  lastRunSettings = readGenerationSettings();

  setState(STATE.GENERATING);
  genBar.classList.remove('pulsing');
  genBar.style.transition = '';
  genBar.style.width = '5%';
  genPct.textContent = '5%';

  try {
    if (lastModelChoice === 'zhengrong') {
      genSubstep.textContent = 'Uploading image to 峥嵘…';
      let fakeProgress = 5;

      progressTimer = setInterval(() => {
        if (fakeProgress < 88) fakeProgress += Math.random() * 1.5 + 0.5;
        genBar.style.width = `${fakeProgress.toFixed(1)}%`;
        genPct.textContent = `${Math.round(fakeProgress)}%`;
      }, 1200);

      const generated = await generateZhengrong(selectedFile, lastRunSettings, status => {
        genSubstep.textContent = status === 'running' ? '峥嵘模型生成中…' : '排队等待中…';
      });

      clearInterval(progressTimer);
      progressTimer = null;

      genBar.style.width = '95%';
      genPct.textContent = '95%';
      genSubstep.textContent = '导出 GLB… (需要 1-3 分钟，请耐心等待)';
      genBar.style.transition = 'none';
      genBar.classList.add('pulsing');

      lastGlbUrl = await extractZhengrongGlbBlob(generated.state);
    } else {
      genSubstep.textContent = 'Uploading image via EdgeOne…';
      genBar.style.width = '20%';
      genPct.textContent = '20%';

      const requestId = await submitTrellis(selectedFile, lastRunSettings);
      genBar.style.width = '30%';
      genPct.textContent = '30%';
      genSubstep.textContent = 'Generating 3D mesh…';

      let fakeProgress = 30;
      progressTimer = setInterval(() => {
        if (fakeProgress < 88) fakeProgress += Math.random() * 1.2 + 0.3;
        genBar.style.width = `${fakeProgress.toFixed(1)}%`;
        genPct.textContent = `${Math.round(fakeProgress)}%`;
      }, 1200);

      lastGlbUrl = await pollTrellis(requestId);
    }

    clearInterval(progressTimer);
    progressTimer = null;
    genBar.classList.remove('pulsing');
    genBar.style.transition = '';
    genBar.style.width = '100%';
    genPct.textContent = '100%';
    genSubstep.textContent = 'Complete ✓';
    applyModelHud(lastModelChoice, lastRunSettings);
    await delay(380);

    setState(STATE.GENERATED);
    loadGLBIntoViewer(lastGlbUrl);
  } catch (error) {
    clearInterval(progressTimer);
    genBar.classList.remove('pulsing');
    genBar.style.transition = '';
    setState(selectedFile ? STATE.FILE : STATE.IDLE);
    showToast(`Error: ${error.message}`);
  }
});

btnExtract.addEventListener('click', async () => {
  if (state !== STATE.GENERATED || !lastGlbUrl) return;

  setState(STATE.EXPORTING);

  try {
    const anchor = document.createElement('a');
    anchor.href = lastGlbUrl;
    anchor.download = `mesh_${Date.now()}.glb`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setState(STATE.GENERATED);
    showToast('GLB downloaded ↓');
    saveToLibrary();
  } catch (error) {
    setState(STATE.GENERATED);
    showToast(`Export failed: ${error.message}`);
  }
});

function saveToLibrary() {
  if (!lastGlbUrl) return;

  const timestamp = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const previewUrl = previewImg.src || '';
  const modelLabel = MODEL_LABELS[lastModelChoice] || 'Model';
  const resolution = lastRunSettings?.resolution || 1024;

  libraryItems.unshift({
    name: `${modelLabel}_${timestamp}`,
    meta: `${modelLabel} · ${resolution}`,
    glbUrl: lastGlbUrl,
    imgUrl: previewUrl,
  });

  refreshLibrary();
}

btnSaveLibrary.addEventListener('click', () => {
  if (state !== STATE.GENERATED || !lastGlbUrl) return;
  saveToLibrary();
  showToast('Saved to Library ✓');
  switchTab('library');
});

const panelCreate = document.getElementById('app-body');
const panelExplore = document.getElementById('panel-explore');
const panelLibrary = document.getElementById('panel-library');
const actionBar = document.querySelector('.action-bar');

const PANELS = {
  create: panelCreate,
  explore: panelExplore,
  library: panelLibrary,
};

function switchTab(tabId) {
  document.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelector(`.sidebar-tab[data-tab="${tabId}"]`).classList.add('active');

  Object.values(PANELS).forEach(panel => panel.classList.remove('active'));
  PANELS[tabId].classList.add('active');

  if (tabId === 'create') {
    actionBar.classList.remove('tab-hidden');
  } else {
    actionBar.classList.add('tab-hidden');
    actionBar.querySelector('.status-text').textContent =
      tabId === 'library' ? 'Library 展厅' : 'Explore examples';
    actionBar.querySelector('.status-dot').className = 'status-dot';
  }
}

document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('.filter-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    tag
      .closest('.filter-strip')
      .querySelectorAll('.filter-tag')
      .forEach(button => button.classList.remove('active'));
    tag.classList.add('active');

    const category = tag.textContent.trim();
    document.querySelectorAll('#explore-grid .model-card').forEach(card => {
      card.style.display = category === 'All' || card.dataset.cat === category ? '' : 'none';
    });
  });
});

async function loadFromUrl(url, name) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const extension = blob.type.includes('png') ? 'png' : 'jpg';
    const file = new File([blob], `${name.replace(/\s+/g, '_')}.${extension}`, {
      type: blob.type,
    });
    loadFile(file);
  } catch {
    showToast('Could not load image — check your connection.');
  }
}

document.getElementById('tb-orbit').addEventListener('click', function toggleOrbit() {
  const isRotating = meshViewer.hasAttribute('auto-rotate');
  if (isRotating) meshViewer.removeAttribute('auto-rotate');
  else meshViewer.setAttribute('auto-rotate', '');
  this.classList.toggle('active', !isRotating);
});

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function loadGLBIntoViewer(url) {
  meshViewer.src = url;
  meshViewer.setAttribute('auto-rotate', '');
}

const EXPLORE_ITEMS = [
  { name: 'Urban Block', cat: 'Architecture', url: sc1Url },
  { name: 'River Infra', cat: 'Architecture', url: sc2Url },
  { name: 'Orbital View', cat: 'Nature', url: sc3Url },
  { name: 'Farm Scene', cat: 'Nature', url: sc4Url },
  { name: 'Forest Survey', cat: 'Nature', url: sc5Url },
  { name: 'Historic Site', cat: 'Objects', url: sc6Url },
];

(function buildExplore() {
  const grid = document.getElementById('explore-grid');
  grid.closest('.tab-inner').querySelector('.tab-section-count').textContent =
    `${EXPLORE_ITEMS.length} images`;

  EXPLORE_ITEMS.forEach(item => {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.dataset.cat = item.cat;
    card.innerHTML = `
      <div class="model-card-thumb">
        <img class="explore-thumb" src="${item.url}" alt="${item.name}" loading="lazy">
        <div class="explore-use-btn">Use in Create →</div>
      </div>
      <div class="model-card-info">
        <div class="model-card-name">${item.name}</div>
        <div class="model-card-meta">${item.cat}</div>
      </div>`;

    card.addEventListener('click', () => {
      loadFromUrl(item.url, item.name);
      switchTab('create');
    });

    grid.appendChild(card);
  });
})();

let libraryItems = [];

function refreshLibrary() {
  const content = document.getElementById('lib-content');
  document.getElementById('lib-count').textContent = `${libraryItems.length} models`;

  if (libraryItems.length === 0) {
    content.innerHTML = `
      <div class="lib-empty">
        <div class="lib-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
            <path d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25A2.25 2.25 0 0 0 4.5 16.5h15a2.25 2.25 0 0 0 2.25-2.25V8.25A2.25 2.25 0 0 0 19.5 6h-5.379a1.5 1.5 0 0 1-1.06-.44Z"/>
          </svg>
        </div>
        <div class="lib-empty-title">Library is empty</div>
        <div class="lib-empty-desc">Generate and export a model — it will appear here automatically.</div>
      </div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'card-grid';

  libraryItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.innerHTML = `
      <div class="model-card-thumb">
        ${item.imgUrl
          ? `<img class="explore-thumb" src="${item.imgUrl}" alt="${item.name}">`
          : '<div class="model-card-thumb-bg"></div><div class="mesh-thumb"></div>'}
      </div>
      <div class="model-card-info">
        <div class="model-card-name">${item.name}</div>
        <div class="model-card-meta">${item.meta}</div>
      </div>`;

    card.addEventListener('click', () => {
      lastGlbUrl = item.glbUrl;
      setState(STATE.GENERATED);
      loadGLBIntoViewer(item.glbUrl);
      switchTab('create');
    });

    grid.appendChild(card);
  });

  content.innerHTML = '';
  content.appendChild(grid);
}

syncSettingsLabels();
applyModelHud(lastModelChoice, lastRunSettings);
refreshLibrary();
setState(STATE.IDLE);
