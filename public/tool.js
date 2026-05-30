'use strict';

(function () {
  const ROOT_ID = 'snap-tools';
  const DEFAULT_API = 'https://snapbackend-production.up.railway.app/api';

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  function resolveApiBase() {
    const fromAttr = root.getAttribute('data-api-base');
    if (fromAttr) return fromAttr.replace(/\/$/, '');

    const { hostname, port } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (port === '5000') return '/api';
      if (port === '5173' || port === '4173') return `http://${hostname}:5000/api`;
      return 'http://127.0.0.1:5000/api';
    }
    return DEFAULT_API;
  }

  const API = resolveApiBase();
  let videoState = { videos: [], qualities: [], selectedUrl: '' };

  const $ = (id) => document.getElementById(id);

  root.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      root.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      $('panel-' + btn.dataset.tab).classList.add('active');
    });
  });

  const loaderOn = (id) => $(id).classList.add('on');
  const loaderOff = (id) => $(id).classList.remove('on');
  const errShow = (id, msg) => {
    const el = $(id);
    el.textContent = msg;
    el.classList.remove('hide');
  };
  const errHide = (id) => $(id).classList.add('hide');

  async function apiGet(path) {
    const res = await fetch(API + path);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
    return data;
  }

  function getDownloadUrl(mediaUrl) {
    return API + '/download?url=' + encodeURIComponent(mediaUrl);
  }

  function fmt(n) {
    if (n == null || n === '—') return '—';
    const num = Number(String(n).replace(/,/g, ''));
    return Number.isNaN(num) ? String(n) : num.toLocaleString();
  }

  function animateNum(el, target, dur) {
    const num = Number(String(target).replace(/,/g, ''));
    if (Number.isNaN(num)) {
      el.textContent = target;
      return;
    }
    const t0 = performance.now();
    (function tick(ts) {
      const p = Math.min((ts - t0) / dur, 1);
      el.textContent = fmt(Math.floor(num * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmt(num);
    })(t0);
  }

  function dlFeedback(btn, orig) {
    btn.innerHTML = 'Done';
    btn.style.background = '#48BB78';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.background = '';
      btn.style.color = '';
    }, 2200);
  }

  function onlyVideoQualities(list) {
    return (list || []).filter((q) => q.type === 'video' && q.url);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function renderQualityGrid(qualities) {
    const grid = $('quality-grid');
    grid.innerHTML = '';
    videoState.qualities = onlyVideoQualities(qualities);

    const unique = [];
    const seen = new Set();
    for (const q of [...videoState.qualities].sort((a, b) => (a.bytes || 0) - (b.bytes || 0))) {
      if (!q.url || seen.has(q.url)) continue;
      seen.add(q.url);
      unique.push(q);
    }

    if (!unique.length) {
      grid.innerHTML =
        '<p style="grid-column:1/-1;color:var(--text2);font-size:0.76rem;padding:6px;">One video quality available for this link.</p>';
      return;
    }

    unique.forEach((q, index) => {
      const isBest = index === unique.length - 1;
      const card = document.createElement('div');
      card.className = 'q-card' + (isBest ? ' selected' : '');
      const displayLabel = q.label + (q.note ? ' · ' + q.note : '');

      card.dataset.url = q.url;
      card.dataset.label = displayLabel;
      card.innerHTML =
        (isBest ? '<div class="q-best">Best</div>' : '') +
        '<div class="q-check">OK</div>' +
        '<div class="q-badge">' + escapeHtml(q.label) + '</div>' +
        '<span class="q-name">Video</span>' +
        '<span class="q-size">' + escapeHtml(q.size || '—') + '</span>';

      card.addEventListener('click', () => {
        root.querySelectorAll('.q-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        videoState.selectedUrl = card.dataset.url;
        $('dl-main-btn').textContent = 'Download ' + card.dataset.label;
      });

      grid.appendChild(card);
    });

    const best = unique[unique.length - 1];
    videoState.selectedUrl = best.url;
    $('dl-main-btn').textContent =
      'Download ' + best.label + (best.size ? ' - ' + best.size : '');
  }

  function showVideoPreview(video) {
    const wrap = root.querySelector('.vid-preview');
    let player = $('v-player');
    if (!player) {
      player = document.createElement('video');
      player.id = 'v-player';
      player.controls = true;
      player.playsInline = true;
      player.setAttribute('playsinline', '');
      player.style.cssText =
        'width:100%;max-height:min(50vh,320px);background:#000;display:block;border-radius:8px';
      wrap.innerHTML = '';
      wrap.appendChild(player);
      const title = document.createElement('p');
      title.id = 'v-title';
      title.style.marginTop = '8px';
      wrap.appendChild(title);
    }
    player.src = video.mediaUrl;
    player.poster = video.previewUrl || '';
    $('v-title').textContent =
      video.collectionTitle || '@' + (video.username || 'snapchat');
  }

  $('v-paste').addEventListener('click', async () => {
    try {
      $('v-url').value = await navigator.clipboard.readText();
    } catch {
      $('v-url').focus();
    }
  });

  async function doVideo() {
    const input = $('v-url').value.trim();
    errHide('v-err');
    $('v-result').classList.add('hide');
    videoState = { videos: [], qualities: [], selectedUrl: '' };

    if (!input) {
      errShow('v-err', 'Please paste a Snapchat video URL.');
      return;
    }
    if (!input.includes('snapchat.com')) {
      errShow('v-err', 'Enter a valid Snapchat URL.');
      return;
    }

    loaderOn('v-load');
    try {
      const data = await apiGet('/fetch/video?input=' + encodeURIComponent(input));
      if (!data.found) {
        errShow('v-err', data.message || 'Video not found.');
        return;
      }
      if (!data.videos?.length) {
        errShow('v-err', 'No video found.');
        return;
      }

      const video = data.videos[0];
      videoState.videos = data.videos;
      showVideoPreview({ ...video, username: data.username });

      let qualities = [];
      try {
        const qRes = await apiGet('/qualities?url=' + encodeURIComponent(video.mediaUrl));
        qualities = qRes.qualities || [];
      } catch {
        qualities = video.qualities || [];
      }
      qualities = onlyVideoQualities(qualities);
      if (!qualities.length) {
        qualities = [
          { label: '1080p', url: video.mediaUrl, size: '', type: 'video', bytes: 0 },
        ];
      }

      renderQualityGrid(qualities);
      $('v-result').classList.remove('hide');
    } catch (e) {
      errShow('v-err', e.message || 'API error. Check backend URL.');
    } finally {
      loaderOff('v-load');
    }
  }

  $('v-btn').addEventListener('click', doVideo);
  $('v-url').addEventListener('keydown', (e) => e.key === 'Enter' && doVideo());

  $('dl-main-btn').addEventListener('click', function () {
    const url =
      videoState.selectedUrl || root.querySelector('.q-card.selected')?.dataset?.url;
    if (!url) {
      errShow('v-err', 'Select a quality first.');
      return;
    }
    const orig = this.textContent;
    window.location.href = getDownloadUrl(url);
    dlFeedback(this, orig);
  });

  async function doProfile() {
    const input = $('p-user').value.trim();
    errHide('p-err');
    $('p-result').classList.add('hide');
    if (input.length < 2) {
      errShow('p-err', 'Enter a valid username.');
      return;
    }
    loaderOn('p-load');
    try {
      const data = await apiGet('/fetch/profile?input=' + encodeURIComponent(input));
      if (!data.found) {
        errShow('p-err', data.message || 'Profile not found.');
        return;
      }
      const p = data.profile;
      $('p-name').textContent = p.displayName;
      $('p-handle').textContent = '@' + p.username;
      if (p.profilePictureUrl) {
        $('p-avatar').src = p.profilePictureUrl;
        $('p-avatar').style.display = 'block';
        $('p-avatar-fallback').style.display = 'none';
      } else {
        $('p-avatar').style.display = 'none';
        $('p-avatar-fallback').style.display = 'flex';
        $('p-avatar-fallback').textContent = p.username[0]?.toUpperCase() || 'S';
      }
      $('p-score').textContent = p.subscriberCountFormatted;
      $('p-snaps').textContent = String(p.highlightItemCount ?? 0);
      $('p-friends').textContent = p.hasSpotlight ? 'Yes' : '—';
      $('p-result').dataset.profileUrl = p.profileUrl;
      $('p-result').classList.remove('hide');
    } catch (e) {
      errShow('p-err', e.message);
    } finally {
      loaderOff('p-load');
    }
  }

  $('p-btn').addEventListener('click', doProfile);
  $('p-user').addEventListener('keydown', (e) => e.key === 'Enter' && doProfile());
  $('p-save').addEventListener('click', function () {
    if ($('p-result').classList.contains('hide')) return;
    const text = [
      $('p-name').textContent,
      $('p-handle').textContent,
      'Subscribers: ' + $('p-score').textContent,
      $('p-result').dataset.profileUrl,
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = $('p-handle').textContent.replace('@', '') + '-profile.txt';
    a.click();
    dlFeedback(this, 'Save Info');
  });
  $('p-copy').addEventListener('click', function () {
    const url = $('p-result').dataset.profileUrl;
    if (!url) return;
    navigator.clipboard.writeText(url).catch(() => {});
    const o = this.textContent;
    this.textContent = 'Copied!';
    setTimeout(() => (this.textContent = o), 2000);
  });

  let lastScoreText = '';
  async function doScore() {
    const input = $('sc-user').value.trim();
    errHide('sc-err');
    $('sc-result').classList.add('hide');
    if (input.length < 2) {
      errShow('sc-err', 'Enter a valid username.');
      return;
    }
    loaderOn('sc-load');
    try {
      const data = await apiGet('/fetch/score?input=' + encodeURIComponent(input));
      if (!data.found) {
        errShow('sc-err', data.message || 'Not found.');
        return;
      }
      $('sc-uname').textContent = '@' + data.username;
      $('sc-rank').textContent = data.rank;
      $('sc-sent').textContent = data.breakdown.subscribers;
      $('sc-recv').textContent = data.breakdown.accountAge;
      $('sc-stories').textContent = data.breakdown.highlights;
      $('sc-age').textContent = data.breakdown.spotlightVideos + ' videos';
      $('sc-num').textContent = data.ring.value;
      root.querySelector('.score-lbl').textContent = data.ring.label;
      lastScoreText =
        data.displayName +
        ' (@' +
        data.username +
        ')\n' +
        data.ring.label +
        ': ' +
        data.ring.value;
      $('sc-result').classList.remove('hide');
      const num = Number(String(data.ring.value).replace(/[^0-9.]/g, ''));
      if (!Number.isNaN(num) && num > 0) animateNum($('sc-num'), num, 900);
    } catch (e) {
      errShow('sc-err', e.message);
    } finally {
      loaderOff('sc-load');
    }
  }

  $('sc-btn').addEventListener('click', doScore);
  $('sc-user').addEventListener('keydown', (e) => e.key === 'Enter' && doScore());
  $('sc-copy').addEventListener('click', function () {
    if (!lastScoreText) return;
    navigator.clipboard.writeText(lastScoreText).catch(() => {});
    const o = this.textContent;
    this.textContent = 'Copied!';
    setTimeout(() => (this.textContent = o), 2000);
  });

  async function doStory() {
    const input = $('st-user').value.trim();
    errHide('st-err');
    const grid = $('st-grid');
    grid.style.display = 'none';
    grid.innerHTML = '';
    if (input.length < 2) {
      errShow('st-err', 'Enter a valid username.');
      return;
    }
    loaderOn('st-load');
    try {
      const data = await apiGet('/fetch/story?input=' + encodeURIComponent(input));
      if (!data.found) {
        errShow('st-err', data.message || 'No stories.');
        return;
      }
      const snaps = (data.collections || []).flatMap((c) =>
        c.snaps.map((s) => ({ ...s, collectionTitle: c.title }))
      );
      if (!snaps.length) {
        errShow('st-err', 'No stories found.');
        return;
      }
      snaps.forEach((snap) => {
        const item = document.createElement('div');
        item.className = 'story-item';
        const thumb = snap.previewUrl || snap.mediaUrl;
        const isVideo = snap.type === 'video';
        item.innerHTML = isVideo
          ? '<video src="' +
            escapeHtml(snap.mediaUrl) +
            '" poster="' +
            escapeHtml(thumb || '') +
            '" muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video><div class="story-foot"><div class="s-dl" title="Download"></div></div>'
          : '<img src="' +
            escapeHtml(thumb) +
            '" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" /><div class="story-foot"><div class="s-dl" title="Download"></div></div>';
        item.querySelector('.s-dl').addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.href = getDownloadUrl(snap.mediaUrl);
        });
        grid.appendChild(item);
      });
      grid.style.display = 'grid';
    } catch (e) {
      errShow('st-err', e.message);
    } finally {
      loaderOff('st-load');
    }
  }

  $('st-btn').addEventListener('click', doStory);
  $('st-user').addEventListener('keydown', (e) => e.key === 'Enter' && doStory());
})();
