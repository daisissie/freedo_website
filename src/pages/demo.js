/* ═══════════════════════════════════════════════════════════════
   ZHENGRONG API  ─  http://36.170.54.6:24681
   POST /generate_3d  (multipart)  → { job_id }          (async)
   POST /job_status   (JSON)       → { status, images?, state? }
   POST /extract_glb  (JSON state) → GLB binary
   ═══════════════════════════════════════════════════════════════ */
// On HTTPS (deployed), route through the EdgeOne proxy to avoid mixed-content block.
// On HTTP (local dev), call the backend directly.
const ZHENGRONG_BASE = location.protocol === 'https:'
  ? '/api/zhengrong'
  : 'http://36.170.54.6:24681';

/* ── Step 1: submit job, then poll until done ──────────────── */
async function generate3d(file, onProgress) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const submitResp = await fetch(`${ZHENGRONG_BASE}/generate_3d`, { method: 'POST', body: fd });
    if (!submitResp.ok) {
        const msg = await submitResp.text().catch(() => '');
        throw new Error(`/generate_3d failed (${submitResp.status})${msg ? ': ' + msg : ''}`);
    }
    const first = await submitResp.json();

    // Old sync server: returns { state, images } directly
    if (first.state) {
        if (!first.state) throw new Error('Server response missing "state" — cannot export GLB.');
        return first;
    }

    // New async server: returns { job_id }, poll /job_status
    const { job_id } = first;
    if (!job_id) throw new Error('Server returned neither state nor job_id.');

    for (;;) {
        await new Promise(r => setTimeout(r, 3000));
        const pollResp = await fetch(`${ZHENGRONG_BASE}/job_status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id }),
        });
        if (!pollResp.ok) {
            const msg = await pollResp.text().catch(() => '');
            throw new Error(`/job_status failed (${pollResp.status})${msg ? ': ' + msg : ''}`);
        }
        const data = await pollResp.json();
        if (data.status === 'done') {
            if (!data.state) throw new Error('Server response missing "state" — cannot export GLB.');
            return data; // { images, state }
        }
        if (data.status === 'error') {
            throw new Error(data.error || 'Generation failed on server.');
        }
        // 'pending' or 'running' — keep polling
        if (onProgress) onProgress(data.status);
    }
}

/* ── Step 2: convert state → GLB blob URL (async job) ─────── */
async function extractGlbBlob(modelState) {
    // Submit extraction job
    const submitResp = await fetch(`${ZHENGRONG_BASE}/extract_glb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelState)
    });
    if (!submitResp.ok) {
        const msg = await submitResp.text().catch(() => '');
        throw new Error(`/extract_glb failed (${submitResp.status})${msg ? ': ' + msg : ''}`);
    }
    const { glb_job_id } = await submitResp.json();
    if (!glb_job_id) throw new Error('Server did not return glb_job_id');

    // Poll until done
    for (;;) {
        await new Promise(r => setTimeout(r, 4000));
        const pollResp = await fetch(`${ZHENGRONG_BASE}/glb_status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ glb_job_id }),
        });
        if (!pollResp.ok) {
            const msg = await pollResp.text().catch(() => '');
            throw new Error(`/glb_status failed (${pollResp.status})${msg ? ': ' + msg : ''}`);
        }
        const data = await pollResp.json();
        if (data.status === 'done') break;
        if (data.status === 'error') throw new Error(data.error || 'GLB extraction failed on server.');
        // 'pending' or 'running' — keep polling
    }

    // Download finished GLB
    const downloadUrl = location.protocol === 'https:'
        ? `/api/zhengrong/download_glb?id=${encodeURIComponent(glb_job_id)}`
        : `${ZHENGRONG_BASE}/download_glb/${encodeURIComponent(glb_job_id)}`;
    const dlResp = await fetch(downloadUrl);
    if (!dlResp.ok) throw new Error(`/download_glb failed (${dlResp.status})`);
    const blob = await dlResp.blob();
    return URL.createObjectURL(blob);
}

/* ═══════════════════════════════════════════════════════════════
   FAL.AI / TRELLIS.2 API
   ═══════════════════════════════════════════════════════════════ */
const DEFAULT_FAL_API_BASE = '/api/fal';

function resolveFalApiBase() {
    const metaValue = document.querySelector('meta[name="fal-api-base"]')?.getAttribute('content');
    const globalValue = window.__FAL_API_BASE__ || window.FAL_API_BASE || '';
    const raw = (metaValue || globalValue || DEFAULT_FAL_API_BASE).trim();
    return raw.replace(/\/+$/, '') || DEFAULT_FAL_API_BASE;
}
const FAL_API_BASE = resolveFalApiBase();

async function apiRequest(path, options = {}) {
    const config = { ...options };
    const headers = { ...(config.headers || {}) };
    if (config.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    config.headers = headers;
    const res = await fetch(path, config);
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await res.json().catch(() => null) : null;
    if (!res.ok) {
        let message = payload?.error;
        if (!message && res.status === 404 && window.location.hostname === 'localhost') {
            message = 'API routes unavailable — use EdgeOne runtime with FAL_KEY, or set <meta name="fal-api-base">.';
        }
        throw new Error(message || 'Request failed (' + res.status + ')');
    }
    return payload;
}

async function uploadToFal(file) {
    const init = await apiRequest(FAL_API_BASE + '/upload-initiate', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, contentType: file.type })
    });
    const putRes = await fetch(init.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!putRes.ok) throw new Error('File upload failed (' + putRes.status + ')');
    return init.fileUrl;
}

async function submitTrellis(imageUrl) {
    const texIdx = Math.round(document.getElementById('sl-tex').value / 100 * 2);
    const texSize = [1024, 2048, 4096][texIdx];
    const decTarget = Math.round((document.getElementById('sl-simplify').value / 100) * 1995000 + 5000);
    const sparseStr = +(document.getElementById('sl-sparse').value / 5).toFixed(1);
    const resolution = +document.querySelector('#resolution-seg .seg-btn.active').dataset.value;
    const seed = +document.getElementById('seed-input').value || undefined;
    const job = await apiRequest(FAL_API_BASE + '/submit', {
        method: 'POST',
        body: JSON.stringify({ imageUrl, resolution, seed, decimationTarget: decTarget, textureSize: texSize, ssGuidanceStrength: sparseStr, remesh: true })
    });
    return job.requestId;
}

async function pollTrellis(requestId) {
    for (;;) {
        await new Promise(r => setTimeout(r, 2500));
        const data = await apiRequest(FAL_API_BASE + '/status/' + encodeURIComponent(requestId));
        if (data.queuePosition != null) genSubstep.textContent = 'Queue position: ' + data.queuePosition + '…';
        if (data.status === 'COMPLETED') {
            const result = await apiRequest(FAL_API_BASE + '/result/' + encodeURIComponent(requestId));
            return result.glbUrl;
        }
        if (data.status === 'FAILED') throw new Error(data.error || 'Generation failed');
    }
}

/* ═══════════════════════════════════════════════════════════════
   STATE MACHINE
   States: idle | file-selected | generating | generated | exporting
   ═══════════════════════════════════════════════════════════════ */
const STATE = { IDLE:'idle', FILE:'file', GENERATING:'generating', GENERATED:'generated', EXPORTING:'exporting' };
let state = STATE.IDLE;
let selectedFile = null;
let genTimer = null;

let lastGlbUrl = null;       // GLB URL (blob for Zhengrong, fal.ai CDN URL for TRELLIS.2)
let lastModelState = null;   // Zhengrong: opaque state from /generate_3d
let lastModelChoice = null;  // 'zhengrong' | 'trellis' — set at generate time

// DOM
const dropzone      = document.getElementById('dropzone');
const fileInput     = document.getElementById('file-input');
const dzPreview     = document.getElementById('dz-preview');
const previewImg    = document.getElementById('preview-img');
const previewFname  = document.getElementById('preview-filename');
const dzRemove      = document.getElementById('dz-remove');
const btnGenerate    = document.getElementById('btn-generate');
const btnExtract     = document.getElementById('btn-extract');
const btnSaveLibrary = document.getElementById('btn-save-library');
const statusDot     = document.getElementById('status-dot');
const statusText    = document.getElementById('status-text');
const stEmpty       = document.getElementById('state-empty');
const stGenerating  = document.getElementById('state-generating');
const stGenerated   = document.getElementById('state-generated');
const genBar        = document.getElementById('gen-bar');
const genPct        = document.getElementById('gen-pct');
const genSubstep    = document.getElementById('gen-substep');
const step1         = document.getElementById('step-1');
const step2         = document.getElementById('step-2');
const toolbar       = document.getElementById('preview-toolbar');
const meshViewer    = document.getElementById('mesh-viewer');
const toast         = document.getElementById('toast');

/* ── Controls ──────────────────────────────────────────────── */

// Segmented controls
document.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            seg.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
});

// Sliders
document.getElementById('sl-fg').addEventListener('input', e => {
    document.getElementById('val-fg').textContent = (e.target.value / 100).toFixed(2);
});
document.getElementById('sl-simplify').addEventListener('input', e => {
    document.getElementById('val-simplify').textContent = (e.target.value / 100).toFixed(2);
});
document.getElementById('sl-tex').addEventListener('input', e => {
    const ratio = (e.target.value / 100).toFixed(2);
    document.getElementById('val-tex').textContent = ratio;
    document.getElementById('hud-tex').textContent = ratio;
});
document.getElementById('sl-sparse').addEventListener('input', e => {
    document.getElementById('val-sparse').textContent = e.target.value;
});

// Seed randomizer
document.getElementById('btn-random-seed').addEventListener('click', () => {
    document.getElementById('seed-input').value = Math.floor(Math.random() * 2147483647);
});

/* ── File upload ───────────────────────────────────────────── */
dropzone.addEventListener('click', e => {
    if (e.target.closest('.dz-remove')) return;
    fileInput.click();
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

dzRemove.addEventListener('click', e => { e.stopPropagation(); clearFile(); });

function loadFile(file) {
    if (!file.type.match(/image\/(png|jpeg|webp)/)) { showToast('Unsupported format — use PNG, JPG or WEBP.'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('File too large — max 10 MB.'); return; }
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

/* ── setState ──────────────────────────────────────────────── */
function setState(s) {
    state = s;

    // Reset UI atoms
    btnGenerate.disabled = false;
    btnGenerate.classList.remove('loading');
    btnExtract.disabled = true;
    btnExtract.classList.remove('loading');
    btnSaveLibrary.disabled = true;
    statusDot.className = 'status-dot';
    toolbar.classList.remove('visible');

    // Hide all panels
    stEmpty.classList.remove('visible');
    stGenerating.classList.remove('visible');
    stGenerated.classList.remove('visible');

    // Steps
    step1.className = 'step';
    step2.className = 'step';

    switch (s) {
        case STATE.IDLE:
            stEmpty.classList.add('visible');
            statusText.textContent = 'No image selected';
            btnGenerate.disabled = true;
            step1.classList.add('active');
            break;

        case STATE.FILE:
            stEmpty.classList.add('visible');
            statusDot.classList.add('ready');
            statusText.textContent = 'Ready · ' + (selectedFile ? trimName(selectedFile.name) : '');
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

function trimName(n) { return n.length > 28 ? n.slice(0, 26) + '…' : n; }

/* ── Generate simulation ───────────────────────────────────── */
const GEN_STEPS = [
    'Preprocessing image…',
    'Running sparse structure…',
    'Building dense point cloud…',
    'Constructing mesh topology…',
    'Projecting textures…',
    'Finalizing geometry…',
];


btnGenerate.addEventListener('click', async () => {
    if (state !== STATE.FILE && state !== STATE.GENERATED) return;
    lastGlbUrl = null;
    lastModelState = null;
    lastModelChoice = document.querySelector('#model-seg .seg-btn.active').dataset.value;
    setState(STATE.GENERATING);
    genBar.style.width = '5%'; genPct.textContent = '5%';

    try {
        if (lastModelChoice === 'zhengrong') {
            // ── Zhengrong local model ────────────────────────────
            genSubstep.textContent = 'Uploading image to 峥嵘…';
            let fakeProgress = 5;
            const progressTimer = setInterval(() => {
                if (fakeProgress < 88) { fakeProgress += Math.random() * 1.5 + 0.5; }
                genBar.style.width = fakeProgress.toFixed(1) + '%';
                genPct.textContent = Math.round(fakeProgress) + '%';
            }, 1200);

            const genData = await generate3d(selectedFile, (status) => {
                genSubstep.textContent = status === 'running' ? '峥嵘模型生成中…' : '排队等待中…';
            });
            clearInterval(progressTimer);
            lastModelState = genData.state;

            genBar.style.width = '95%'; genPct.textContent = '95%';
            genSubstep.textContent = '导出 GLB… (需要 1-3 分钟，请耐心等待)';
            genBar.style.transition = 'none';
            genBar.classList.add('pulsing');

            const glbUrl = await extractGlbBlob(genData.state);
            genBar.classList.remove('pulsing');
            lastGlbUrl = glbUrl;

            genBar.style.width = '100%'; genPct.textContent = '100%';
            genSubstep.textContent = 'Complete ✓';
            await new Promise(r => setTimeout(r, 380));

            setState(STATE.GENERATED);
            loadGLBIntoViewer(glbUrl);

        } else {
            // ── fal.ai TRELLIS.2 ────────────────────────────────
            genSubstep.textContent = 'Uploading image…';
            const imageUrl = await uploadToFal(selectedFile);
            genBar.style.width = '20%'; genPct.textContent = '20%';
            genSubstep.textContent = 'Submitting to TRELLIS.2…';

            const requestId = await submitTrellis(imageUrl);
            genBar.style.width = '30%'; genPct.textContent = '30%';
            genSubstep.textContent = 'Generating 3D mesh…';

            let fakeProgress = 30;
            const progressTimer = setInterval(() => {
                if (fakeProgress < 88) { fakeProgress += Math.random() * 1.2 + 0.3; }
                genBar.style.width = fakeProgress.toFixed(1) + '%';
                genPct.textContent = Math.round(fakeProgress) + '%';
            }, 1200);

            const glbUrl = await pollTrellis(requestId);
            clearInterval(progressTimer);
            lastGlbUrl = glbUrl;

            genBar.style.width = '100%'; genPct.textContent = '100%';
            genSubstep.textContent = 'Complete ✓';
            await new Promise(r => setTimeout(r, 380));

            setState(STATE.GENERATED);
            loadGLBIntoViewer(glbUrl);
        }

    } catch (err) {
        setState(state === STATE.GENERATING ? STATE.FILE : state);
        showToast('Error: ' + err.message);
    }
});

function randomizeStats() {
    const v = (18 + Math.random() * 40).toFixed(1);
    document.getElementById('hud-verts').textContent = v + 'K';
    document.getElementById('hud-faces').textContent = (v * 2).toFixed(1) + 'K';
    const mb = (1.2 + Math.random() * 3).toFixed(1);
    document.getElementById('hud-size').textContent = mb + ' MB';
}

/* ── Export GLB ─────────────────────────────────────────────── */
btnExtract.addEventListener('click', async () => {
    if (state !== STATE.GENERATED) return;
    setState(STATE.EXPORTING);

    try {
        let glbUrl;

        if (lastModelChoice === 'zhengrong') {
            // GLB already extracted during generate — just download it
            if (!lastGlbUrl) throw new Error('No GLB — please generate first.');
            glbUrl = lastGlbUrl;

        } else {
            // TRELLIS.2: GLB URL already available from generate step
            if (!lastGlbUrl) throw new Error('No GLB URL — please generate first.');
            glbUrl = lastGlbUrl;
        }

        // Download
        const a = document.createElement('a');
        a.href = glbUrl;
        a.download = 'mesh_' + Date.now() + '.glb';
        document.body.appendChild(a);
        a.click();
        a.remove();

        setState(STATE.GENERATED);
        showToast('GLB downloaded ↓');
        saveToLibrary();

    } catch (err) {
        setState(STATE.GENERATED);
        showToast('Export failed: ' + err.message);
    }
});

/* ── Save to Library ───────────────────────────────────────── */
function saveToLibrary() {
    if (!lastGlbUrl) return;
    const verts = document.getElementById('hud-verts').textContent;
    const ts = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const imgUrl = previewImg.src || '';
    libraryItems.unshift({ name: 'Mesh_' + ts, meta: verts + ' · GLB', glbUrl: lastGlbUrl, imgUrl });
    refreshLibrary();
}

btnSaveLibrary.addEventListener('click', () => {
    if (state !== STATE.GENERATED || !lastGlbUrl) return;
    saveToLibrary();
    showToast('Saved to Library ✓');
    switchTab('library');
});

/* ── Tab nav ───────────────────────────────────────────────── */
const panelCreate  = document.getElementById('app-body');
const panelExplore = document.getElementById('panel-explore');
const panelLibrary = document.getElementById('panel-library');
const actionBar    = document.querySelector('.action-bar');

const PANELS = { create: panelCreate, explore: panelExplore, library: panelLibrary };

function switchTab(tabId) {
    document.querySelectorAll('.sidebar-tab').forEach(x => x.classList.remove('active'));
    document.querySelector(`.sidebar-tab[data-tab="${tabId}"]`).classList.add('active');

    Object.values(PANELS).forEach(p => p.classList.remove('active'));
    PANELS[tabId].classList.add('active');

    // Show/hide action bar buttons on non-create tabs
    if (tabId === 'create') {
        actionBar.classList.remove('tab-hidden');
    } else {
        actionBar.classList.add('tab-hidden');
        actionBar.querySelector('.status-text').textContent =
            tabId === 'library' ? 'Library 展厅' : 'Explore examples';
        actionBar.querySelector('.status-dot').className = 'status-dot';
    }
}

document.querySelectorAll('.sidebar-tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
});

// Filter tags (Explore)
document.querySelectorAll('.filter-tag').forEach(tag => {
    tag.addEventListener('click', () => {
        tag.closest('.filter-strip').querySelectorAll('.filter-tag').forEach(x => x.classList.remove('active'));
        tag.classList.add('active');
        const cat = tag.textContent.trim();
        document.querySelectorAll('#explore-grid .model-card').forEach(card => {
            card.style.display = (cat === 'All' || card.dataset.cat === cat) ? '' : 'none';
        });
    });
});

// Load example image from URL into Create tab
async function loadFromUrl(url, name) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const ext = blob.type.includes('png') ? 'png' : 'jpg';
        const file = new File([blob], name.replace(/\s+/g, '_') + '.' + ext, { type: blob.type });
        loadFile(file);
    } catch {
        showToast('Could not load image — check your connection.');
    }
}

/* ── Toolbar ───────────────────────────────────────────────── */
document.getElementById('tb-wireframe').addEventListener('click', function() {
    // model-viewer does not support wireframe; toggle button visually only
    this.classList.toggle('active');
});

document.getElementById('tb-orbit').addEventListener('click', function() {
    const rotating = meshViewer.hasAttribute('auto-rotate');
    if (rotating) meshViewer.removeAttribute('auto-rotate');
    else meshViewer.setAttribute('auto-rotate', '');
    this.classList.toggle('active', !rotating);
});

/* ── Toast ─────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ── model-viewer GLB renderer ───────────────────────────── */
function loadGLBIntoViewer(url) {
    meshViewer.src = url;
    meshViewer.setAttribute('auto-rotate', '');
}


/* ── Populate Explore grid ─────────────────────────────────── */
const EXPLORE_ITEMS = [
    { name: 'Garden Chair',     cat: 'Objects',      url: 'https://picsum.photos/seed/chair01/400/400'    },
    { name: 'Ceramic Vase',     cat: 'Objects',      url: 'https://picsum.photos/seed/vase02/400/400'     },
    { name: 'Stone Arch',       cat: 'Architecture', url: 'https://picsum.photos/seed/arch03/400/400'     },
    { name: 'Wooden Bench',     cat: 'Objects',      url: 'https://picsum.photos/seed/bench04/400/400'    },
    { name: 'Bronze Figurine',  cat: 'Characters',   url: 'https://picsum.photos/seed/figure05/400/400'   },
    { name: 'Glass Bottle',     cat: 'Objects',      url: 'https://picsum.photos/seed/bottle06/400/400'   },
    { name: 'Terracotta Pot',   cat: 'Objects',      url: 'https://picsum.photos/seed/pot07/400/400'      },
    { name: 'Iron Lantern',     cat: 'Objects',      url: 'https://picsum.photos/seed/lantern08/400/400'  },
    { name: 'Mountain Rock',    cat: 'Nature',       url: 'https://picsum.photos/seed/rock09/400/400'     },
    { name: 'Wicker Basket',    cat: 'Objects',      url: 'https://picsum.photos/seed/basket10/400/400'   },
    { name: 'Marble Column',    cat: 'Architecture', url: 'https://picsum.photos/seed/column11/400/400'   },
    { name: 'Wooden Stool',     cat: 'Objects',      url: 'https://picsum.photos/seed/stool12/400/400'    },
    { name: 'Old Car',          cat: 'Vehicles',     url: 'https://picsum.photos/seed/car13/400/400'      },
    { name: 'Autumn Tree',      cat: 'Nature',       url: 'https://picsum.photos/seed/tree14/400/400'     },
    { name: 'Stone Bridge',     cat: 'Architecture', url: 'https://picsum.photos/seed/bridge15/400/400'   },
    { name: 'Motorbike',        cat: 'Vehicles',     url: 'https://picsum.photos/seed/moto16/400/400'     },
];

(function buildExplore() {
    const grid = document.getElementById('explore-grid');
    document.getElementById('explore-grid').closest('.tab-inner')
        .querySelector('.tab-section-count').textContent = EXPLORE_ITEMS.length + ' images';

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

/* ── Populate Library ──────────────────────────────────────── */
let libraryItems = [];

function refreshLibrary() {
    const content = document.getElementById('lib-content');
    document.getElementById('lib-count').textContent = libraryItems.length + ' models';
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
    } else {
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
}

refreshLibrary();

// Init
setState(STATE.IDLE);
