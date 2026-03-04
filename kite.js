/* ============================================
   Horst Kiters Dashboard — JavaScript
   ============================================ */

const SPOTS = [
  {
    name: 'Strand Horst',
    location: 'Harderwijk',
    lat: 52.374,
    lon: 5.534,
    home: true,
    // Best wind directions: N, NNO, NO, NNW + Z, ZZW, ZW (secret spot bij zuidwind)
    // Slecht: O (te oost), WSW (~247°)
    goodDirs: [[295, 360], [0, 70], [160, 245]],
  },
  {
    name: 'Elburg',
    location: 'Gelderland',
    lat: 52.447,
    lon: 5.847,
    home: false,
    // Best: N, NW, W
    goodDirs: [[270, 360], [0, 30]],
  },
  {
    name: 'Muiderberg',
    location: 'Noord-Holland',
    lat: 52.335,
    lon: 5.108,
    home: false,
    // Best: W, ZW, NW
    goodDirs: [[200, 320]],
  },
  {
    name: 'IJmuiden',
    location: 'Noord-Holland',
    lat: 52.459,
    lon: 4.620,
    home: false,
    // Best: W, ZW, NW (zeeschouwing)
    goodDirs: [[200, 315]],
  },
];

const CACHE_KEY = 'kite_cache';
const CACHE_TTL = 15 * 60 * 1000; // 15 min

// Photos from the WhatsApp folder
const GALLERY_PHOTOS = [
  '00052086-PHOTO-2025-12-24-15-14-34.jpg',
  '00052100-PHOTO-2025-12-24-15-32-47.jpg',
  '00052137-PHOTO-2025-12-25-11-13-52.jpg',
  '00052162-PHOTO-2025-12-26-11-34-19.jpg',
  '00052235-PHOTO-2025-12-28-10-12-38.jpg',
  '00052303-PHOTO-2025-12-29-08-31-21.jpg',
  '00052340-PHOTO-2025-12-30-08-48-40.jpg',
  '00052394-PHOTO-2025-12-31-08-49-30.jpg',
  '00052456-PHOTO-2026-01-01-08-44-01.jpg',
  '00052510-PHOTO-2026-01-01-12-08-07.jpg',
  '00052550-PHOTO-2026-01-01-13-23-10.jpg',
  '00052611-PHOTO-2026-01-02-09-13-02.jpg',
  '00052640-PHOTO-2026-01-03-16-16-16.jpg',
  '00052642-PHOTO-2026-01-04-09-35-02.jpg',
  '00052652-PHOTO-2026-01-04-11-51-41.jpg',
  '00052678-PHOTO-2026-01-05-07-58-26.jpg',
];

// All fetched data keyed by spot index
let allData = {};
let currentDay = 0;

// ── Utilities ──────────────────────────────

function degToCompass(deg) {
  const dirs = ['N','NNO','NO','ONO','O','OZO','ZO','ZZO','Z','ZZW','ZW','WZW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function kiteScore(kn) {
  if (kn >= 12 && kn <= 25) return 'good';
  if (kn >= 8  && kn <= 35) return 'marginal';
  return 'bad';
}

function kiteLabel(score) {
  return { good: 'Goed', marginal: 'Marginaal', bad: 'Slecht' }[score];
}

function isDirGood(deg, ranges) {
  return ranges.some(([lo, hi]) => deg >= lo && deg <= hi);
}

function spotScore(kn, deg, ranges) {
  const base = kiteScore(kn);
  if (base === 'bad') return 'bad';
  if (base === 'good' && isDirGood(deg, ranges)) return 'good';
  return 'marginal';
}

function maxKnInRange(hours, isoTimes) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);
  let max = 0;
  isoTimes.forEach((t, i) => {
    const d = new Date(t);
    if (d >= todayStart && d <= todayEnd) max = Math.max(max, hours[i]);
  });
  return max;
}

function getDayData(data, dayOffset) {
  const now = new Date();
  const target = new Date(now);
  target.setDate(target.getDate() + dayOffset);
  const yyyymmdd = target.toISOString().slice(0, 10);

  const times = data.hourly.time;
  const speeds = data.hourly.wind_speed_10m;
  const gusts  = data.hourly.wind_gusts_10m;
  const dirs   = data.hourly.wind_direction_10m;

  const indices = times.reduce((acc, t, i) => {
    if (t.startsWith(yyyymmdd)) acc.push(i);
    return acc;
  }, []);

  return { indices, times, speeds, gusts, dirs };
}

function formatDate(dayOffset) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Fetch ──────────────────────────────────

