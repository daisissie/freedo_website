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

export function initInteractions() {
  initScrollAnimations();
  initNavbarGlass();
  initMagneticButtons();
  initSmoothScroll();
}
