import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const SPHERE_RADIUS = 1;
const MAX_DISPERSE = 0.6;
const CTA_REASSEMBLE_RATIO = 0.96;
const MARKER_RAISE = 0.03;
const MARKER_HIT_RADIUS = 0.07;
const BASE_GLOBE_ROT_Y = -THREE.MathUtils.degToRad(108);
const UP_AXIS = new THREE.Vector3(0, 1, 0);

const CLICKABLE_LOCATIONS = [
  {
    id: 'abu-dhabi',
    label: 'Abu Dhabi',
    lat: 24.4539,
    lon: 54.3773,
    color: 0xff755c,
    demoPort: 3001,
    demoPath: '/',
  },
  {
    id: 'beijing',
    label: 'Beijing',
    lat: 39.9042,
    lon: 116.4074,
    color: 0xff4d6d,
    demoPort: 3002,
    demoPath: '/',
  },
  {
    id: 'shanghai',
    label: 'Shanghai',
    lat: 31.2304,
    lon: 121.4737,
    color: 0xff5f6d,
    demoPort: 3003,
    demoPath: '/',
  },
];

// Natural Earth 110m land polygons – small (~80 KB), accurate outlines
const GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';

function isWebGLAvailable() {
  const canvas = document.createElement('canvas');
  try {
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function getElementExposureRatio(element) {
  if (!element) return 0;
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
  const visible = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
  const height = Math.max(1, rect.height);
  return THREE.MathUtils.clamp(visible / height, 0, 1);
}

function latLonToVector3(latDeg, lonDeg, radius = SPHERE_RADIUS) {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    Math.sin(lon) * cosLat * radius,
    Math.sin(lat) * radius,
    Math.cos(lon) * cosLat * radius
  );
}

function resolveDemoUrl(location) {
  const protocol = window.location.protocol === 'file:' ? 'http:' : (window.location.protocol || 'http:');
  const host = window.location.hostname || 'localhost';
  const path = location.demoPath || '/';
  return `${protocol}//${host}:${location.demoPort}${path}`;
}

function ensureDemoPortal() {
  const existing = document.querySelector('[data-demo-portal]');
  if (existing?.__demoPortalRefs) return existing.__demoPortalRefs;

  const portal = document.createElement('div');
  portal.className = 'demo-portal';
  portal.hidden = true;
  portal.setAttribute('data-demo-portal', '');
  portal.innerHTML = `
    <div class="demo-portal__panel" role="dialog" aria-modal="true" aria-labelledby="demo-portal-title">
      <div class="demo-portal__header">
        <div>
          <p class="demo-portal__eyebrow">Location Demo</p>
          <h2 class="demo-portal__title" id="demo-portal-title">Demo</h2>
          <p class="demo-portal__meta" data-demo-portal-url></p>
        </div>
        <div class="demo-portal__actions">
          <a
            class="demo-portal__link"
            data-demo-portal-link
            href="/"
            target="_blank"
            rel="noreferrer noopener"
          >
            Open In New Tab
          </a>
          <button class="demo-portal__close" type="button" data-demo-portal-close aria-label="Close demo">
            Close
          </button>
        </div>
      </div>
      <div class="demo-portal__frame-wrap">
        <iframe
          class="demo-portal__frame"
          title="Location demo preview"
          src="about:blank"
          loading="lazy"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
    </div>
  `;
  document.body.append(portal);

  const titleEl = portal.querySelector('#demo-portal-title');
  const urlEl = portal.querySelector('[data-demo-portal-url]');
  const frameEl = portal.querySelector('.demo-portal__frame');
  const linkEl = portal.querySelector('[data-demo-portal-link]');

  function closePortal() {
    portal.classList.remove('is-open');
    frameEl.src = 'about:blank';
    window.setTimeout(() => {
      if (!portal.classList.contains('is-open')) portal.hidden = true;
    }, 180);
  }

  function openPortal(location) {
    const demoUrl = resolveDemoUrl(location);
    titleEl.textContent = `${location.label} Demo`;
    urlEl.textContent = demoUrl;
    linkEl.href = demoUrl;
    frameEl.src = demoUrl;
    portal.hidden = false;
    requestAnimationFrame(() => {
      portal.classList.add('is-open');
    });
  }

  portal.addEventListener('click', (event) => {
    if (event.target === portal || event.target.closest('[data-demo-portal-close]')) {
      closePortal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && portal.classList.contains('is-open')) {
      closePortal();
    }
  });

  const refs = { openPortal, closePortal };
  portal.__demoPortalRefs = refs;
  return refs;
}

let markerGlowTexture = null;

function getMarkerGlowTexture() {
  if (markerGlowTexture) return markerGlowTexture;

  const size = 128;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = size;
  glowCanvas.height = size;

  const ctx = glowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.04,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );

  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.56)');
  gradient.addColorStop(0.22, 'rgba(255, 255, 255, 0.24)');
  gradient.addColorStop(0.54, 'rgba(255, 255, 255, 0.06)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  markerGlowTexture = new THREE.CanvasTexture(glowCanvas);
  markerGlowTexture.generateMipmaps = false;
  markerGlowTexture.minFilter = THREE.LinearFilter;
  markerGlowTexture.magFilter = THREE.LinearFilter;

  return markerGlowTexture;
}

// ─── Procedural blob fallback (used only if GeoJSON fetch fails) ──────────────
const CONTINENT_BLOBS = [
  [52, -108, 26, 34, 1.0], [63, -150, 10, 16, 0.78], [32, -90, 16, 20, 0.82],
  [20, -102, 10, 14, 0.7], [70, -45, 10, 12, 0.45],
  [-15, -60, 26, 14, 1.0], [-35, -63, 13, 10, 0.75], [3, -76, 8, 8, 0.62],
  [54, 15, 12, 18, 0.92], [41, 18, 8, 12, 0.7], [60, 30, 9, 16, 0.62],
  [7, 20, 30, 18, 1.0], [-15, 25, 20, 14, 0.85], [12, 44, 8, 9, 0.62],
  [48, 90, 22, 42, 1.0], [56, 120, 18, 28, 0.82], [35, 65, 16, 24, 0.82],
  [23, 78, 12, 9, 0.86], [15, 105, 14, 17, 0.78], [62, 140, 10, 15, 0.6],
  [-25, 133, 12, 17, 0.95], [-41, 173, 5, 4, 0.46],
];
function lonDist(a, b) { const d = Math.abs(a - b); return d > 180 ? 360 - d : d; }
function proceduralLand(latDeg, lonDeg) {
  let w = 0;
  for (const [cl, clo, rl, rlo, iv] of CONTINENT_BLOBS) {
    const ln = (latDeg - cl) / rl, lo = lonDist(lonDeg, clo) / rlo;
    const b = (1 - THREE.MathUtils.smoothstep(Math.sqrt(ln * ln + lo * lo), 0.55, 1.05)) * iv;
    if (b > w) w = b;
  }
  const ant = 1 - THREE.MathUtils.smoothstep(latDeg, -76, -60);
  const landWeight = THREE.MathUtils.clamp(Math.max(w, ant * 0.92), 0, 1);
  const isLand = landWeight > 0.48 ? 1 : 0;
  const coast = 1 - Math.abs(landWeight * 2 - 1);
  return isLand + coast * 0.9999;
}

