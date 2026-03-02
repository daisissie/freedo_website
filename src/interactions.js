function initRevealAnimations() {
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  reveals.forEach(el => observer.observe(el));

  // Stagger children within containers
  document.querySelectorAll('.four-layers, .scenarios-grid, .three-words, .carriers-grid').forEach(container => {
    const children = container.querySelectorAll(':scope > .reveal');
    children.forEach((child, i) => {
      child.style.transitionDelay = `${i * 0.1}s`;
    });
  });
}

function initScrollAnimations() {
  if (!window.gsap || !window.ScrollTrigger) return;

  window.gsap.registerPlugin(window.ScrollTrigger);

  const revealElements = document.querySelectorAll('.reveal-up');
  revealElements.forEach((element) => {
    window.gsap.fromTo(
      element,
      {
        opacity: 0,
        y: 50,
      },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: element,
          start: 'top 85%',
          toggleActions: 'play none none reverse',
        },
        delay: element.style.transitionDelay
          ? parseFloat(element.style.transitionDelay)
          : 0,
      }
    );
  });
}

function initNavbarGlass() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('glass');
    } else {
      navbar.classList.remove('glass');
    }
  });
}

function initMagneticButtons() {
  const magneticBtns = document.querySelectorAll('.magnetic-btn');

  magneticBtns.forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translate(0px, 0px)';
    });
  });
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      e.preventDefault();
      if (!href) return;

      const target = document.querySelector(href);
      if (!target) return;
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  });
}

function initIntroDropdown() {
  const dropdown = document.querySelector('[data-intro-menu]');
  if (!dropdown) return;

  const trigger = dropdown.querySelector('[data-intro-menu-trigger]');
  const panel = dropdown.querySelector('[data-intro-menu-panel]');
  const caret = dropdown.querySelector('[data-intro-menu-caret]');
  if (!trigger || !panel) return;

  let isOpen = false;

  const setOpen = (open) => {
    isOpen = open;
    panel.classList.toggle('hidden', !open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (caret) {
      caret.classList.toggle('rotate-180', open);
    }
  };

  const canHover = () => window.matchMedia('(hover: hover)').matches;

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    setOpen(!isOpen);
  });

  dropdown.addEventListener('mouseenter', () => {
    if (canHover()) {
      setOpen(true);
    }
  });

  dropdown.addEventListener('mouseleave', () => {
    if (canHover()) {
      setOpen(false);
    }
  });

  dropdown.addEventListener('focusin', () => setOpen(true));
  dropdown.addEventListener('focusout', (event) => {
    if (dropdown.contains(event.relatedTarget)) return;
    setOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (!dropdown.contains(event.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      trigger.blur();
    }
  });

  setOpen(false);
}

export function initInteractions() {
  initRevealAnimations();
  initScrollAnimations();
  initNavbarGlass();
  initMagneticButtons();
  initSmoothScroll();
  initIntroDropdown();
}
