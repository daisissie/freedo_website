const DEFAULT_FAL_API_BASE = '/api/fal';
const FAL_API_BASE = resolveFalApiBase();

function resolveFalApiBase() {
    const metaValue = document.querySelector('meta[name="fal-api-base"]')?.getAttribute('content');
    const globalValue = window.__FAL_API_BASE__ || window.FAL_API_BASE || '';
    const raw = (metaValue || globalValue || DEFAULT_FAL_API_BASE).trim();
    const normalized = raw.replace(/\/+$/, '');
    return normalized || DEFAULT_FAL_API_BASE;
}

async function apiRequest(path, options = {}) {
    const config = { ...options };
    const headers = { ...(config.headers || {}) };

    if (config.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    config.headers = headers;

    const res = await fetch(path, config);
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await res.json().catch(() => null) : null;

    if (!res.ok) {
        let message = payload?.error;

        if (!message && res.status === 404 && window.location.hostname === 'localhost') {
            message = 'API routes are unavailable in plain Vite dev. Use EdgeOne runtime with FAL_KEY, or set <meta name="fal-api-base"> to a deployed API.';
        }

        throw new Error(message || 'Request failed (' + res.status + ')');
    }

    return payload;
}

/* ═══════════════════════════════════════════════════════════════
   STATE MACHINE
   States: idle | file-selected | generating | generated | exporting
   ═══════════════════════════════════════════════════════════════ */
const STATE = { IDLE:'idle', FILE:'file', GENERATING:'generating', GENERATED:'generated', EXPORTING:'exporting' };
let state = STATE.IDLE;
let selectedFile = null;
let genTimer = null;
let meshAngle = 0;
let meshRaf = null;
let wireframe = false;

/* ── FAL.AI CONFIG ─────────────────────────────────────────── */
let lastGlbUrl = null;

/* ── fal.ai: upload image to get a public URL ──────────────── */
async function uploadToFal(file) {
    const init = await apiRequest(FAL_API_BASE + '/upload-initiate', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, contentType: file.type })
    });

    const putRes = await fetch(init.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!putRes.ok) throw new Error('File upload failed (' + putRes.status + ')');
    return init.fileUrl;
}

/* ── fal.ai: submit TRELLIS.2 job to queue ─────────────────── */
async function submitTrellis(imageUrl) {
    const texIdx = Math.round(document.getElementById('sl-tex').value / 100 * 2);
    const texSize = [1024, 2048, 4096][texIdx];
    const decTarget = Math.round((document.getElementById('sl-simplify').value / 100) * 1995000 + 5000);
    const sparseStr = +(document.getElementById('sl-sparse').value / 5).toFixed(1); // 0–50 → 0–10
    const resolution = +document.querySelector('#resolution-seg .seg-btn.active').dataset.value;
    const seed = +document.getElementById('seed-input').value || undefined;

    const job = await apiRequest(FAL_API_BASE + '/submit', {
        method: 'POST',
        body: JSON.stringify({
            imageUrl,
            resolution,
            seed,
            decimationTarget: decTarget,
            textureSize: texSize,
            ssGuidanceStrength: sparseStr,
            remesh: true
        })
    });

    return job.requestId;
}

/* ── fal.ai: poll until done, return GLB url ───────────────── */
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

