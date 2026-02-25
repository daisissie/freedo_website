import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const SPHERE_RADIUS = 1;

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
    const lonDeg = THREE.MathUtils.radToDeg(Math.atan2(zp, xp));

    const raw    = landWeightFn(latDeg, lonDeg);
    const isLand = raw >= 1 ? 1 : 0;
    const coast  = isLand ? (raw - 1) / 0.9999 : raw; // extract coast fraction

    // Keep a stable global silhouette: land/coast dense, ocean still sufficiently present.
    const prob = isLand ? 0.82 : coast > 0.25 ? 0.70 + coast * 0.25 : 0.42;
    if (Math.random() > prob) continue;

    positions[i * 3]     = xp * SPHERE_RADIUS;
    positions[i * 3 + 1] = u  * SPHERE_RADIUS;
    positions[i * 3 + 2] = zp * SPHERE_RADIUS;
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
    positions[i * 3]     = r * Math.cos(theta) * SPHERE_RADIUS;
    positions[i * 3 + 1] = u * SPHERE_RADIUS;
    positions[i * 3 + 2] = r * Math.sin(theta) * SPHERE_RADIUS;
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

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:          { value: 0 },
      uPointSize:     { value: 1.0 },
      uRingLat:       { value: 0 },
      uMousePoint:    { value: new THREE.Vector3(9, 9, 9) },
      uMouseStrength: { value: 0 },
      uReduceMotion:  { value: 0 },
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

      attribute float aPhase;
      attribute float aSeed;
      attribute float aLatitude;
      attribute float aLand;
      attribute float aCoast;

      varying float vAlpha;
      varying float vRingGlow;
      varying float vProbe;
      varying float vLand;
      varying float vCoast;

      void main() {
        vec3 pos = position;
        float breath    = sin(uTime * 0.85 + aPhase * 6.2831) * 0.010;
        float noiseFlow = sin(aSeed * 10.0 + uTime * 0.65) * 0.005;
        pos += normalize(position) * (breath + noiseFlow * (1.0 - uReduceMotion));

        float ringDist = abs(aLatitude - uRingLat);
        float ringGlow = (1.0 - smoothstep(0.0, 0.055, ringDist)) * (1.0 - uReduceMotion);

        float probe = 0.0;
        if (uMouseStrength > 0.0001) {
          float d = distance(pos, uMousePoint);
          probe = exp(-d * 8.0) * uMouseStrength;
          pos += normalize(position) * probe * 0.12;
        }

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float persp      = 8.5 / -mvPosition.z;
        float jitter     = mix(0.82, 1.15, aSeed);
        float coastBoost = aCoast * 0.35;
        gl_PointSize = max(0.5, uPointSize * persp * jitter *
          (0.92 + aLand * 0.18 + coastBoost + ringGlow * 0.22 + probe * 1.7));

        vRingGlow = ringGlow;
        vProbe    = probe;
        vLand     = aLand;
        vCoast    = aCoast;

        // Keep baseline brightness stable across rotation.
        float baseBright = 0.56 + aLand * 0.04;
        vAlpha = baseBright
               + aCoast  * 0.14
               + ringGlow * 0.1
               + probe   * 0.32;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vRingGlow;
      varying float vProbe;
      varying float vLand;
      varying float vCoast;

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

        float alpha = mask * vAlpha;
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

// ─── Public API ───────────────────────────────────────────────────────────────
export function initEarthHero({ heroSelector, canvasSelector, fallbackSelector }) {
  const hero     = document.querySelector(heroSelector);
  const canvas   = document.querySelector(canvasSelector);
  const fallback = document.querySelector(fallbackSelector);
  const visual   = canvas?.parentElement;

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
  camera.position.set(0, 0.1, 2.95);

  renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.outputColorSpace   = THREE.SRGBColorSpace;

  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

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
    globeGroup.remove(points);
    points.geometry.dispose();
    points.material.dispose();
    points = next;
    globeGroup.add(points);
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
      transparent: true,
      opacity: 0.84,
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
  let curMouse = 0, targetMouse = 0;
  let running = false, heroVisible = true, fpsCap = 60, rafId = 0, lastFrame = 0;
  let isDragging = false, dragId = -1, lastX = 0, lastY = 0;
  let targetRotX = 0, targetRotY = 0, smoothRotX = 0, smoothRotY = 0;
  let inertX = 0, inertY = 0;

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
  }

  function handlePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    isDragging = true; dragId = e.pointerId;
    lastX = e.clientX; lastY = e.clientY;
    inertX = inertY = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
  }
  function handlePointerUp(e) {
    if (e.pointerId !== dragId) return;
    isDragging = false; dragId = -1;
    canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  }
  function handlePointerMove(e) {
    if (isDragging && e.pointerId === dragId) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      const spd = isMobileLike ? 0.0038 : 0.0032;
      targetRotY += dx * spd;
      targetRotX += dy * spd;
      targetRotX = THREE.MathUtils.clamp(targetRotX, -0.65, 0.65);
      inertY = dx * spd; inertX = dy * spd;
    }
    if (reducedMotion.matches) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    pointer.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
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
  function handlePointerLeave() { if (!isDragging) targetMouse = 0; }

  function frame(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (ts - lastFrame < 1000 / fpsCap) return;
    lastFrame = ts;

    const t       = ts * 0.001;
    const noMotion = reducedMotion.matches ? 1 : 0;

    driftAura.material.uniforms.uTime.value = reducedMotion.matches ? t * 0.2 : t;
    if (!reducedMotion.matches) {
      driftAura.rotation.y += 0.00024;
      driftAura.rotation.x += 0.00006;
    }

    if (!isDragging) {
      targetRotY += reducedMotion.matches ? 0.00045 : 0.00085;
      targetRotX += inertX; inertX *= 0.93;
      targetRotY += inertY; inertY *= 0.93;
      targetRotX = THREE.MathUtils.clamp(targetRotX, -0.65, 0.65);
    }
    smoothRotX += (targetRotX - smoothRotX) * 0.12;
    smoothRotY += (targetRotY - smoothRotY) * 0.12;
    globeGroup.rotation.x = smoothRotX;
    globeGroup.rotation.y = smoothRotY;
    wireframe.rotation.y -= 0.0006;
    latitudeLines.rotation.y += 0.0009;

    let ringLat = 0.18;
    if (!reducedMotion.matches) {
      ringLat = Math.sin(t * 0.34) * 0.72;
      const latR = Math.sqrt(Math.max(0.04, 1 - ringLat * ringLat));
      scanRing.position.y = ringLat * SPHERE_RADIUS;
      scanRing.scale.setScalar(latR);
      scanRing.material.opacity = 0.14 + Math.sin(t * 3.2) * 0.04;
      scanRing.visible = true;
    } else {
      scanRing.visible = false;
      targetMouse = 0;
    }

    curMouse += (targetMouse - curMouse) * 0.14;
    points.material.uniforms.uTime.value          = t;
    points.material.uniforms.uRingLat.value       = ringLat;
    points.material.uniforms.uMouseStrength.value = curMouse;
    points.material.uniforms.uReduceMotion.value  = noMotion;

    const bloomBase  = reducedMotion.matches ? 0.02 : isMobileLike ? 0.06 : 0.10;
    bloomPass.strength = bloomBase;

    composer.render();
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

  const obs = new IntersectionObserver((entries) => {
    const e = entries[0];
    heroVisible = e.isIntersecting;
    if (!heroVisible) { stopLoop(); return; }
    fpsCap = e.intersectionRatio < 0.42 ? 28 : 60;
    startLoop();
  }, { threshold: [0, 0.25, 0.42, 0.6, 1] });
  obs.observe(hero);

  document.addEventListener('visibilitychange', () => {
    document.hidden || !heroVisible ? stopLoop() : startLoop();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      points.material.uniforms.uMouseStrength.value = 0;
      targetMouse = curMouse = 0;
    }
  });

  updateSizes();
  startLoop();

  window.addEventListener('resize', updateSizes);
  canvas.addEventListener('pointerdown',  handlePointerDown);
  canvas.addEventListener('pointermove',  handlePointerMove);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('pointerup',    handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);

  visual.classList.remove('fallback-active');
}