// ─── Build a precise binary land sampler from GeoJSON ────────────────────────
// Returns a function (latDeg, lonDeg) → 0 | 1
async function buildGeoJsonSampler() {
  const res  = await fetch(GEOJSON_URL);
  if (!res.ok) {
    throw new Error(`GeoJSON fetch failed: ${res.status}`);
  }
  const data = await res.json();

  const W = 2048, H = 1024;
  const offscreen = document.createElement('canvas');
  offscreen.width  = W;
  offscreen.height = H;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });

  // Black background = ocean
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';

  function lonLatToXY(lon, lat) {
    // Equirectangular projection, lon ∈ [-180,180], lat ∈ [-90,90]
    const x = ((lon + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    return [x, y];
  }

  function drawRing(ring) {
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = lonLatToXY(ring[i][0], ring[i][1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawPolygon(coords) {
    ctx.beginPath();
    for (const ring of coords) drawRing(ring);
    ctx.fill('evenodd');
  }

  for (const feature of data.features) {
    const g = feature.geometry;
    if (g.type === 'Polygon')      { drawPolygon(g.coordinates); }
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) drawPolygon(poly);
    }
  }

  // Read back pixel data once
  const pixels = ctx.getImageData(0, 0, W, H).data;

  // Build a blurred "distance-to-coast" layer so coast points glow slightly
  // We do a simple box-blur pass on a small Float32 array for coast weight
  const landBin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) landBin[i] = pixels[i * 4] > 128 ? 1 : 0;

  // Coast weight: fraction of 3×3 neighbourhood that differs from centre
  function coastWeight(px, py) {
    const ctr = landBin[py * W + px];
    let diff = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = Math.min(W - 1, Math.max(0, px + dx));
        const ny = Math.min(H - 1, Math.max(0, py + dy));
        if (landBin[ny * W + nx] !== ctr) diff++;
      }
    }
    return diff / 24; // normalise
  }

  // Pre-bake coast weights into a separate Float32 array
  const coastMap = new Float32Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      coastMap[py * W + px] = coastWeight(px, py);
    }
  }

  return (latDeg, lonDeg) => {
    let u = lonDeg / 360 + 0.5;
    if (u < 0) u += 1; else if (u >= 1) u -= 1;
    const v = THREE.MathUtils.clamp(0.5 - latDeg / 180, 0, 1);
    const px = Math.min(W - 1, Math.max(0, Math.round(u * (W - 1))));
    const py = Math.min(H - 1, Math.max(0, Math.round(v * (H - 1))));
    const isLand  = landBin[py * W + px];
    const coast   = coastMap[py * W + px];
    // Return value: land=1, coast border boost encoded in fractional part
    // We pack: integer part = isLand, fractional = coast
    return isLand + coast * 0.9999;
  };
}

