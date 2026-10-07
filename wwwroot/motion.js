const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const easing = 'cubic-bezier(.22,1,.36,1)';
let origin = null;
let photoRequest = 0;
let shownPhoto = 0;
let photoLayer = 0;
let footerAnimation;

export function captureMotionOrigin(button) {
  const card = button.closest('.chapter-card');
  const symbol = card?.querySelector('.card-symbol');
  origin = symbol ? {rect: symbol.getBoundingClientRect(), panelRect: card.getBoundingClientRect()} : null;
}

function actors(root) {
  const selectors = [
    '.welcome-copy > *', '.welcome-art', '.center-stage > *',
    '.menu-heading > *', '.chapter-card', '.fine-note',
    '.section-topline', '.letter-paper', '.reading-actions',
    '.question-top', '.question-progress', '.question-wrap > h1', '.answer', '.question-actions',
    '.game-hud', '.heart-arena', '.timer-track', '.game-note',
    '.finale-layout > div:first-child > *', '.photo-stack',
    '.admin-heading', '.admin-stat', '.telegram-panel', '.table-scroll', '.admin-note',
    '.admin-detail > .text-button', '.admin-detail > h1', '.detail-box', '.notice-stage > *'
  ];
  const nodes = [...root.querySelectorAll(selectors.join(','))];
  return nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));
}

function outgoingLayer(app) {
  const rect = app.getBoundingClientRect();
  const style = getComputedStyle(app);
  const ghost = app.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.removeAttribute('tabindex');
  ghost.removeAttribute('aria-live');
  ghost.className = 'scene-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  // Freeze decorative animations at the displayed frame, including revealed letter text.
  const original = [...app.querySelectorAll('*')];
  const cloned = [...ghost.querySelectorAll('*')];
  original.forEach((node, index) => {
    const computed = getComputedStyle(node);
    if (computed.animationName === 'none') return;
    cloned[index].style.animation = 'none';
    cloned[index].style.transform = computed.transform;
    cloned[index].style.opacity = computed.opacity;
    cloned[index].style.filter = computed.filter;
  });
  Object.assign(ghost.style, {
    top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`,
    height: `${rect.height}px`, padding: style.padding
  });
  document.body.append(ghost);
  return ghost;
}

export async function transitionScene(app, html, from, to, mount) {
  const animated = !reduce.matches && typeof app.animate === 'function';
  const previous = origin || (app.querySelector('.emblem') ? {rect: app.querySelector('.emblem').getBoundingClientRect()} : null);
  origin = null;
  const letterRect = to === 'letter' ? (from === 'letter' ? app.querySelector('.letter-paper')?.getBoundingClientRect() : previous?.panelRect) : null;
  const scoreRect = from === 'heart-game' && to === 'heart-result' ? app.querySelector('.hud-value')?.getBoundingClientRect() : null;
  const footer = document.querySelector('.site-footer');
  const footerRect = footer.getBoundingClientRect();
  const ghost = animated && app.children.length ? outgoingLayer(app) : null;
  const animations = [];
  app.inert = true;
  app.setAttribute('aria-busy', 'true');
  document.body.classList.add('scene-transitioning');
  try {
    app.classList.remove('scene-enter', 'scene-exit');
    app.innerHTML = html;
    mount();
    window.scrollTo({top: 0, behavior: 'instant'});
    if (!animated) return;
    const backwards = to === 'menu';
    if (ghost) animations.push(ghost.animate([
      {opacity: 1, translate: '0 0'},
      {opacity: 0, translate: `0 ${backwards ? 12 : -12}px`}
    ], {duration: 420, easing, fill: 'both'}));

    const shared = letterRect ? app.querySelector('.letter-paper') : scoreRect ? app.querySelector('.result-score') : previous ? app.querySelector('.emblem') : null;
    const start = letterRect || scoreRect || previous?.rect;
    let nodes = actors(app);
    if (shared && !nodes.includes(shared)) {
      nodes = nodes.filter(node => !node.contains(shared));
      nodes.push(shared);
    }
    nodes.forEach((node, index) => {
      const delay = Math.min(index * 38, 190);
      if (node === shared && start) {
        const end = node.getBoundingClientRect();
        const dx = start.left + start.width / 2 - end.left - end.width / 2;
        const dy = start.top + start.height / 2 - end.top - end.height / 2;
        const sx = Math.max(.25, Math.min(2, start.width / Math.max(1, end.width)));
        const sy = Math.max(.25, Math.min(2, start.height / Math.max(1, end.height)));
        animations.push(node.animate([
          {opacity: .15, translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}`},
          {opacity: 1, translate: '0 0', scale: '1 1'}
        ], {duration: 620, easing, fill: 'both'}));
      } else {
        animations.push(node.animate([
          {opacity: 0, translate: `0 ${backwards ? -16 : 20}px`},
          {opacity: 1, translate: '0 0'}
        ], {duration: 480, delay: 90 + delay, easing, fill: 'both'}));
      }
    });
    const footerDelta = footerRect.top - footer.getBoundingClientRect().top;
    if (Math.abs(footerDelta) > 1 && Math.abs(footerDelta) < innerHeight) {
      animations.push(footer.animate([{translate: `0 ${footerDelta}px`}, {translate: '0 0'}], {duration: 650, easing}));
    }
    await Promise.allSettled(animations.map(animation => animation.finished));
  } finally {
    animations.forEach(animation => animation.cancel());
    ghost?.remove();
    app.inert = false;
    app.removeAttribute('aria-busy');
    document.body.classList.remove('scene-transitioning');
    const focused = document.activeElement;
    if (!focused || focused === document.body || app.contains(focused)) app.focus({preventScroll: true});
  }
}

export async function crossfadePhoto(index, unlocked) {
  const request = ++photoRequest;
  const layers = [document.querySelector('#photo-background'), document.querySelector('#photo-background-alt')];
  if (!index || !unlocked) {
    shownPhoto = 0;
    layers.forEach(layer => layer.classList.remove('visible'));
    return;
  }
  if (shownPhoto === index) return;
  const image = new Image();
  image.src = `/api/photos/${index}`;
  try { await image.decode(); } catch { return; }
  if (request !== photoRequest) return;
  const incoming = layers[1 - photoLayer];
  incoming.style.backgroundImage = `url('${image.src}')`;
  incoming.classList.add('visible');
  layers[photoLayer].classList.remove('visible');
  photoLayer = 1 - photoLayer;
  shownPhoto = index;
}

export function animateFooter(text) {
  const caption = document.querySelector('#footer-caption');
  if (caption.textContent === text) return;
  caption.textContent = text;
  footerAnimation?.cancel();
  if (!reduce.matches && typeof caption.animate === 'function') footerAnimation = caption.animate([
    {opacity: 0, translate: '0 4px'}, {opacity: 1, translate: '0 0'}
  ], {duration: 420, easing});
}