async function fetchSpotData(spot) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}` +
    `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability` +
    `&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover` +
    `&wind_speed_unit=kn&forecast_days=4&timezone=Europe%2FAmsterdam`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function refreshAll() {
  document.getElementById('last-updated').textContent = 'Bezig met laden…';
  localStorage.removeItem(CACHE_KEY);
  await loadAll();
}

async function loadAll() {
  // Check cache
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      allData = cached.data;
      renderAll();
      return;
    }
  } catch (_) {}

  try {
    const results = await Promise.all(SPOTS.map(fetchSpotData));
    allData = {};
    results.forEach((d, i) => { allData[i] = d; });
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: allData }));
    renderAll();
  } catch (err) {
    document.getElementById('last-updated').textContent = 'Fout bij laden: ' + err.message;
    console.error(err);
  }
}

// ── Render ─────────────────────────────────

function renderAll() {
  const now = new Date();
  document.getElementById('last-updated').textContent =
    'Bijgewerkt: ' + now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  renderCurrentConditions();
  renderForecastDay(0);
  renderSpots();
  renderGallery();
  updateDayTabLabels();
}

function renderCurrentConditions() {
  const data = allData[0]; // Strand Horst
  if (!data || !data.current) return;

  const cur = data.current;
  const spd  = Math.round(cur.wind_speed_10m);
  const gust = Math.round(cur.wind_gusts_10m);
  const deg  = Math.round(cur.wind_direction_10m);
  const comp = degToCompass(deg);
  const score = kiteScore(spd);

  // Compass arrow: arrow points where wind blows TO, so rotate = deg + 180
  document.getElementById('compass-arrow').style.transform =
    `translate(-50%, -50%) rotate(${deg}deg)`;

  document.getElementById('cur-speed').textContent = spd;
  document.getElementById('cur-gust').textContent  = gust;
  document.getElementById('cur-dir-label').textContent = comp;
  document.getElementById('cur-deg').textContent = deg + '°';

  const circle = document.getElementById('score-circle');
  circle.className = 'score-circle ' + score;
  document.getElementById('score-value').textContent = spd + ' kn';
  document.getElementById('score-text').textContent  = kiteLabel(score);

  // Extra stats
  if (cur.surface_pressure) {
    document.getElementById('air-pressure').textContent = Math.round(cur.surface_pressure) + ' hPa';
  }
  if (cur.cloud_cover !== undefined) {
    document.getElementById('cloud-cover').textContent = cur.cloud_cover + '%';
  }
  // Water temp: IJsselmeer estimate based on month
  const month = new Date().getMonth(); // 0-11
  const waterTemps = [4,4,6,10,14,18,20,20,17,13,9,5];
  document.getElementById('water-temp').textContent = waterTemps[month] + '°C';

  // Precipitation probability for current hour
  const hourIdx = findCurrentHourIndex(data);
  if (hourIdx !== -1 && data.hourly.precipitation_probability) {
    document.getElementById('precip').textContent = data.hourly.precipitation_probability[hourIdx] + '%';
  }
}

function findCurrentHourIndex(data) {
  const now = new Date();
  const isoHour = now.toISOString().slice(0, 13); // "2026-03-04T12"
  // Convert to local time string format used by Open-Meteo
  const pad = n => String(n).padStart(2, '0');
  const localStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
  return data.hourly.time.findIndex(t => t === localStr);
}

function renderForecastDay(dayOffset) {
  currentDay = dayOffset;
  const data = allData[0];
  if (!data) return;

  const { indices, times, speeds, gusts, dirs } = getDayData(data, dayOffset);
  const now = new Date();
  const nowHour = now.getHours();
  const isToday = dayOffset === 0;

  const chart = document.getElementById('forecast-chart');
  const maxSpeed = Math.max(...indices.map(i => speeds[i]), 1);

  const rows = indices.map(i => {
    const t = new Date(times[i]);
    const h = t.getHours();
    const spd  = Math.round(speeds[i]);
    const gst  = Math.round(gusts[i]);
    const deg  = Math.round(dirs[i]);
    const comp = degToCompass(deg);
    const score = kiteScore(spd);
    const isPast = isToday && h < nowHour;
    const isCurrent = isToday && h === nowHour;
    const barW = Math.round((spd / Math.max(maxSpeed, 35)) * 100);

    return `<div class="hour-row${isPast ? ' past' : ''}${isCurrent ? ' current-hour' : ''}">
      <div class="hr-time">${String(h).padStart(2,'0')}:00</div>
      <div class="hr-speed" style="color:var(--${score === 'good' ? 'good' : score === 'marginal' ? 'marginal' : 'bad'})">${spd} kn</div>
      <div class="hr-bar-wrap">
        <div class="hr-bar"><div class="hr-bar-fill ${score}" style="width:${barW}%"></div></div>
      </div>
      <div class="hr-dir">${comp}</div>
      <div class="hr-gust">gusts ${gst} kn</div>
    </div>`;
  }).join('');

  chart.innerHTML = `<div class="hour-rows">${rows || '<div class="loading-msg">Geen data</div>'}</div>`;

  // Scroll to current hour
  if (isToday) {
    setTimeout(() => {
      const cur = chart.querySelector('.current-hour');
      if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);
  }

  // Summary
  const dayIndices = indices;
  if (dayIndices.length) {
    const maxSpd  = Math.max(...dayIndices.map(i => Math.round(speeds[i])));
    const minSpd  = Math.min(...dayIndices.map(i => Math.round(speeds[i])));
    const maxGust = Math.max(...dayIndices.map(i => Math.round(gusts[i])));
    const goodHours = dayIndices.filter(i => kiteScore(Math.round(speeds[i])) === 'good').length;
    const margHours = dayIndices.filter(i => kiteScore(Math.round(speeds[i])) === 'marginal').length;

    document.getElementById('day-summary').innerHTML = `
      <div class="ds-item"><div class="ds-label">Dag</div><div class="ds-val">${formatDate(dayOffset)}</div></div>
      <div class="ds-item"><div class="ds-label">Min wind</div><div class="ds-val">${minSpd} kn</div></div>
      <div class="ds-item"><div class="ds-label">Max wind</div><div class="ds-val">${maxSpd} kn</div></div>
      <div class="ds-item"><div class="ds-label">Max gust</div><div class="ds-val">${maxGust} kn</div></div>
      <div class="ds-item"><div class="ds-label" style="color:var(--good)">Goede uren</div><div class="ds-val" style="color:var(--good)">${goodHours}u</div></div>
      <div class="ds-item"><div class="ds-label" style="color:var(--marginal)">Marginaal</div><div class="ds-val" style="color:var(--marginal)">${margHours}u</div></div>
    `;
  }
}

function showDay(dayOffset, btn) {
  document.querySelectorAll('.day-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderForecastDay(dayOffset);
}

function updateDayTabLabels() {
  const days = ['tab-1','tab-2','tab-3'];
  days.forEach((id, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    const el = document.getElementById(id);
    if (el) el.textContent = d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' });
  });
}

function renderSpots() {
  const grid = document.getElementById('spots-grid');
  if (!allData[0]) { grid.innerHTML = '<div class="loading-card">Geen data</div>'; return; }

  grid.innerHTML = SPOTS.map((spot, i) => {
    const data = allData[i];
    if (!data || !data.current) return `<div class="spot-card"><div class="sc-name">${spot.name}</div><div style="color:var(--text3);font-size:.8rem;margin-top:8px">Geen data</div></div>`;

    const cur   = data.current;
    const spd   = Math.round(cur.wind_speed_10m);
    const gust  = Math.round(cur.wind_gusts_10m);
    const deg   = Math.round(cur.wind_direction_10m);
    const comp  = degToCompass(deg);
    const score = spotScore(spd, deg, spot.goodDirs);
    const arrowDeg = deg; // arrow points where wind comes FROM

    return `<div class="spot-card ${spot.home ? 'home' : ''} ${score}-spot">
      <div class="sc-top">
        <div>
          <div class="sc-name">${spot.name}</div>
          <div class="sc-loc">${spot.location}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          ${spot.home ? '<span class="sc-home-badge">Thuisspot</span>' : ''}
          <span class="sc-score-badge ${score}">${kiteLabel(score)}</span>
        </div>
      </div>
      <div class="sc-wind">
        <div class="sc-speed" style="color:var(--${score === 'good' ? 'good' : score === 'marginal' ? 'marginal' : 'bad'})">${spd}</div>
        <div class="sc-unit">kn</div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <div class="sc-dir-arrow" style="transform:rotate(${arrowDeg}deg)">↑</div>
          <div class="sc-dir">${comp}</div>
        </div>
      </div>
      <div class="sc-gust">Gusts: ${gust} kn</div>
    </div>`;
  }).join('');
}

function renderGallery() {
  const gallery = document.getElementById('gallery');
  const folder = 'WhatsApp Chat - Horst kiters/';
  gallery.innerHTML = GALLERY_PHOTOS.map(photo =>
    `<img class="gallery-img" src="${folder}${photo}" alt="Kite sessie foto" loading="lazy" onclick="openLightbox('${folder}${photo}')" onerror="this.parentNode.removeChild(this)">`
  ).join('');
}

function openLightbox(src) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  lb.classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});

// ── Init ───────────────────────────────────
loadAll();
