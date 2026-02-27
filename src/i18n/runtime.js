const I18N = window.SITE_I18N || {};
const STORAGE_KEY = 'site-lang';
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function updateLangToggle(activeLang, langButtons) {
  langButtons.forEach((btn) => {
    const isActive = btn.dataset.langSet === activeLang;
    btn.classList.toggle('bg-white', isActive);
    btn.classList.toggle('text-black', isActive);
    btn.classList.toggle('text-gray-300', !isActive);
    btn.classList.toggle('hover:text-white', !isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function applyTextNodes(dict) {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (hasOwn(dict, key)) {
      el.textContent = dict[key];
    }
  });

  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.dataset.i18nHtml;
    if (hasOwn(dict, key)) {
      el.innerHTML = dict[key];
    }
  });
}

function applyAttributeNodes(dict) {
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const mapping = el.dataset.i18nAttr;
    if (!mapping) return;

    mapping.split(',').forEach((pair) => {
      const [attrName, key] = pair.split(':').map((token) => token.trim());
      if (!attrName || !key) return;
      if (hasOwn(dict, key)) {
        el.setAttribute(attrName, dict[key]);
      }
    });
  });
}

function warnMissingKeys() {
  const zhKeys = new Set(Object.keys(I18N.zh || {}));
  const enKeys = new Set(Object.keys(I18N.en || {}));

  const onlyInZh = [...zhKeys].filter((key) => !enKeys.has(key));
  const onlyInEn = [...enKeys].filter((key) => !zhKeys.has(key));

  if (onlyInZh.length > 0 || onlyInEn.length > 0) {
    console.warn('I18N key mismatch detected.', {
      onlyInZh,
      onlyInEn,
    });
  }
}

function applyLanguage(lang, langButtons) {
  const selectedLang = I18N[lang] ? lang : 'zh';
  const dict = I18N[selectedLang];

  document.documentElement.lang = selectedLang === 'en' ? 'en' : 'zh-CN';

  if (hasOwn(dict, 'page_title')) {
    document.title = dict.page_title;
  }

  applyTextNodes(dict);
  applyAttributeNodes(dict);
  updateLangToggle(selectedLang, langButtons);
  localStorage.setItem(STORAGE_KEY, selectedLang);
}

function detectInitialLanguage() {
  const savedLang = localStorage.getItem(STORAGE_KEY);
  if (savedLang && I18N[savedLang]) return savedLang;
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function initI18n() {
  if (!I18N.zh || !I18N.en) {
    console.warn('I18N dictionaries are not loaded correctly.');
    return;
  }

  warnMissingKeys();

  const langButtons = [...document.querySelectorAll('[data-lang-set]')];
  const initialLang = detectInitialLanguage();
  applyLanguage(initialLang, langButtons);

  langButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      applyLanguage(btn.dataset.langSet, langButtons);
    });
  });
}
