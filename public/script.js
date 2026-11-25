(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Icons (inline SVG paths, Feather-style)
  ------------------------------------------------------------------ */
  const ICONS = {
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    anchor: '<circle cx="12" cy="5" r="3"/><path d="M12 22V8M5 12H2a10 10 0 0020 0h-3"/>',
    users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    camera: '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>',
    landmark: '<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-7 10 7"/>',
    waves: '<path d="M2 6c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    coffee: '<path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
  };

  function icon(name, size) {
    size = size || 20;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || ICONS.info) + '</svg>';
  }

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  /* ------------------------------------------------------------------
     State + DOM
  ------------------------------------------------------------------ */
  const state = {
    slides: [],
    current: 0,
    admin: false,
    token: null,
    saving: false,
    dirty: false,
    saveTimer: null,
    uploadIndex: null
  };

  try { state.token = sessionStorage.getItem('mq_admin_token'); } catch (e) { /* storage unavailable */ }

  const $ = function (sel) { return document.querySelector(sel); };
  const container = $('#presentation-container');
  const slideCounter = $('#slide-counter');
  const sectionLabel = $('#section-label');
  const progressBar = $('#progress-bar');

  const menuToggle = $('#menu-toggle');
  const menuDropdown = $('#menu-dropdown');
  const menuAgenda = $('#menu-agenda');
  const menuAdmin = $('#menu-admin');
  const menuAdminLabel = $('#menu-admin-label');

  const indexModal = $('#index-modal');
  const agendaList = $('#agenda-list');
  const loginModal = $('#login-modal');
  const loginForm = $('#login-form');
  const loginPassword = $('#login-password');
  const loginError = $('#login-error');
  const loginSubmit = $('#login-submit');

  const adminBar = $('#admin-bar');
  const saveStatus = $('#save-status');
  const toastEl = $('#toast');
  const fileInput = $('#file-input');

  /* ------------------------------------------------------------------
     Rendering
  ------------------------------------------------------------------ */
  function ed(path, ph, text, tag, cls) {
    tag = tag || 'span';
    return '<' + tag + (cls ? ' class="' + cls + '"' : '') + ' data-field="' + esc(path) + '" data-ph="' + esc(ph) + '">' +
      esc(text) + '</' + tag + '>';
  }

  function bgLayer(slide) {
    const has = !!(slide.video || slide.image);
    let media = '';
    if (slide.video) {
      media = '<video class="bg-video" muted loop playsinline preload="metadata" disablepictureinpicture' +
        (slide.poster ? ' poster="' + esc(slide.poster) + '"' : '') + ' src="' + esc(slide.video) + '"></video>';
    } else if (slide.image) {
      media = '<img src="' + esc(slide.image) + '" alt="' + esc(slide.title || '') + '" decoding="async">';
    }
    return '<div class="bg' + (has ? '' : ' no-img') + '">' + media + '</div>';
  }

  function bgTools(slide) {
    const has = !!(slide.video || slide.image);
    return '<div class="bg-tools">' +
      '<button class="tool-btn" data-act="upload">' + icon('camera', 14) + (has ? 'Change' : 'Add') + ' photo or video</button>' +
      (has ? '<button class="tool-btn ghost" data-act="remove">Remove media</button>' : '') +
      '</div>';
  }

  function chipsHTML(idx) {
    let html = '';
    for (let j = idx + 1; j < state.slides.length && state.slides[j].type === 'spot'; j++) {
      html += '<button class="chip" data-go="' + j + '">' + esc(state.slides[j].title) + '</button>';
    }
    return html;
  }

  function infoRow(label, path, ph, value, extraClass) {
    return '<div class="info-row' + (extraClass ? ' ' + extraClass : '') + (value ? '' : ' is-blank') + '">' +
      '<dt>' + esc(label) + '</dt>' + '<dd data-field="' + path + '" data-ph="' + esc(ph) + '">' + esc(value) + '</dd></div>';
  }

  let SOURCES = [];

  function citeChips(ids) {
    const at = state.slides.findIndex(function (x) { return x.type === 'sources'; });
    return (ids || []).map(function (n) {
      return '<button class="cite" data-go="' + (at < 0 ? 0 : at) + '" title="' + esc((SOURCES[n - 1] || {}).title || 'Source ' + n) + '">[' + n + ']</button>';
    }).join('');
  }

  function sourcesHTML(slide) {
    const hasMedia = !!(slide.image || slide.video);
    const credit = hasMedia && !slide.caption ? '<span class="cred-missing">Media credit: to be added.</span> ' : '';
    return '<p class="src-line">' + credit + 'Sources ' + citeChips(slide.cite) + (slide.creditCite ? ' · Photo ' + citeChips(slide.creditCite) : '') + '</p>';
  }

  function sourcesSlide(slide) {
    const rows = SOURCES.map(function (r) {
      return '<li id="src-' + r.id + '"><span class="n">[' + r.id + ']</span><div><a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.title) + '</a>' +
        '<small>' + esc(r.publisher) + ' · Published: ' + esc(r.published) + ' · Accessed: ' + esc(r.accessed) + '</small></div></li>';
    }).join('');
    return bgLayer(slide) + '<div class="slide-inner sources-layout"><div class="text-col">' +
      ed('tag', 'Tag', slide.tag, 'span', 'tag') + ed('title', 'Title', slide.title, 'h2', 'slide-title') +
      '<div class="rule"></div>' + ed('subtitle', 'Subtitle', slide.subtitle, 'p', 'slide-lead') + '</div>' +
      '<ol class="source-list">' + rows + '</ol></div>';
  }

  function slideInner(slide, idx) {
    return slideInner0(slide, idx) + (slide.type === 'spot' || slide.type === 'sources' ? '' : sourcesHTML(slide));
  }

  function slideInner0(slide, idx) {
    switch (slide.type) {
      case 'title':
        return bgLayer(slide) +
          '<div class="slide-inner">' +
          ed('tag', 'Tag', slide.tag, 'span', 'tag') +
          ed('title', 'Title', slide.title, 'h2', 'slide-title') +
          '<div class="rule"></div>' +
          ed('subtitle', 'Subtitle', slide.subtitle, 'p', 'slide-lead') +
          '<button class="btn-primary" data-go="next">' + esc(slide.buttonText || 'Begin the Tour') + ' &rarr;</button>' +
          '</div>' + bgTools(slide);

      case 'chapter': {
        const no = state.slides.slice(0, idx + 1).filter(function (s) { return s.type === 'chapter'; }).length;
        const chips = chipsHTML(idx);
        return bgLayer(slide) +
          '<div class="chapter-num" aria-hidden="true">' + String(no).padStart(2, '0') + '</div>' +
          '<div class="slide-inner">' +
          ed('tag', 'Chapter tag', slide.tag, 'span', 'tag') +
          ed('title', 'Chapter title', slide.title, 'h2', 'slide-title') +
          '<div class="rule"></div>' +
          ed('subtitle', 'Chapter summary', slide.subtitle, 'p', 'slide-lead') +
          '<div class="chip-label">In this chapter</div>' +
          '<div class="chip-row">' + chips + '</div>' +
          '<button class="btn-secondary" data-go="' + (idx + 1) + '">Explore the destinations &rarr;</button>' +
          '</div>' + bgTools(slide);
      }

      case 'closing':
        return bgLayer(slide) +
          '<div class="slide-inner">' +
          ed('tag', 'Tag', slide.tag, 'span', 'tag') +
          ed('title', 'Title', slide.title, 'h2', 'slide-title') +
          '<div class="rule"></div>' +
          ed('subtitle', 'Subtitle', slide.subtitle, 'p', 'slide-lead') +
          '<button class="btn-secondary" data-go="0">&larr; Back to the start</button>' +
          '</div>' + bgTools(slide);

      case 'cards': {
        const cards = (slide.cards || []).map(function (c, i) {
          return '<article class="info-card">' +
            '<div class="card-icon">' + icon(c.icon, 20) + '</div>' +
            ed('cards.' + i + '.title', 'Card title', c.title, 'h3') +
            ed('cards.' + i + '.desc', 'Card text', c.desc, 'p') +
            '</article>';
        }).join('');
        return bgLayer(slide) +
          '<div class="slide-inner cards-layout">' +
          '<div class="text-col">' +
          ed('tag', 'Tag', slide.tag, 'span', 'tag') +
          ed('title', 'Title', slide.title, 'h2', 'slide-title') +
          '<div class="rule"></div>' +
          ed('subtitle', 'Subtitle', slide.subtitle, 'p', 'slide-lead') +
          '</div>' +
          '<div class="card-grid">' + cards + '</div>' +
          '</div>' + bgTools(slide);
      }

      case 'sources':
        return sourcesSlide(slide);

      case 'spot':
      default:
        return bgLayer(slide) +
          '<div class="slide-inner spot-layout">' +
          '<div class="panel">' +
          ed('tag', 'Category • Town', slide.tag, 'span', 'tag') +
          ed('title', 'Destination name', slide.title, 'h2', 'slide-title') +
          ed('subtitle', 'Short description', slide.subtitle, 'p', 'slide-lead') +
          '<dl class="info-list">' +
          infoRow('Location', 'location', 'Where is it?', slide.location) +
          infoRow('Getting there', 'howToGet', 'How do visitors get there?', slide.howToGet) +
          infoRow('What to do', 'whatToDo', 'What can visitors do?', slide.whatToDo) +
          infoRow('Good to know', 'tip', 'Add a helpful tip', slide.tip, 'tip') +
          '</dl>' +
          ed('caption', 'Add photo or video credit', slide.caption, 'p', 'media-caption') +
          sourcesHTML(slide) +
          '</div></div>' + bgTools(slide);
    }
  }

  function slideClass(slide) {
    if (slide.type === 'title') return 'slide slide-hero title';
    if (slide.type === 'chapter') return 'slide slide-hero chapter';
    if (slide.type === 'closing') return 'slide slide-hero closing';
    if (slide.type === 'sources') return 'slide slide-cards slide-sources';
    if (slide.type === 'cards') return 'slide slide-cards';
    return 'slide slide-spot';
  }

  function createSlideEl(slide, idx) {
    const el = document.createElement('section');
    el.className = slideClass(slide) + (idx === state.current ? ' active' : '');
    el.dataset.index = idx;
    el.dataset.id = slide.id;
    el.setAttribute('aria-label', slide.title || 'Slide ' + (idx + 1));
    el.innerHTML = slideInner(slide, idx);
    return el;
  }

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) updateSlideUI(parseInt(entry.target.dataset.index, 10));
    });
  }, { root: container, threshold: 0.6 });

  function renderAll() {
    observer.disconnect();
    container.innerHTML = '';
    state.slides.forEach(function (slide, idx) {
      const el = createSlideEl(slide, idx);
      container.appendChild(el);
      observer.observe(el);
    });
    applyEditable();
    updateSlideUI(state.current);
  }

  function rerenderSlide(idx) {
    const old = container.querySelector('.slide[data-index="' + idx + '"]');
    if (!old) return;
    const el = createSlideEl(state.slides[idx], idx);
    observer.unobserve(old);
    container.replaceChild(el, old);
    observer.observe(el);
    applyEditable();
  }

  function refreshChips() {
    container.querySelectorAll('.slide.chapter').forEach(function (el) {
      const row = el.querySelector('.chip-row');
      if (row) row.innerHTML = chipsHTML(parseInt(el.dataset.index, 10));
    });
  }

  function applyEditable() {
    container.querySelectorAll('[data-field]').forEach(function (el) {
      if (state.admin) {
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('spellcheck', 'true');
      } else {
        el.removeAttribute('contenteditable');
        el.removeAttribute('spellcheck');
      }
    });
  }

  /* ------------------------------------------------------------------
     Navigation
  ------------------------------------------------------------------ */
  function updateSlideUI(index) {
    if (index < 0 || index >= state.slides.length) return;
    state.current = index;
    const total = state.slides.length;
    slideCounter.textContent = (index + 1) + ' / ' + total;
    sectionLabel.textContent = state.slides[index].section || '';
    progressBar.style.transform = 'scaleX(' + (total > 1 ? index / (total - 1) : 1) + ')';
    container.querySelectorAll('.slide').forEach(function (el, i) { el.classList.toggle('active', i === index); });
    if (typeof syncVideos === 'function') syncVideos();
  }

  function goToSlide(index, instant) {
    index = Math.max(0, Math.min(state.slides.length - 1, index));
    const el = container.querySelector('.slide[data-index="' + index + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: instant ? 'instant' : 'smooth', block: 'start' });
    updateSlideUI(index);
  }

  $('#next-btn').addEventListener('click', function () { goToSlide(state.current + 1); });
  $('#prev-btn').addEventListener('click', function () { goToSlide(state.current - 1); });

  function isTyping(t) {
    return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeMenu(); closeModal(indexModal); closeModal(loginModal);
      return;
    }
    if (isTyping(e.target)) return;
    if (document.querySelector('.modal-overlay.open')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault(); goToSlide(state.current + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault(); goToSlide(state.current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault(); goToSlide(0);
    } else if (e.key === 'End') {
      e.preventDefault(); goToSlide(state.slides.length - 1);
    }
  });

  /* ------------------------------------------------------------------
     Menu, agenda, modals
  ------------------------------------------------------------------ */
  function openModal(m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
  function closeModal(m) { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); }

  function closeMenu() {
    menuDropdown.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  menuToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    const open = menuDropdown.hidden;
    menuDropdown.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', function (e) {
    if (!menuDropdown.hidden && !e.target.closest('.menu-wrap')) closeMenu();
  });

  menuAgenda.addEventListener('click', function () { closeMenu(); buildAgenda(); openModal(indexModal); });

  menuAdmin.addEventListener('click', function () {
    closeMenu();
    if (state.admin) {
      exitAdmin(true);
    } else {
      loginError.hidden = true;
      loginPassword.value = '';
      openModal(loginModal);
      setTimeout(function () { loginPassword.focus(); }, 80);
    }
  });

  [indexModal, loginModal].forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(m); });
  });
  $('#close-index').addEventListener('click', function () { closeModal(indexModal); });
  $('#close-login').addEventListener('click', function () { closeModal(loginModal); });

  function buildAgenda() {
    let html = '';
    let lastSection = null;
    state.slides.forEach(function (s, i) {
      if (s.section !== lastSection) {
        lastSection = s.section;
        html += '<div class="agenda-group">' + esc(s.section || 'Slides') + '</div>';
      }
      html += '<button class="agenda-item' + (s.type === 'chapter' ? ' chapter-item' : '') + (i === state.current ? ' current' : '') +
        '" data-go="' + i + '"><span>' + esc(s.title) + '</span><span class="num">' + (i + 1) + '</span></button>';
    });
    agendaList.innerHTML = html;
  }

  agendaList.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-go]');
    if (!btn) return;
    closeModal(indexModal);
    goToSlide(parseInt(btn.dataset.go, 10));
  });

  $('#toggle-password').addEventListener('click', function () {
    const show = loginPassword.type === 'password';
    loginPassword.type = show ? 'text' : 'password';
    this.textContent = show ? 'Hide' : 'Show';
    this.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  /* ------------------------------------------------------------------
     Toast
  ------------------------------------------------------------------ */
  let toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', !!isError);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, isError ? 5200 : 3200);
  }

  /* ------------------------------------------------------------------
     Admin: login / logout
  ------------------------------------------------------------------ */
  function authHeaders(extra) {
    return Object.assign({ Authorization: 'Bearer ' + state.token }, extra || {});
  }

  function enterAdmin() {
    state.admin = true;
    document.body.classList.add('is-admin');
    adminBar.hidden = false;
    menuAdminLabel.textContent = 'Exit Admin Mode';
    applyEditable();
  }

  async function exitAdmin(callServer) {
    if (state.dirty || state.saveTimer) await saveNow();
    const token = state.token;
    state.admin = false;
    state.token = null;
    try { sessionStorage.removeItem('mq_admin_token'); } catch (e) { /* ignore */ }
    document.body.classList.remove('is-admin');
    adminBar.hidden = true;
    menuAdminLabel.textContent = 'Admin Login';
    applyEditable();
    if (callServer && token) {
      fetch('api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(function () {});
    }
  }

  function sessionExpired() {
    state.admin = false;
    state.token = null;
    state.dirty = false;
    try { sessionStorage.removeItem('mq_admin_token'); } catch (e) { /* ignore */ }
    document.body.classList.remove('is-admin');
    adminBar.hidden = true;
    menuAdminLabel.textContent = 'Admin Login';
    applyEditable();
    toast('Your admin session expired. Please log in again.', true);
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginError.hidden = true;
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Signing in…';
    try {
      const res = await fetch('api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword.value })
      });
      let data = {};
      try { data = await res.json(); } catch (err) { /* non-JSON response */ }
      if (res.ok && data.token) {
        state.token = data.token;
        try { sessionStorage.setItem('mq_admin_token', data.token); } catch (err) { /* ignore */ }
        closeModal(loginModal);
        loginPassword.value = '';
        enterAdmin();
        toast('Admin mode on. Click any text to edit it, or use the photo buttons.');
      } else if (res.status === 404 || res.status === 405) {
        loginError.textContent = 'The admin server is not available. Run the site with “npm start” to use admin features.';
        loginError.hidden = false;
      } else {
        loginError.textContent = data.error || 'Login failed. Please try again.';
        loginError.hidden = false;
        loginPassword.select();
      }
    } catch (err) {
      loginError.textContent = 'Could not reach the server. Check your connection and try again.';
      loginError.hidden = false;
    } finally {
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Sign in';
    }
  });

  /* ------------------------------------------------------------------
     Admin: saving
  ------------------------------------------------------------------ */
  function setStatus(text, isError) {
    saveStatus.textContent = text;
    saveStatus.classList.toggle('error', !!isError);
  }

  function scheduleSave() {
    state.dirty = true;
    setStatus('Unsaved changes…');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 800);
  }

  async function saveNow() {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    if (!state.admin) return;
    if (state.saving) { state.dirty = true; return; }
    state.saving = true;
    state.dirty = false;
    setStatus('Saving…');
    try {
      const res = await fetch('api/content', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ slides: state.slides })
      });
      if (res.status === 401) { state.saving = false; sessionExpired(); return; }
      if (!res.ok) throw new Error('save failed');
      setStatus('All changes saved');
    } catch (err) {
      state.dirty = true;
      setStatus('Save failed. Will retry on your next edit.', true);
    } finally {
      state.saving = false;
    }
    if (state.dirty && !saveStatus.classList.contains('error')) saveNow();
  }

  window.addEventListener('beforeunload', function (e) {
    if (state.admin && (state.dirty || state.saveTimer)) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ------------------------------------------------------------------
     Admin: inline text editing
  ------------------------------------------------------------------ */
  function setPath(obj, path, value) {
    const parts = path.split('.');
    let target = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      target = target[parts[i]];
      if (target == null) return;
    }
    target[parts[parts.length - 1]] = value;
  }

  function slideOf(el) {
    const s = el.closest('.slide');
    return s ? parseInt(s.dataset.index, 10) : -1;
  }

  container.addEventListener('input', function (e) {
    const el = e.target.closest('[data-field]');
    if (!el || !state.admin) return;
    const idx = slideOf(el);
    const slide = state.slides[idx];
    if (!slide) return;
    const value = el.textContent.replace(/\s+/g, ' ').trim();
    setPath(slide, el.dataset.field, value);
    const row = el.closest('.info-row');
    if (row) row.classList.toggle('is-blank', !value);
    scheduleSave();
  });

  container.addEventListener('focusout', function (e) {
    const el = e.target.closest && e.target.closest('[data-field]');
    if (!el || !state.admin) return;
    if (!el.textContent.trim()) el.textContent = '';
    if (el.dataset.field === 'title') refreshChips();
  });

  container.addEventListener('keydown', function (e) {
    const el = e.target.closest && e.target.closest('[data-field]');
    if (!el || !state.admin) return;
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.blur(); }
    // Keep scroll-snap navigation keys from hijacking text cursor movement.
    e.stopPropagation();
  }, true);

  container.addEventListener('paste', function (e) {
    const el = e.target.closest && e.target.closest('[data-field]');
    if (!el || !state.admin) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
  });

  // Broken images (e.g., deleted upload) fall back to the placeholder look.
  container.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.target.style.display = 'none';
  }, true);

  /* ------------------------------------------------------------------
     Click delegation: navigation + photo actions
  ------------------------------------------------------------------ */
  container.addEventListener('click', function (e) {
    const go = e.target.closest('[data-go]');
    if (go) {
      const v = go.dataset.go;
      if (v === 'next') goToSlide(state.current + 1);
      else goToSlide(parseInt(v, 10));
      return;
    }

    const act = e.target.closest('[data-act]');
    if (!act || !state.admin) return;
    const idx = slideOf(act);
    if (idx < 0) return;

    if (act.dataset.act === 'upload') {
      state.uploadIndex = idx;
      fileInput.value = '';
      fileInput.click();
    } else if (act.dataset.act === 'remove') {
      if (!confirm('Remove the photo or video from this slide?')) return;
      state.slides[idx].image = null;
      state.slides[idx].video = null;
      state.slides[idx].poster = null;
      rerenderSlide(idx);
      scheduleSave();
    }
  });

  /* ------------------------------------------------------------------
     Admin: image upload
  ------------------------------------------------------------------ */
  function loadBitmap(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
      img.src = url;
    });
  }

  async function prepareImage(file) {
    const img = await loadBitmap(file);
    const MAX = 2560;
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('encode failed')); }, 'image/jpeg', 0.92);
    });
  }

  function sendVideo(file, onProgress) {
    return new Promise(function (resolve, reject) {
      const x = new XMLHttpRequest();
      x.open('POST', 'api/upload-video');
      const h = authHeaders({ 'Content-Type': file.type || 'video/mp4' });
      Object.keys(h).forEach(function (k) { x.setRequestHeader(k, h[k]); });
      x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
      x.onerror = function () { reject(new Error('Upload failed. Check your connection.')); };
      x.onload = function () {
        let data = {};
        try { data = JSON.parse(x.responseText); } catch (_) { /* ignore */ }
        if (x.status === 401) return reject(Object.assign(new Error('auth'), { auth: true }));
        if (x.status >= 200 && x.status < 300 && data.url) resolve(data);
        else reject(new Error(data.error || 'Upload failed.'));
      };
      x.send(file);
    });
  }

  fileInput.addEventListener('change', async function () {
    const file = fileInput.files && fileInput.files[0];
    const idx = state.uploadIndex;
    state.uploadIndex = null;
    if (!file || idx == null || !state.slides[idx]) return;
    const isVideo = /^video\//.test(file.type);
    if (!isVideo && !/^image\//.test(file.type)) { toast('Please choose a photo or a video.', true); return; }

    try {
      if (isVideo) {
        toast('Uploading video…');
        const data = await sendVideo(file, function (p) {
          toast(p < 100 ? 'Uploading video… ' + p + '%' : 'Optimizing video for smooth 60 fps playback. This can take a minute…');
        });
        state.slides[idx].video = data.url;
        state.slides[idx].poster = data.poster || null;
        state.slides[idx].image = null;
        toast(data.optimized ? 'Video added and optimized.' : 'Video added. Install ffmpeg on the server to optimize it.');
      } else {
        toast('Uploading photo…');
        const blob = await prepareImage(file);
        const res = await fetch('api/upload', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'image/jpeg' }),
          body: blob
        });
        if (res.status === 401) { sessionExpired(); return; }
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
        state.slides[idx].image = data.url;
        state.slides[idx].video = null;
        state.slides[idx].poster = null;
        toast('Photo added.');
      }
      rerenderSlide(idx);
      syncVideos();
      scheduleSave();
    } catch (err) {
      if (err.auth) { sessionExpired(); return; }
      toast(err.message === 'unreadable image' ? 'That file could not be read as an image.' : (err.message || 'Upload failed.'), true);
    }
  });

  // Only the visible slide plays its video, so every clip stays smooth.
  function syncVideos() {
    container.querySelectorAll('.slide').forEach(function (el, i) {
      const v = el.querySelector('video.bg-video');
      if (!v) return;
      if (i === state.current) { const p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else v.pause();
    });
  }

  /* ------------------------------------------------------------------
     Admin: add / delete slide, done
  ------------------------------------------------------------------ */
  function uid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  $('#admin-add').addEventListener('click', function () {
    const cur = state.slides[state.current];
    const section = cur ? cur.section : 'Destinations';
    const place = section && section !== 'Introduction' && section !== 'Essentials' ? section : 'Marinduque';
    const slide = {
      id: uid(), type: 'spot', section: section,
      tag: 'Destination • ' + place, title: 'New destination',
      subtitle: 'Write a short description of this place.',
      category: 'Destination', location: '', howToGet: '', whatToDo: '', tip: '',
      image: null, caption: ''
    };
    state.slides.splice(state.current + 1, 0, slide);
    const target = state.current + 1;
    renderAll();
    goToSlide(target, true);
    scheduleSave();
    toast('New slide added. Click the text to edit it.');
  });

  $('#admin-delete').addEventListener('click', function () {
    if (state.slides.length <= 1) { toast('At least one slide must remain.', true); return; }
    const slide = state.slides[state.current];
    if (!confirm('Delete the slide “' + (slide.title || 'Untitled') + '”? This cannot be undone.')) return;
    state.slides.splice(state.current, 1);
    state.current = Math.min(state.current, state.slides.length - 1);
    renderAll();
    goToSlide(state.current, true);
    scheduleSave();
    toast('Slide deleted.');
  });

  $('#admin-exit').addEventListener('click', async function () {
    await exitAdmin(true);
    toast('Changes saved. Admin mode off.');
  });

  /* ------------------------------------------------------------------
     Boot
  ------------------------------------------------------------------ */
  async function loadSlides() {
    try {
      const res = await fetch('api/content', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.slides) && data.slides.length) return data.slides;
      }
    } catch (e) { /* fall through to static copy */ }
    try {
      const res = await fetch('content.default.json');
      const data = await res.json();
      if (data && Array.isArray(data.slides)) return data.slides;
    } catch (e) { /* nothing else to try */ }
    return [];
  }

  async function restoreSession() {
    if (!state.token) return;
    try {
      const res = await fetch('api/session', { headers: authHeaders() });
      const data = await res.json();
      if (data && data.admin) { enterAdmin(); return; }
    } catch (e) { /* ignore */ }
    state.token = null;
    try { sessionStorage.removeItem('mq_admin_token'); } catch (e) { /* ignore */ }
  }

  async function boot() {
    try { const r = await fetch('sources.json'); if (r.ok) SOURCES = await r.json(); } catch (e) { /* sources are optional */ }
    state.slides = await loadSlides();
    if (!state.slides.length) {
      container.innerHTML = '<section class="slide"><div class="slide-inner" style="display:flex;align-items:center;justify-content:center;text-align:center">' +
        '<p class="slide-lead">The presentation content could not be loaded. Please refresh the page.</p></div></section>';
      return;
    }
    renderAll();
    await restoreSession();
  }

  boot();
})();
