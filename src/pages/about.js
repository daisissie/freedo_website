import '../i18n/zh.js';
import '../i18n/en.js';
import { initI18n } from '../i18n/runtime.js';

function initNavbarGlass() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY > 20) {
        navbar.classList.add('bg-white/80', 'backdrop-blur-md', 'border-b', 'border-black/5');
      } else {
        navbar.classList.remove('bg-white/80', 'backdrop-blur-md', 'border-b', 'border-black/5');
      }
    },
    { passive: true }
  );
}

initI18n();
initNavbarGlass();
