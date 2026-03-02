/* ── Hero scroll animation ─────────────────────────────────────────────
   As the user scrolls through the hero section:
     1. Slogan text blurs / fades upward
     2. Earth morphs from small circle → inset rounded rectangle
   The hero section is pinned while the animation plays, then scrolls
   away naturally — taking the earth with it — as the next section rises.

   All tween target values are function-based so they are re-evaluated
   automatically when ScrollTrigger refreshes on window resize.
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

    // Stamp a pixel border-radius immediately so the browser never renders
    // a frame with the default 0 (sharp corners) before GSAP applyInit runs.
    var _preSize = Math.min(window.innerWidth * 0.5, 680);
    container.style.borderRadius = (_preSize / 2) + 'px';

    var inset   = 16;
    var headerH = 48;   // nav h-12 = 48 px

    // Initial circle: right half of hero, vertically centred.
    function getInit() {
      var size = Math.min(window.innerWidth * 0.5, 680);
      return {
        left:   window.innerWidth * 0.5,
        top:    window.innerHeight * 0.5 - size * 0.5,
        size:   size,
        radius: size / 2,
      };
    }

    // Target: inset rounded rectangle filling the viewport below the header.
    // 28 px radius — proportional to large containers, elegant at any size.
    var cornerRadius = 28;
    function getTgt() {
      return {
        left:   inset,
        top:    headerH + inset / 2,
        width:  window.innerWidth  - inset * 2,
        height: window.innerHeight - headerH - inset * 1.5,
        radius: cornerRadius,
      };
    }

    // Apply initial state (also called onRefresh so resize recalculates it).
    function applyInit() {
      var iv = getInit();
      gsap.set(container, {
        left:         iv.left,
        top:          iv.top,
        width:        iv.size,
        height:       iv.size,
        borderRadius: iv.radius,   // px equivalent of 50% — avoids unit-mix artefact
        zIndex:       2,
      });
    }

    applyInit();

    var tl = gsap.timeline();

    // Fade scroll hint
    if (scrollHint) tl.to(scrollHint, { opacity: 0, duration: 0.2, ease: 'none' }, 0);

    // Blur + fade hero text
    tl.to(heroText, {
      opacity:  0,
      filter:   'blur(18px)',
      y:        -28,
      ease:     'none',
      duration: 0.6,
    }, 0);

    // Morph circle → inset rounded rectangle.
    // Function-based values are re-evaluated on every ScrollTrigger.refresh().
    tl.to(container, {
      left:         function() { return getTgt().left; },
      top:          function() { return getTgt().top; },
      width:        function() { return getTgt().width; },
      height:       function() { return getTgt().height; },
      borderRadius: function() { return getTgt().radius; },
      ease:         'none',
      duration:     1,
      onUpdate:     function() { if (window.__earthForceResize) window.__earthForceResize(); },
    }, 0);

    // Dwell: hold the expanded earth visible before the section scrolls away.
    tl.to({}, { duration: 1.2 });

    ScrollTrigger.create({
      animation:           tl,
      trigger:             heroSec,
      start:               'top top',
      end:                 '+=140%',
      pin:                 true,
      scrub:               1,
      invalidateOnRefresh: true,
      onRefresh:           applyInit,   // recalculate initial state on resize
    });
  });
}
