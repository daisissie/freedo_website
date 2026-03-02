/* ── Hero scroll animation ─────────────────────────────────────────────
   As the user scrolls through the hero section:
     1. Slogan text blurs / fades upward
     2. Earth expands from circle → inset rounded rectangle below header
   The hero section is pinned while the animation plays, then scrolls
   away naturally — taking the earth with it — as the next section rises.
──────────────────────────────────────────────────────────────────────── */
export function initHeroAnimation() {
  window.addEventListener('load', function () {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger);

    var container  = document.getElementById('canvas-container');
    var heroText   = document.getElementById('hero-text');
    var heroSec    = document.getElementById('hero-section');
    var scrollHint = document.getElementById('hero-scroll-hint');
    if (!container || !heroText || !heroSec) return;

    // Initial position: circle in the right half, vertically centred.
    // Matches CSS: left:50%, top:calc(50%-min(25vw,340px)), size:min(50vw,680px).
    var initSize = Math.min(window.innerWidth * 0.5, 680);
    var initLeft = window.innerWidth * 0.5;
    var initTop  = window.innerHeight * 0.5 - initSize * 0.5;

    // Use pixel equivalent of 50% so GSAP never mixes % and px units mid-tween,
    // which causes the "ear" corner artefact during the circle → rect transition.
    gsap.set(container, {
      left:         initLeft,
      top:          initTop,
      width:        initSize,
      height:       initSize,
      borderRadius: initSize / 2,   // px equivalent of 50%
      zIndex:       2,
    });

    // Target: inset rounded rectangle below the header.
    // 24 px radius matches the site's card design language.
    var inset   = 16;
    var headerH = 48;    // nav h-12 = 48 px
    var tgtLeft   = inset;
    var tgtTop    = headerH + inset / 2;
    var tgtWidth  = window.innerWidth  - inset * 2;
    var tgtHeight = window.innerHeight - headerH - inset * 1.5;

    var tl = gsap.timeline();

    // Fade scroll hint
    if (scrollHint) tl.to(scrollHint, { opacity: 0, duration: 0.2, ease: 'none' }, 0);

    // Blur + fade hero text — ease:none so progress maps 1-to-1 with scroll
    tl.to(heroText, {
      opacity:  0,
      filter:   'blur(18px)',
      y:        -28,
      ease:     'none',
      duration: 0.6,
    }, 0);

    // Expand circle → centred inset rounded rectangle.
    // ease:none is correct for scrub tweens — scroll position is the easing.
    // onUpdate calls updateSizes() directly (via __earthForceResize) so THREE.js
    // re-renders at the new canvas dimensions on every animation frame.
    tl.to(container, {
      left:         tgtLeft,
      top:          tgtTop,
      width:        tgtWidth,
      height:       tgtHeight,
      borderRadius: 24,
      ease:         'none',
      duration:     1,
      onUpdate:     function() { if (window.__earthForceResize) window.__earthForceResize(); },
    }, 0);

    // Dwell: hold the expanded earth visible before the section scrolls away.
    tl.to({}, { duration: 1.2 });

    // Pin the hero while the animation + dwell plays; the section then scrolls
    // away normally and the next section rises naturally from below.
    ScrollTrigger.create({
      animation:           tl,
      trigger:             heroSec,
      start:               'top top',
      end:                 '+=140%',
      pin:                 true,
      scrub:               1,
      invalidateOnRefresh: true,
    });
  });
}
