import '../i18n/zh.js';
import '../i18n/en.js';
import { initI18n } from '../i18n/runtime.js';
import { initInteractions } from '../features/home/interactions.js';
import { initEarthBackground } from '../features/home/earth-init.js';
import { initHeroAnimation } from '../features/home/hero-animation.js';

initI18n();
initInteractions();
initEarthBackground();
initHeroAnimation();
