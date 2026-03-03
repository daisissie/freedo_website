export async function initEarthBackground() {
  const earthVisual = document.querySelector('#earth-canvas')?.parentElement;

  try {
    const { initEarthHero } = await import('./earth-scene.js');
    initEarthHero({
      heroSelector: '#earth-background',
      canvasSelector: '#earth-canvas',
      fallbackSelector: '#hero-fallback',
      disintegrateTriggerSelector: '#manifesto',
      reassembleTriggerSelector: '#cta-section',
    });
  } catch (error) {
    console.error('Failed to load earth scene module:', error);
    earthVisual?.classList.add('fallback-active');
  }
}