// ─── Point cloud ─────────────────────────────────────────────────────────────
// landWeightFn returns land + coast info as described above
function buildPointCloud(count, landWeightFn = proceduralLand) {
  const positions = new Float32Array(count * 3);
  const phase     = new Float32Array(count);
  const seed      = new Float32Array(count);
  const latitude  = new Float32Array(count);
  const landAttr  = new Float32Array(count);   // 0=ocean, 1=land
  const coastAttr = new Float32Array(count);   // 0..1 coast proximity
  const explodeDir = new Float32Array(count * 3);
  const explodePow = new Float32Array(count);

  let i = 0, attempts = 0;
  const maxA = count * 60;

  while (i < count && attempts < maxA) {
    attempts++;
    const u     = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r     = Math.sqrt(1 - u * u);
    const xp    = r * Math.cos(theta);
    const zp    = r * Math.sin(theta);
    const latDeg = THREE.MathUtils.radToDeg(Math.asin(u));
    const lonDeg = THREE.MathUtils.radToDeg(Math.atan2(xp, zp));

    const raw    = landWeightFn(latDeg, lonDeg);
    const isLand = raw >= 1 ? 1 : 0;
    const coast  = isLand ? (raw - 1) / 0.9999 : raw; // extract coast fraction

    // Keep a stable global silhouette: land/coast dense, ocean still sufficiently present.
    const prob = isLand ? 0.82 : coast > 0.25 ? 0.70 + coast * 0.25 : 0.42;
    if (Math.random() > prob) continue;

    positions[i * 3]     = xp * SPHERE_RADIUS;
    positions[i * 3 + 1] = u  * SPHERE_RADIUS;
    positions[i * 3 + 2] = zp * SPHERE_RADIUS;

    const driftX = Math.random() * 2 - 1;
    const driftY = Math.random() * 2 - 1;
    const driftZ = Math.random() * 2 - 1;
    const driftLen = Math.sqrt(driftX * driftX + driftY * driftY + driftZ * driftZ) || 1;
    const dirX = xp * 0.72 + (driftX / driftLen) * 0.28;
    const dirY = u * 0.72 + (driftY / driftLen) * 0.28;
    const dirZ = zp * 0.72 + (driftZ / driftLen) * 0.28;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
    explodeDir[i * 3] = dirX / dirLen;
    explodeDir[i * 3 + 1] = dirY / dirLen;
    explodeDir[i * 3 + 2] = dirZ / dirLen;
    explodePow[i] = THREE.MathUtils.lerp(0.95, 1.85, Math.random());

    phase[i]     = Math.random();
    seed[i]      = Math.random();
    latitude[i]  = u;
    landAttr[i]  = isLand;
    coastAttr[i] = coast;
    i++;
  }

  // Fill any remaining slots with ocean points (safety valve)
  while (i < count) {
    const u = Math.random() * 2 - 1, theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const xp = r * Math.cos(theta);
    const zp = r * Math.sin(theta);
    positions[i * 3]     = xp * SPHERE_RADIUS;
    positions[i * 3 + 1] = u * SPHERE_RADIUS;
    positions[i * 3 + 2] = zp * SPHERE_RADIUS;

    const driftX = Math.random() * 2 - 1;
    const driftY = Math.random() * 2 - 1;
    const driftZ = Math.random() * 2 - 1;
    const driftLen = Math.sqrt(driftX * driftX + driftY * driftY + driftZ * driftZ) || 1;
    const dirX = xp * 0.72 + (driftX / driftLen) * 0.28;
    const dirY = u * 0.72 + (driftY / driftLen) * 0.28;
    const dirZ = zp * 0.72 + (driftZ / driftLen) * 0.28;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
    explodeDir[i * 3] = dirX / dirLen;
    explodeDir[i * 3 + 1] = dirY / dirLen;
    explodeDir[i * 3 + 2] = dirZ / dirLen;
    explodePow[i] = THREE.MathUtils.lerp(0.95, 1.85, Math.random());

    phase[i] = Math.random();
    seed[i]  = Math.random();
    latitude[i] = u;
    i++;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',  new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase',    new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute('aSeed',     new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute('aLatitude', new THREE.BufferAttribute(latitude, 1));
  geometry.setAttribute('aLand',     new THREE.BufferAttribute(landAttr, 1));
  geometry.setAttribute('aCoast',    new THREE.BufferAttribute(coastAttr, 1));
  geometry.setAttribute('aExplodeDir', new THREE.BufferAttribute(explodeDir, 3));
  geometry.setAttribute('aExplodePow', new THREE.BufferAttribute(explodePow, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:          { value: 0 },
      uPointSize:     { value: 1.0 },
      uRingLat:       { value: 0 },
      uMousePoint:    { value: new THREE.Vector3(9, 9, 9) },
      uMouseStrength: { value: 0 },
      uReduceMotion:  { value: 0 },
      uDisperse:      { value: 0 },
    },
    transparent: true,
    depthWrite: true,
    blending: THREE.NormalBlending,
    vertexShader: `
      uniform float uTime;
      uniform float uPointSize;
      uniform float uRingLat;
      uniform vec3  uMousePoint;
      uniform float uMouseStrength;
      uniform float uReduceMotion;
      uniform float uDisperse;

      attribute float aPhase;
      attribute float aSeed;
      attribute float aLatitude;
      attribute float aLand;
      attribute float aCoast;
      attribute vec3  aExplodeDir;
      attribute float aExplodePow;

      varying float vAlpha;
      varying float vRingGlow;
      varying float vProbe;
      varying float vLand;
      varying float vCoast;
      varying float vFrontMask;

      void main() {
        vec3 pos = position;
        float breathPhase = sin(uTime * 0.85 + aPhase * 6.2831) * 0.5 + 0.5;
        float noisePhase = sin(aSeed * 10.0 + uTime * 0.65) * 0.5 + 0.5;
        float shellLift = (breathPhase * 0.008 + noisePhase * 0.004) * (1.0 - uReduceMotion);
        pos += normalize(position) * shellLift;

        float disperse = clamp(uDisperse, 0.0, 1.0);
        float motionScale = mix(0.12, 1.0, 1.0 - uReduceMotion);
        float travel = (0.45 + aExplodePow * 1.85) * disperse;
        float swirlPhase = uTime * (1.8 + aSeed * 2.7) + aPhase * 6.2831;
        vec3 swirl = vec3(
          sin(swirlPhase * 1.17),
          cos(swirlPhase * 0.93),
          sin(swirlPhase * 1.41)
        ) * 0.03 * disperse * (1.0 - uReduceMotion);
        pos += aExplodeDir * travel * motionScale + swirl;

        float ringDist = abs(aLatitude - uRingLat);
        float ringGlow = (1.0 - smoothstep(0.0, 0.055, ringDist))
          * (1.0 - uReduceMotion)
          * (1.0 - disperse);

        float probe = 0.0;
        if (uMouseStrength > 0.0001) {
          float d = distance(pos, uMousePoint);
          probe = exp(-d * 8.0) * uMouseStrength * (1.0 - disperse);
          pos += normalize(position) * probe * 0.12;
        }

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        vec3 worldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
        vec3 worldCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 worldNormal = normalize(worldPos - worldCenter);
        vec3 viewDir = normalize(cameraPosition - worldPos);
        float facing = dot(worldNormal, viewDir);
        vFrontMask = smoothstep(-0.02, 0.08, facing);

        float persp      = 8.5 / -mvPosition.z;
        float jitter     = mix(0.82, 1.15, aSeed);
        float coastBoost = aCoast * 0.35;
        float dissolve   = 1.0 - disperse * (0.62 + aSeed * 0.38);
        gl_PointSize = max(0.5, uPointSize * persp * jitter *
          (0.92 + aLand * 0.18 + coastBoost + ringGlow * 0.22 + probe * 1.7) * max(0.08, dissolve));

        vRingGlow = ringGlow;
        vProbe    = probe;
        vLand     = aLand;
        vCoast    = aCoast;

        // Keep baseline brightness stable across rotation.
        float baseBright = 0.56 + aLand * 0.04;
        float dissolveAlpha = 1.0 - disperse * (0.72 + aSeed * 0.28);
        vAlpha = baseBright
               + aCoast  * 0.14
               + ringGlow * 0.1
               + probe   * 0.32;
        vAlpha *= max(0.0, dissolveAlpha);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vRingGlow;
      varying float vProbe;
      varying float vLand;
      varying float vCoast;
      varying float vFrontMask;
      uniform float uDisperse;

      void main() {
        float d    = length(gl_PointCoord - 0.5);
        float mask = smoothstep(0.50, 0.22, d);

        // Palette
        vec3 ocean      = vec3(0.22, 0.45, 0.67);
        vec3 landInner  = vec3(0.36, 0.74, 0.85);
        vec3 landEdge   = vec3(0.72, 0.90, 0.98);
        vec3 probeColor = vec3(0.55, 1.00, 0.80);   // hover teal-green

        vec3 color = mix(ocean, landInner, vLand);
        color = mix(color, landEdge, vCoast * 0.55);         // coast bright edge
        color *= 0.95;                                        // keep global brightness stable while dragging
        color  = mix(color, probeColor, vRingGlow * 0.40 + min(0.75, vProbe * 1.1));

        float frontMask = mix(vFrontMask, 1.0, smoothstep(0.18, 0.42, uDisperse));
        float alpha = mask * vAlpha * frontMask;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  return new THREE.Points(geometry, material);
}

// ─── Latitude / longitude grid ────────────────────────────────────────────────
function buildLatitudeLines() {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({
    color: 0x8ab8d4,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const latitudes = [-0.72, -0.46, -0.18, 0.12, 0.36, 0.64];
  for (const lat of latitudes) {
    const radius = Math.sqrt(Math.max(0.06, 1 - lat * lat)) * SPHERE_RADIUS;
    const curve  = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
    const pts3d  = curve.getPoints(128).map((p) => new THREE.Vector3(p.x, lat * SPHERE_RADIUS, p.y));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts3d), mat);
    line.renderOrder = 10;
    group.add(line);
  }
  return group;
}

function buildDriftAura(count) {
  const positions = new Float32Array(count * 3);
  const driftDir = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);
  const amp = new Float32Array(count);
  const size = new Float32Array(count);
  const tint = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const radius = THREE.MathUtils.lerp(1.22, 2.2, Math.pow(Math.random(), 0.68));
    const bx = r * Math.cos(theta);
    const by = u;
    const bz = r * Math.sin(theta);

    positions[i * 3] = bx * radius;
    positions[i * 3 + 1] = by * radius;
    positions[i * 3 + 2] = bz * radius;

    const u2 = Math.random() * 2 - 1;
    const theta2 = Math.random() * Math.PI * 2;
    const r2 = Math.sqrt(1 - u2 * u2);
    driftDir[i * 3] = r2 * Math.cos(theta2);
    driftDir[i * 3 + 1] = u2;
    driftDir[i * 3 + 2] = r2 * Math.sin(theta2);

    phase[i] = Math.random() * Math.PI * 2;
    speed[i] = THREE.MathUtils.lerp(0.14, 0.52, Math.random());
    amp[i] = THREE.MathUtils.lerp(0.015, 0.085, Math.random());
    size[i] = THREE.MathUtils.lerp(0.7, 2.35, Math.random());
    tint[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aDriftDir', new THREE.BufferAttribute(driftDir, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  geometry.setAttribute('aAmp', new THREE.BufferAttribute(amp, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: `
      uniform float uTime;
      attribute vec3 aDriftDir;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aAmp;
      attribute float aSize;
      attribute float aTint;
      varying float vAlpha;
      varying float vTint;

      void main() {
        vec3 base = position;
        float w1 = sin(uTime * aSpeed + aPhase);
        float w2 = cos(uTime * (aSpeed * 0.73) + aPhase * 1.17);
        vec3 pos = base + normalize(base) * w1 * aAmp + aDriftDir * w2 * aAmp * 0.85;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        float perspective = 7.8 / -mv.z;
        gl_PointSize = max(0.5, aSize * perspective);
        vAlpha = 0.05 + aSize * 0.03;
        vTint = aTint;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vTint;

      void main() {
        float d = length(gl_PointCoord - 0.5);
        float mask = smoothstep(0.5, 0.0, d);
        vec3 warmA = vec3(1.00, 0.58, 0.23);
        vec3 warmB = vec3(1.00, 0.30, 0.72);
        vec3 color = mix(warmA, warmB, vTint);
        float alpha = mask * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  return new THREE.Points(geometry, material);
}

function getDroneOrbitPoint(drone, orbitPhase, motionTime, reducedMotion, out) {
  const orbitalLift = Math.sin(orbitPhase * 2.15 + drone.bobPhase)
    * (reducedMotion ? 0.002 : drone.bankLift);
  out
    .copy(drone.basisU)
    .multiplyScalar(Math.cos(orbitPhase))
    .addScaledVector(drone.basisV, Math.sin(orbitPhase))
    .addScaledVector(drone.orbitNormal, orbitalLift)
    .normalize();

  const bob = Math.sin(motionTime * drone.altitudeSpeed + drone.bobPhase)
    * (reducedMotion ? 0.002 : drone.cruiseBob);
  const radius = SPHERE_RADIUS + drone.baseAltitude + bob;
  return out.multiplyScalar(radius);
}

function buildDroneSquad(count, isMobileLike) {
  const group = new THREE.Group();
  const drones = [];
  const trailPoints = isMobileLike ? 10 : 18;

  const bodyGeometry = new THREE.BoxGeometry(0.056, 0.02, 0.046);
  const canopyGeometry = new THREE.SphereGeometry(0.018, 16, 14);
  const armXGeometry = new THREE.BoxGeometry(0.088, 0.0042, 0.012);
  const armZGeometry = new THREE.BoxGeometry(0.012, 0.0042, 0.088);
  const bladeXGeometry = new THREE.BoxGeometry(0.022, 0.0011, 0.004);
  const bladeZGeometry = new THREE.BoxGeometry(0.004, 0.0011, 0.022);
  const hubGeometry = new THREE.SphereGeometry(0.0048, 12, 10);
  const beaconGeometry = new THREE.SphereGeometry(0.0048, 12, 10);

  const bodyMaterial = new THREE.MeshBasicMaterial({
    color: 0xe8f6ff,
    transparent: true,
    opacity: 0.82,
  });
  const canopyMaterial = new THREE.MeshBasicMaterial({
    color: 0xb9f4ff,
    transparent: true,
    opacity: 0.58,
  });
  const armMaterial = new THREE.MeshBasicMaterial({
    color: 0x7bd8ff,
    transparent: true,
    opacity: 0.52,
  });
  const bladeMaterial = new THREE.MeshBasicMaterial({
    color: 0x9ef6ff,
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const hubMaterial = new THREE.MeshBasicMaterial({
    color: 0xbff8ff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const rotorOffsets = [
    [0.036, 0.007, 0.036],
    [-0.036, 0.007, 0.036],
    [0.036, 0.007, -0.036],
    [-0.036, 0.007, -0.036],
  ];

  for (let i = 0; i < count; i += 1) {
    const drone = new THREE.Group();

    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.scale.set(1.18, 0.72, 0.94);
    canopy.position.set(0, 0.006, -0.002);
    const armX = new THREE.Mesh(armXGeometry, armMaterial);
    const armZ = new THREE.Mesh(armZGeometry, armMaterial);
    drone.add(body, canopy, armX, armZ);

    const beacon = new THREE.Mesh(
      beaconGeometry,
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xff9b76 : 0x7dfff6,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    beacon.position.set(0, 0.016, 0);
    drone.add(beacon);

    const trailColor = i % 2 === 0 ? 0xff9b76 : 0x7dfff6;
    const trailPositions = new Float32Array(trailPoints * 3);
    const trailGeometry = new THREE.BufferGeometry();
    const trailAttr = new THREE.BufferAttribute(trailPositions, 3);
    trailGeometry.setAttribute('position', trailAttr);
    const trail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({
        color: trailColor,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    trail.renderOrder = 8;
    trail.frustumCulled = false;
    group.add(trail);

    const rotors = [];
    for (const [x, y, z] of rotorOffsets) {
      const rotor = new THREE.Group();
      rotor.position.set(x, y, z);

      const bladeX = new THREE.Mesh(bladeXGeometry, bladeMaterial);
      const bladeZ = new THREE.Mesh(bladeZGeometry, bladeMaterial);
      const hub = new THREE.Mesh(hubGeometry, hubMaterial);
      rotor.add(bladeX, bladeZ, hub);
      drone.add(rotor);
      rotors.push(rotor);
    }

    const lat = THREE.MathUtils.lerp(-58, 62, Math.random());
    const lon = Math.random() * 360 - 180;
    const orbitNormal = latLonToVector3(lat, lon, 1).normalize();
    const refAxis = Math.abs(orbitNormal.y) > 0.84 ? new THREE.Vector3(1, 0, 0) : UP_AXIS;
    const basisU = new THREE.Vector3().crossVectors(refAxis, orbitNormal).normalize();
    const basisV = new THREE.Vector3().crossVectors(orbitNormal, basisU).normalize();

    drones.push({
      root: drone,
      beacon,
      rotors,
      trail,
      trailAttr,
      trailPositions,
      trailPoints,
      basisU,
      basisV,
      orbitNormal,
      speed: THREE.MathUtils.lerp(0.18, 0.32, Math.random()) * (isMobileLike ? 0.85 : 1),
      phase: (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.55,
      bobPhase: Math.random() * Math.PI * 2,
      altitudeSpeed: THREE.MathUtils.lerp(2.1, 3.6, Math.random()),
      baseAltitude: THREE.MathUtils.lerp(0.03, 0.052, Math.random()),
      cruiseBob: THREE.MathUtils.lerp(0.002, 0.0045, Math.random()),
      bankLift: THREE.MathUtils.lerp(0.006, 0.016, Math.random()),
      rotorSpeed: THREE.MathUtils.lerp(11, 19, Math.random()),
      tmpPos: new THREE.Vector3(),
      tmpTarget: new THREE.Vector3(),
      tmpNext: new THREE.Vector3(),
      tmpTrail: new THREE.Vector3(),
    });

    group.add(drone);
  }

  return { group, drones };
}

function updateDroneSquad(squad, time, reducedMotion) {
  if (!squad) return;

  const motionTime = reducedMotion ? time * 0.18 : time;
  const rollScale = reducedMotion ? 0.015 : 0.06;

  for (const drone of squad.drones) {
    const orbitPhase = motionTime * drone.speed + drone.phase;
    const nextPhase = orbitPhase + (reducedMotion ? 0.018 : 0.034);

    getDroneOrbitPoint(drone, orbitPhase, motionTime, reducedMotion, drone.tmpPos);
    getDroneOrbitPoint(drone, nextPhase, motionTime + 0.02, reducedMotion, drone.tmpNext);

    drone.root.position.copy(drone.tmpPos);

    drone.tmpTarget.copy(drone.tmpNext);
    drone.root.lookAt(drone.tmpTarget);
    drone.root.rotateX(THREE.MathUtils.degToRad(12));
    drone.root.rotateZ(Math.sin(motionTime * 4.8 + drone.phase) * rollScale);

    const spin = motionTime * drone.rotorSpeed;
    for (const rotor of drone.rotors) {
      rotor.rotation.y = spin;
    }

    const pulse = Math.sin(motionTime * 3.4 + drone.bobPhase) * 0.5 + 0.5;
    const beaconScale = 0.9 + pulse * 0.35;
    drone.beacon.scale.setScalar(beaconScale);
    drone.beacon.material.opacity = 0.34 + pulse * 0.3;

    for (let i = 0; i < drone.trailPoints; i += 1) {
      const sampleOffset = i * 0.11;
      const samplePhase = orbitPhase - sampleOffset;
      getDroneOrbitPoint(drone, samplePhase, motionTime - i * 0.035, reducedMotion, drone.tmpTrail);
      const idx = i * 3;
      drone.trailPositions[idx] = drone.tmpTrail.x;
      drone.trailPositions[idx + 1] = drone.tmpTrail.y;
      drone.trailPositions[idx + 2] = drone.tmpTrail.z;
    }

    drone.trailAttr.needsUpdate = true;
    drone.trail.material.opacity = reducedMotion ? 0.08 : 0.16;
  }
}

function resolveMarkerAnchor(location, pointCloud = null) {
  const target = latLonToVector3(location.lat, location.lon, SPHERE_RADIUS).normalize();
  if (!pointCloud?.geometry) return target.clone().multiplyScalar(SPHERE_RADIUS);

  const positionAttr = pointCloud.geometry.getAttribute('position');
  if (!positionAttr?.array) return target.clone().multiplyScalar(SPHERE_RADIUS);

  const positions = positionAttr.array;
  const landAttr = pointCloud.geometry.getAttribute('aLand')?.array || null;
  const coastAttr = pointCloud.geometry.getAttribute('aCoast')?.array || null;

  let bestLandScore = -Infinity;
  let bestLandIndex = -1;
  let bestFallbackScore = -Infinity;
  let bestFallbackIndex = -1;

  for (let i = 0; i < positionAttr.count; i += 1) {
    const idx = i * 3;
    const px = positions[idx];
    const py = positions[idx + 1];
    const pz = positions[idx + 2];
    const length = Math.hypot(px, py, pz) || 1;
    const alignment = (target.x * px + target.y * py + target.z * pz) / length;

    if (alignment > bestFallbackScore) {
      bestFallbackScore = alignment;
      bestFallbackIndex = idx;
    }

    const isLand = !landAttr || landAttr[i] > 0.5;
    if (!isLand) continue;

    const coastalBias = coastAttr ? coastAttr[i] * 0.015 : 0;
    const score = alignment + coastalBias;
    if (score > bestLandScore) {
      bestLandScore = score;
      bestLandIndex = idx;
    }
  }

  const bestIndex = bestLandIndex >= 0 ? bestLandIndex : bestFallbackIndex;
  if (bestIndex < 0) return target.clone().multiplyScalar(SPHERE_RADIUS);

  return new THREE.Vector3(
    positions[bestIndex],
    positions[bestIndex + 1],
    positions[bestIndex + 2]
  ).normalize().multiplyScalar(SPHERE_RADIUS);
}

function buildCityMarkers(locations) {
  const group = new THREE.Group();
  const glowMap = getMarkerGlowTexture();

  for (const [index, location] of locations.entries()) {
    const color = new THREE.Color(location.color);
    const anchor = resolveMarkerAnchor(location);
    const normal = anchor.clone().normalize();

    const marker = new THREE.Group();
    marker.position.copy(anchor);
    marker.quaternion.setFromUnitVectors(UP_AXIS, normal);
    marker.userData.location = location;
    marker.userData.pulseOffset = index * 1.15;

    const hitArea = new THREE.Mesh(
      new THREE.SphereGeometry(MARKER_HIT_RADIUS, 18, 18),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    hitArea.position.y = MARKER_RAISE + 0.012;
    hitArea.userData.location = location;
    marker.add(hitArea);

    const stemHeight = 0.07;
    const tipY = MARKER_RAISE + stemHeight;

    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.016, 0.022, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    baseRing.position.y = MARKER_RAISE + 0.002;
    baseRing.rotation.x = Math.PI / 2;
    baseRing.userData.location = location;
    marker.add(baseRing);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0016, 0.0016, stemHeight, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        toneMapped: false,
      })
    );
    stem.position.y = MARKER_RAISE + stemHeight * 0.5;
    stem.userData.location = location;
    marker.add(stem);

    const tipGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowMap,
        color,
        transparent: true,
        opacity: 0.055,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    tipGlow.position.y = tipY;
    tipGlow.scale.setScalar(0.075);
    tipGlow.userData.location = location;
    tipGlow.raycast = () => {};
    marker.add(tipGlow);

    const tipCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.0105, 18, 18),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        toneMapped: false,
      })
    );
    tipCore.position.y = tipY;
    tipCore.userData.location = location;
    marker.add(tipCore);

    const tipHighlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.0045, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.84,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    tipHighlight.position.y = tipY + 0.001;
    tipHighlight.userData.location = location;
    marker.add(tipHighlight);

    marker.userData.parts = { baseRing, stem, tipGlow, tipCore, tipHighlight };
    group.add(marker);
  }

  return group;
}

function updateCityMarkerAnchors(group, pointCloud) {
  if (!group) return;

  for (const marker of group.children) {
    const anchor = resolveMarkerAnchor(marker.userData.location, pointCloud);
    const normal = anchor.clone().normalize();
    marker.position.copy(anchor);
    marker.quaternion.setFromUnitVectors(UP_AXIS, normal);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function initEarthHero({
  heroSelector,
  canvasSelector,
  fallbackSelector,
  disintegrateTriggerSelector,
  reassembleTriggerSelector,
}) {
  const hero     = document.querySelector(heroSelector);
  const canvas   = document.querySelector(canvasSelector);
  const fallback = document.querySelector(fallbackSelector);
  const visual   = canvas?.parentElement;
  const disintegrateTrigger = disintegrateTriggerSelector
    ? document.querySelector(disintegrateTriggerSelector)
    : null;
  const reassembleTrigger = reassembleTriggerSelector
    ? document.querySelector(reassembleTriggerSelector)
    : null;

  if (!hero || !canvas || !fallback || !visual) return;
  if (!isWebGLAvailable()) { visual.classList.add('fallback-active'); return; }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMatch   = window.matchMedia('(max-width: 900px)');
  const lowCore       = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
  const isMobileLike  = mobileMatch.matches || lowCore;
  const particleCount = isMobileLike ? 55000 : 100000;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !isMobileLike,
      powerPreference: 'high-performance',
    });
  } catch { visual.classList.add('fallback-active'); return; }

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 20);
  camera.position.set(0, 0.1, 4.2);

  renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.outputColorSpace   = THREE.SRGBColorSpace;

  const globeGroup = new THREE.Group();
  scene.add(globeGroup);
  const demoPortal = ensureDemoPortal();
  let cityMarkers = null;
  let droneSquad = null;

  // Start with procedural blobs, replace once GeoJSON loads
  let points = buildPointCloud(particleCount);
  globeGroup.add(points);

  function replacePointCloud(landFn) {
    const next = buildPointCloud(particleCount, landFn);
    const pu   = points.material.uniforms;
    const nu   = next.material.uniforms;
    nu.uTime.value          = pu.uTime.value;
    nu.uPointSize.value     = pu.uPointSize.value;
    nu.uRingLat.value       = pu.uRingLat.value;
    nu.uMousePoint.value.copy(pu.uMousePoint.value);
    nu.uMouseStrength.value = pu.uMouseStrength.value;
    nu.uReduceMotion.value  = pu.uReduceMotion.value;
    nu.uDisperse.value      = pu.uDisperse.value;
    globeGroup.remove(points);
    points.geometry.dispose();
    points.material.dispose();
    points = next;
    globeGroup.add(points);
    updateCityMarkerAnchors(cityMarkers, points);
  }

  // Fetch GeoJSON & bake land mask, then rebuild point cloud
  buildGeoJsonSampler()
    .then((sampler) => replacePointCloud(sampler))
    .catch(() => { /* keep procedural */ });

  // Core dark sphere (hides back-facing points)
  const coreSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.978, 64, 48),
    new THREE.MeshPhongMaterial({
      color: 0x04111c,
      transparent: false,
      opacity: 1,
      specular: 0x102838,
      shininess: 14,
    })
  );
  globeGroup.add(coreSphere);

  // Floating outer particles (intentionally different color to avoid confusion with globe body)
  const driftAura = buildDriftAura(isMobileLike ? 2400 : 4600);
  scene.add(driftAura);

  // Wireframe overlay
  const wireframe = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(1.03, 20, 14)),
    new THREE.LineBasicMaterial({
      color: 0x9acde4,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  globeGroup.add(wireframe);

  const latitudeLines = buildLatitudeLines();
  globeGroup.add(latitudeLines);

  cityMarkers = buildCityMarkers(CLICKABLE_LOCATIONS);
  updateCityMarkerAnchors(cityMarkers, points);
  globeGroup.add(cityMarkers);

  droneSquad = buildDroneSquad(6, isMobileLike);
  globeGroup.add(droneSquad.group);

  // Scan ring
  const scanRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.005, 14, 160),
    new THREE.MeshBasicMaterial({
      color: 0x55ffdd,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  scanRing.rotation.x = Math.PI / 2;
  globeGroup.add(scanRing);

  // Lights
  scene.add(new THREE.AmbientLight(0x2a4a5c, 0.80));
  const rim  = new THREE.DirectionalLight(0xbce8ff, 0.95);
  rim.position.set(2.8, 1.2, 2.2);
  const fill = new THREE.DirectionalLight(0x1d5570, 0.35);
  fill.position.set(-2.2, -0.3, -1.4);
  scene.add(rim, fill);

  // Post-processing
  const composer  = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(visual.clientWidth, visual.clientHeight),
    isMobileLike ? 0.06 : 0.10,
    0.22,
    0.90
  );
  composer.addPass(bloomPass);

  // Interaction state
  const raycaster      = new THREE.Raycaster();
  const pointer        = new THREE.Vector2();
  const localPt        = new THREE.Vector3();
  const hitPt          = new THREE.Vector3(9, 9, 9);
  const hitSphere      = new THREE.Sphere(new THREE.Vector3(), SPHERE_RADIUS * 1.08);
  const markerHits = [];
  let curMouse = 0, targetMouse = 0;
  let running = false, heroVisible = true, fpsCap = 60, rafId = 0, lastFrame = 0;
  let isDragging = false, dragId = -1, lastX = 0, lastY = 0;
  let targetRotX = 0, targetRotY = 0, smoothRotX = 0, smoothRotY = 0;
  let inertX = 0, inertY = 0;
  let disperse = 0, targetDisperse = 0;
  let tighten = 0, targetTighten = 0;
  let scrollDisperseActive = false;
  let hoveredLocation = null;
  let pressedLocation = null;
  let pressPointerId = -1;
  let pressX = 0;
  let pressY = 0;

  function disintegrationInFlight() {
    return Math.abs(targetDisperse - disperse) > 0.001;
  }

  function shouldRunLoop() {
    return !document.hidden && (heroVisible || scrollDisperseActive || disintegrationInFlight());
  }

  function interactionLocked() {
    return targetDisperse > 0.001 || targetTighten > 0.001;
  }

  function updateCanvasCursor() {
    if (scrollDisperseActive) {
      canvas.style.cursor = 'default';
      return;
    }
    if (isDragging) {
      canvas.style.cursor = 'grabbing';
      return;
    }
    canvas.style.cursor = hoveredLocation ? 'pointer' : 'grab';
  }

  function updatePointerFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function getHoveredLocation() {
    raycaster.setFromCamera(pointer, camera);
    markerHits.length = 0;
    raycaster.intersectObjects(cityMarkers.children, true, markerHits);
    const hitObject = markerHits[0]?.object;
    return hitObject?.userData?.location || hitObject?.parent?.userData?.location || null;
  }

  function cancelDragInteraction() {
    if (!isDragging) {
      canvas.classList.remove('is-dragging');
      updateCanvasCursor();
      return;
    }
    isDragging = false;
    canvas.classList.remove('is-dragging');
    if (dragId !== -1 && canvas.hasPointerCapture(dragId)) {
      canvas.releasePointerCapture(dragId);
    }
    dragId = -1;
    inertX = inertY = 0;
    updateCanvasCursor();
  }

  function updateSizes() {
    const w = Math.max(1, visual.clientWidth);
    const h = Math.max(1, visual.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, isMobileLike ? 1.35 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(isMobileLike ? dpr * 0.82 : dpr);
    composer.setSize(w, h);
    points.material.uniforms.uPointSize.value = w < 500 ? 1.35 : 1.0;
    points.material.uniforms.uDisperse.value = disperse;
  }

  function updateDisperseFromScroll() {
    if (!disintegrateTrigger) {
      targetDisperse = 0;
      targetTighten = 0;
      scrollDisperseActive = false;
      updateCanvasCursor();
      return;
    }

    const manifestoExposure = getElementExposureRatio(disintegrateTrigger);
    if (!reassembleTrigger) {
      targetTighten = manifestoExposure;
      targetDisperse = THREE.MathUtils.clamp(manifestoExposure, 0, 1) * MAX_DISPERSE;
      scrollDisperseActive = interactionLocked();
      if (scrollDisperseActive) {
        targetMouse = 0;
        cancelDragInteraction();
      }
      updateCanvasCursor();
      return;
    }

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;

    const manifestoRect = disintegrateTrigger.getBoundingClientRect();
    const manifestoTop = scrollY + manifestoRect.top;
    const manifestoHeight = Math.max(1, manifestoRect.height);
    const ctaRect = reassembleTrigger.getBoundingClientRect();
    const ctaTop = scrollY + ctaRect.top;

    // Stage A: manifesto enters viewport -> dispersal 0 -> 1
    const disperseStartY = manifestoTop - viewportHeight;
    const dispersePeakYRaw = manifestoTop + manifestoHeight - viewportHeight;
    const dispersePeakY = Math.max(disperseStartY + 1, dispersePeakYRaw);

    // Stage B: continue scrolling down -> only partially reassemble by CTA
    const reassembleEndY = Math.max(dispersePeakY + 1, ctaTop);

    if (scrollY <= dispersePeakY) {
      targetDisperse = manifestoExposure;
      targetTighten = manifestoExposure;
    } else {
      const backProgress = THREE.MathUtils.clamp(
        (scrollY - dispersePeakY) / (reassembleEndY - dispersePeakY),
        0,
        1
      );
      targetDisperse = 1 - backProgress * CTA_REASSEMBLE_RATIO;
      // After manifesto passes, restore globe scale/position progressively with scroll.
      targetTighten = 1 - backProgress;
    }

    targetDisperse = THREE.MathUtils.clamp(targetDisperse, 0, 1) * MAX_DISPERSE;
    targetTighten = THREE.MathUtils.clamp(targetTighten, 0, 1);
    scrollDisperseActive = interactionLocked();
    if (scrollDisperseActive) {
      targetMouse = 0;
      cancelDragInteraction();
    }
    updateCanvasCursor();
  }

  function handlePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (interactionLocked()) return;
    updatePointerFromEvent(e);
    hoveredLocation = getHoveredLocation();
    updateCanvasCursor();
    if (hoveredLocation) {
      pressedLocation = hoveredLocation;
      pressPointerId = e.pointerId;
      pressX = e.clientX;
      pressY = e.clientY;
      targetMouse = 0;
      return;
    }
    isDragging = true; dragId = e.pointerId;
    lastX = e.clientX; lastY = e.clientY;
    inertX = inertY = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
    updateCanvasCursor();
  }
  function handlePointerUp(e) {
    updatePointerFromEvent(e);
    hoveredLocation = getHoveredLocation();
    if (pressedLocation && e.pointerId === pressPointerId) {
      const moved = Math.hypot(e.clientX - pressX, e.clientY - pressY);
      if (hoveredLocation?.id === pressedLocation.id && moved < 10) {
        demoPortal.openPortal(pressedLocation);
      }
      pressedLocation = null;
      pressPointerId = -1;
      updateCanvasCursor();
      return;
    }
    if (e.pointerId !== dragId) return;
    isDragging = false; dragId = -1;
    canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    updateCanvasCursor();
  }
  function handlePointerMove(e) {
    if (reducedMotion.matches || interactionLocked()) {
      targetMouse = 0;
      hoveredLocation = null;
      pressedLocation = null;
      pressPointerId = -1;
      cancelDragInteraction();
      return;
    }

    updatePointerFromEvent(e);
    hoveredLocation = getHoveredLocation();
    updateCanvasCursor();

    if (pressedLocation && e.pointerId === pressPointerId) {
      const moved = Math.hypot(e.clientX - pressX, e.clientY - pressY);
      if (moved >= 10) {
        pressedLocation = null;
        pressPointerId = -1;
      }
    }

    if (isDragging && e.pointerId === dragId) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      const spd = isMobileLike ? 0.0038 : 0.0032;
      targetRotY += dx * spd;
      targetRotX += dy * spd;
      targetRotX = THREE.MathUtils.clamp(targetRotX, -0.65, 0.65);
      inertY = dx * spd; inertX = dy * spd;
    }
    if (hoveredLocation) {
      targetMouse = 0;
      return;
    }
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectSphere(hitSphere, hitPt)) {
      localPt.copy(hitPt);
      globeGroup.worldToLocal(localPt);
      points.material.uniforms.uMousePoint.value.copy(localPt);
      targetMouse = 1.25;
    } else {
      // During drag, keep local glow from dropping abruptly when pointer briefly leaves the hit sphere.
      if (!isDragging) targetMouse = 0;
    }
  }
  function handlePointerLeave() {
    hoveredLocation = null;
    pressedLocation = null;
    pressPointerId = -1;
    if (!isDragging) targetMouse = 0;
    updateCanvasCursor();
  }
  function handlePointerCancel(e) {
    hoveredLocation = null;
    pressedLocation = null;
    pressPointerId = -1;
    targetMouse = 0;
    if (isDragging && e.pointerId === dragId) {
      cancelDragInteraction();
      return;
    }
    updateCanvasCursor();
  }

  function frame(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (ts - lastFrame < 1000 / fpsCap) return;
    lastFrame = ts;

    updateDisperseFromScroll();
    const t       = ts * 0.001;
    const noMotion = reducedMotion.matches ? 1 : 0;
    disperse = targetDisperse;
    tighten = targetTighten;
    const intact = 1 - disperse;

    driftAura.material.uniforms.uTime.value = reducedMotion.matches ? t * 0.2 : t;
    if (!reducedMotion.matches) {
      driftAura.rotation.y += 0.00024;
      driftAura.rotation.x += 0.00006;
    }

    if (!isDragging) {
      targetRotY += (reducedMotion.matches ? 0.00045 : 0.00085) * (0.42 + intact * 0.58);
      targetRotX += inertX; inertX *= 0.93;
      targetRotY += inertY; inertY *= 0.93;
      targetRotX = THREE.MathUtils.clamp(targetRotX, -0.65, 0.65);
    }
    smoothRotX += (targetRotX - smoothRotX) * 0.12;
    smoothRotY += (targetRotY - smoothRotY) * 0.12;

    const tightenScale = THREE.MathUtils.lerp(1, 1.3, tighten);
    const tightenYScale = THREE.MathUtils.lerp(1, 0.86, tighten);
    globeGroup.scale.set(tightenScale, tightenScale * tightenYScale, tightenScale);
    globeGroup.position.y = THREE.MathUtils.lerp(0, -1.5, tighten);

    globeGroup.rotation.x = smoothRotX;
    globeGroup.rotation.y = BASE_GLOBE_ROT_Y + smoothRotY;

    const auraScale = THREE.MathUtils.lerp(1, 1.12, tighten);
    driftAura.scale.setScalar(auraScale);
    driftAura.position.y = THREE.MathUtils.lerp(0, -0.58, tighten);

    for (const marker of cityMarkers.children) {
      const pulseWave = Math.sin(t * 2.4 + marker.userData.pulseOffset) * 0.5 + 0.5;
      const activeBoost = hoveredLocation?.id === marker.userData.location.id ? 0.16 : 0;
      const { baseRing, stem, tipGlow, tipCore, tipHighlight } = marker.userData.parts;
      tipCore.scale.setScalar(0.94 + pulseWave * 0.06 + activeBoost * 0.14);
      tipCore.material.opacity = 0.84 + pulseWave * 0.06 + activeBoost * 0.06;
      tipHighlight.scale.setScalar(0.92 + pulseWave * 0.05 + activeBoost * 0.12);
      tipHighlight.material.opacity = 0.7 + pulseWave * 0.1 + activeBoost * 0.08;
      tipGlow.scale.setScalar(0.86 + pulseWave * 0.12 + activeBoost * 0.18);
      tipGlow.material.opacity = 0.028 + pulseWave * 0.012 + activeBoost * 0.032;
      baseRing.scale.setScalar(0.96 + pulseWave * 0.08 + activeBoost * 0.14);
      baseRing.material.opacity = 0.09 + pulseWave * 0.03 + activeBoost * 0.05;
      stem.material.opacity = 0.18 + pulseWave * 0.035 + activeBoost * 0.06;
    }

    updateDroneSquad(droneSquad, t, reducedMotion.matches);

    wireframe.rotation.y -= 0.0006 * (0.45 + intact * 0.55);
    latitudeLines.rotation.y += 0.0009 * (0.45 + intact * 0.55);

    let ringLat = 0.18;
    if (!reducedMotion.matches && disperse < 0.96) {
      ringLat = Math.sin(t * 0.34) * 0.72;
      const latR = Math.sqrt(Math.max(0.04, 1 - ringLat * ringLat));
      scanRing.position.y = ringLat * SPHERE_RADIUS;
      scanRing.scale.setScalar(latR);
      scanRing.material.opacity = (0.14 + Math.sin(t * 3.2) * 0.04) * intact;
      scanRing.visible = true;
    } else {
      scanRing.visible = false;
      targetMouse = 0;
    }

    curMouse += (targetMouse - curMouse) * 0.14;
    points.material.uniforms.uTime.value          = t;
    points.material.uniforms.uRingLat.value       = ringLat;
    points.material.uniforms.uMouseStrength.value = curMouse * (1 - Math.min(1, disperse * 1.4));
    points.material.uniforms.uReduceMotion.value  = noMotion;
    points.material.uniforms.uDisperse.value      = disperse;

    const bloomBase  = reducedMotion.matches ? 0.02 : isMobileLike ? 0.06 : 0.10;
    bloomPass.strength = bloomBase * (1 - Math.min(1, disperse * 0.65));

    composer.render();
    if (!shouldRunLoop()) stopLoop();
  }

  function startLoop() {
    if (running) return;
    running = true; lastFrame = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
  }
  function syncLoopState() {
    shouldRunLoop() ? startLoop() : stopLoop();
  }

  const obs = new IntersectionObserver((entries) => {
    const e = entries[0];
    heroVisible = e.isIntersecting;
    if (heroVisible) fpsCap = e.intersectionRatio < 0.42 ? 28 : 60;
    else if (scrollDisperseActive) fpsCap = 45;
    syncLoopState();
  }, { threshold: [0, 0.25, 0.42, 0.6, 1] });
  obs.observe(hero);

  document.addEventListener('visibilitychange', () => {
    syncLoopState();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      points.material.uniforms.uMouseStrength.value = 0;
      targetMouse = curMouse = 0;
    }
  });

  window.addEventListener('scroll', () => {
    updateDisperseFromScroll();
    if (scrollDisperseActive && !heroVisible) fpsCap = 45;
    syncLoopState();
  }, { passive: true });

  updateSizes();
  updateDisperseFromScroll();
  updateCanvasCursor();
  syncLoopState();

  window.addEventListener('resize', () => {
    updateSizes();
    updateDisperseFromScroll();
    syncLoopState();
  });

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateSizes).observe(hero);
  }
  // Expose so GSAP animation can trigger a resize without firing a window
  // resize event (which would cause ScrollTrigger to recalculate on every frame).
  window.__earthForceResize = function() { updateSizes(); composer.render(); };
  window.__earthSetCameraZ  = function(z) { camera.position.z = z; };
  canvas.addEventListener('pointerdown',  handlePointerDown);
  canvas.addEventListener('pointermove',  handlePointerMove);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('pointerup',    handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerCancel);

  visual.classList.remove('fallback-active');
}