// DOM
const dropzone      = document.getElementById('dropzone');
const fileInput     = document.getElementById('file-input');
const dzPreview     = document.getElementById('dz-preview');
const previewImg    = document.getElementById('preview-img');
const previewFname  = document.getElementById('preview-filename');
const dzRemove      = document.getElementById('dz-remove');
const btnGenerate   = document.getElementById('btn-generate');
const btnExtract    = document.getElementById('btn-extract');
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
const meshCanvas    = document.getElementById('mesh-canvas');
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
    disposeThree();
    setState(STATE.GENERATING);
    genBar.style.width = '5%'; genPct.textContent = '5%';
    genSubstep.textContent = 'Uploading image…';

    try {
        const imageUrl = await uploadToFal(selectedFile);
        genBar.style.width = '20%'; genPct.textContent = '20%';
        genSubstep.textContent = 'Submitting to TRELLIS.2…';

        const requestId = await submitTrellis(imageUrl);
        genBar.style.width = '30%'; genPct.textContent = '30%';
        genSubstep.textContent = 'Generating 3D mesh…';

        // Animate progress bar while waiting for the model
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
        loadGLBIntoCanvas(glbUrl);

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

/* ── Export: download real GLB ─────────────────────────────── */
btnExtract.addEventListener('click', async () => {
    if (state !== STATE.GENERATED || !lastGlbUrl) return;
    setState(STATE.EXPORTING);
    try {
        const res = await fetch(lastGlbUrl);
        if (!res.ok) throw new Error('Download failed (' + res.status + ')');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'mesh_' + Date.now() + '.glb';
        a.click();
        URL.revokeObjectURL(a.href);

        setState(STATE.GENERATED);
        showToast('GLB downloaded ↓');
        const verts = document.getElementById('hud-verts').textContent;
        const ts = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        libraryItems.unshift({ name: 'Mesh_' + ts, meta: verts + ' · GLB', glbUrl: lastGlbUrl });
        refreshLibrary();
    } catch (err) {
        setState(STATE.GENERATED);
        showToast('Export failed: ' + err.message);
    }
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
    wireframe = !wireframe;
    this.classList.toggle('active', wireframe);
    document.getElementById('tb-orbit').classList.toggle('active', !wireframe);
    if (threeCtx) {
        threeCtx.scene.traverse(c => { if (c.isMesh) c.material.wireframe = wireframe; });
    }
});

document.getElementById('tb-orbit').addEventListener('click', function() {
    if (threeCtx) {
        threeCtx.controls.autoRotate = !threeCtx.controls.autoRotate;
        this.classList.toggle('active', threeCtx.controls.autoRotate);
    }
});

/* ── Toast ─────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ── Three.js GLB renderer ───────────────────────────────── */
let threeCtx = null; // { renderer, scene, camera, controls, animId, ro }

function disposeThree() {
    if (!threeCtx) return;
    cancelAnimationFrame(threeCtx.animId);
    threeCtx.ro.disconnect();
    threeCtx.renderer.dispose();
    threeCtx = null;
}

function loadGLBIntoCanvas(url) {
    disposeThree();
    const canvas = meshCanvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9ab8ff, 0.5);
    fill.position.set(-4, -2, -3);
    scene.add(fill);

    const parent = stGenerated;
    const camera = new THREE.PerspectiveCamera(40, parent.clientWidth / parent.clientHeight, 0.001, 500);
    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;

    new THREE.GLTFLoader().load(url, gltf => {
        // Centre and fit model
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const centre = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3()).length();
        gltf.scene.position.sub(centre);
        camera.position.set(0, size * 0.25, size * 1.6);
        controls.target.set(0, 0, 0);
        scene.add(gltf.scene);

        // Update HUD with real counts
        let verts = 0, tris = 0;
        gltf.scene.traverse(c => {
            if (c.isMesh) {
                verts += c.geometry.attributes.position.count;
                tris  += c.geometry.index ? c.geometry.index.count / 3
                                          : c.geometry.attributes.position.count / 3;
            }
        });
        document.getElementById('hud-verts').textContent = (verts / 1000).toFixed(1) + 'K';
        document.getElementById('hud-faces').textContent = (tris  / 1000).toFixed(1) + 'K';
        statusText.textContent = 'Mesh ready · ' + (verts / 1000).toFixed(1) + 'K verts';
    }, undefined, err => showToast('GLB load error: ' + err.message));

    function resize() {
        const w = parent.clientWidth, h = parent.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    resize();

    function animate() {
        threeCtx.animId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    threeCtx = { renderer, scene, camera, controls, animId: null, ro };
    animate();
}

/* ── Legacy canvas stub (kept for STATE compatibility) ───── */
function stopMeshCanvas() {
    if (meshRaf) { cancelAnimationFrame(meshRaf); meshRaf = null; }
}

function startMeshCanvas() {
    stopMeshCanvas();
    const canvas = meshCanvas;
    const ctx = canvas.getContext('2d');
    meshAngle = 0;

    function resize() {
        const rect = stGenerated.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width  = rect.width  * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(stGenerated);
    resize();

    function frame() {
        const w = canvas.width  / (window.devicePixelRatio || 1);
        const h = canvas.height / (window.devicePixelRatio || 1);
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const R  = Math.min(w, h) * 0.30;

        meshAngle += 0.006;

        // Outer glow
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.8);
        grd.addColorStop(0, 'rgba(59,126,255,0.05)');
        grd.addColorStop(1, 'rgba(59,126,255,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);

        const TILT = 0.42;

        // Latitude rings
        const LAT = 10;
        for (let i = 0; i <= LAT; i++) {
            const lat = (i / LAT) * Math.PI - Math.PI / 2;
            const r   = Math.cos(lat) * R;
            const y3  = Math.sin(lat) * R;
            if (r < 1) continue;
            const projY = cy + y3 * Math.cos(TILT);
            const alpha = wireframe ? 0.22 : (0.07 + 0.12 * Math.abs(Math.cos(lat)));
            ctx.beginPath();
            ctx.ellipse(cx, projY, r, r * 0.38, meshAngle * 0.18, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(59,126,255,${alpha})`;
            ctx.lineWidth = wireframe ? 0.6 : 0.55;
            ctx.stroke();
        }

        // Longitude lines
        const LON = 18;
        for (let i = 0; i < LON; i++) {
            const lon = (i / LON) * Math.PI * 2 + meshAngle;
            const pts = [];
            for (let j = 0; j <= 56; j++) {
                const lat = (j / 56) * Math.PI - Math.PI / 2;
                const x3  = Math.cos(lat) * Math.cos(lon) * R;
                const y3  = Math.sin(lat) * R;
                const z3  = Math.cos(lat) * Math.sin(lon) * R;
                const py  = cy + (y3 * Math.cos(TILT) - z3 * Math.sin(TILT));
                pts.push([cx + x3, py, z3]);
            }
            const front = Math.cos(lon + meshAngle * 0) > -0.15;
            const alpha = wireframe ? (front ? 0.28 : 0.08) : (front ? 0.18 : 0.04);
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
            ctx.strokeStyle = `rgba(59,126,255,${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
        }

        // Equator accent
        if (!wireframe) {
            ctx.beginPath();
            ctx.ellipse(cx, cy, R, R * 0.38, meshAngle * 0.18, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(59,126,255,0.4)';
            ctx.lineWidth = 0.9;
            ctx.stroke();
        }

        // Vertex dots
        const DOT_N = 28;
        for (let i = 0; i < DOT_N; i++) {
            const lon2 = (i / DOT_N) * Math.PI * 2 + meshAngle;
            const lat2 = Math.sin(i * 1.9 + 0.4) * 1.1;
            const x3   = Math.cos(lat2) * Math.cos(lon2) * R;
            const y3   = Math.sin(lat2) * R;
            const z3   = Math.cos(lat2) * Math.sin(lon2) * R;
            const py   = cy + (y3 * Math.cos(TILT) - z3 * Math.sin(TILT));
            if (z3 < -R * 0.05) continue;
            const intensity = (z3 / R + 1) / 2;
            const a = wireframe ? 0.8 : (0.35 + 0.65 * intensity);
            ctx.beginPath();
            ctx.arc(cx + x3, py, 1.4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(80,190,255,${a})`;
            ctx.fill();
        }

        meshRaf = requestAnimationFrame(frame);
    }

    frame();
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
                    <div class="model-card-thumb-bg"></div>
                    <div class="mesh-thumb"></div>
                </div>
                <div class="model-card-info">
                    <div class="model-card-name">${item.name}</div>
                    <div class="model-card-meta">${item.meta}</div>
                </div>`;
            grid.appendChild(card);
        });
        content.innerHTML = '';
        content.appendChild(grid);
    }
}

refreshLibrary();

// Init
setState(STATE.IDLE);
