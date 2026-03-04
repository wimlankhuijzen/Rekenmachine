let currentInput = '';
let expression = '';
let justCalculated = false;

const resultEl = document.getElementById('result');
const expressionEl = document.getElementById('expression');

function updateDisplay(value) {
  resultEl.textContent = value;
}

function inputDigit(digit) {
  if (justCalculated) {
    currentInput = '';
    expression = '';
    justCalculated = false;
  }
  if (currentInput.length >= 12) return;
  currentInput += digit;
  updateDisplay(currentInput);
}

function inputDot() {
  if (justCalculated) {
    currentInput = '0';
    expression = '';
    justCalculated = false;
  }
  if (currentInput.includes('.')) return;
  if (currentInput === '') currentInput = '0';
  currentInput += '.';
  updateDisplay(currentInput);
}

function inputOperator(op) {
  justCalculated = false;

  if (currentInput === '' && expression !== '') {
    // Replace last operator
    expression = expression.slice(0, -1) + op;
    expressionEl.textContent = formatExpression(expression);
    return;
  }

  if (currentInput !== '') {
    expression += currentInput + op;
    currentInput = '';
  }

  expressionEl.textContent = formatExpression(expression);
  updateDisplay('0');
}

function calculate() {
  if (currentInput !== '') {
    expression += currentInput;
  }
  if (expression === '') return;

  expressionEl.textContent = formatExpression(expression) + ' =';

  try {
    const result = Function('"use strict"; return (' + expression + ')')();
    const rounded = parseFloat(result.toFixed(10));
    updateDisplay(rounded);
    currentInput = String(rounded);
    expression = '';
    justCalculated = true;
  } catch {
    updateDisplay('Error');
    currentInput = '';
    expression = '';
  }
}

function clearAll() {
  currentInput = '';
  expression = '';
  justCalculated = false;
  expressionEl.textContent = '';
  updateDisplay('0');
}

function toggleSign() {
  if (currentInput === '' || currentInput === '0') return;
  if (currentInput.startsWith('-')) {
    currentInput = currentInput.slice(1);
  } else {
    currentInput = '-' + currentInput;
  }
  updateDisplay(currentInput);
}

function percent() {
  if (currentInput === '') return;
  currentInput = String(parseFloat(currentInput) / 100);
  updateDisplay(currentInput);
}

function formatExpression(expr) {
  return expr.replace(/\*/g, '×').replace(/\//g, '÷');
}

// ── Wind & Kitesurf Widget ─────────────────────────────────────────────────
// Strand Horst, Harderwijk — south shore of Wolderwijd lake
const LAT = 52.345;
const LON = 5.578;

// Beaufort scale (m/s thresholds)
function beaufort(ms) {
  const scale = [0.3,1.6,3.4,5.5,8,10.8,13.9,17.2,20.8,24.5,28.5,32.7];
  return scale.findIndex(t => ms < t);
}

function degToCardinal(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// Kitesurf likelihood for Strand Horst (south shore, lake to the north)
// Best: W, SW, NW (side/cross-onshore)  Worst: S (offshore — dangerous!)
function kiteLikelihood(speedMs, dirDeg) {
  // Speed factor
  let sf;
  if (speedMs < 3)       sf = 0.0;
  else if (speedMs < 5)  sf = 0.25;
  else if (speedMs < 7)  sf = 0.60;
  else if (speedMs < 10) sf = 0.90;
  else if (speedMs < 14) sf = 1.00;
  else if (speedMs < 18) sf = 0.80;
  else if (speedMs < 22) sf = 0.45;
  else                   sf = 0.10;

  // Direction factor — shore faces N, lake is N
  // S (180°) = offshore = dangerous
  // N (0°/360°) = onshore = safe but rough
  // W/NW/SW = ideal cross/cross-onshore
  const d = dirDeg % 360;
  let df;
  if      (d >= 247 && d < 293) df = 1.00; // W  — side-shore
  else if (d >= 203 && d < 247) df = 0.95; // SW — cross-onshore
  else if (d >= 293 && d < 338) df = 0.95; // NW — cross-onshore
  else if (d >= 338 || d < 23)  df = 0.70; // N  — onshore (safe)
  else if (d >= 23  && d < 68)  df = 0.55; // NE — onshore-ish
  else if (d >= 68  && d < 113) df = 0.60; // E  — side-shore
  else if (d >= 113 && d < 158) df = 0.30; // SE — cross-offshore
  else                           df = 0.05; // S  — offshore, avoid!

  return Math.round(sf * df * 100);
}

function kiteVerdict(pct, dirDeg) {
  const cardinal = degToCardinal(dirDeg);
  if (pct >= 80) return `Great conditions! Wind from ${cardinal} — go fly!`;
  if (pct >= 60) return `Good conditions. Wind from ${cardinal}.`;
  if (pct >= 40) return `Marginal. Wind from ${cardinal} — check gusts.`;
  if (pct >= 20) return `Unlikely. Wind from ${cardinal} is not ideal.`;
  const d = dirDeg % 360;
  if (d >= 158 && d < 203) return `South wind — offshore! Do NOT kite.`;
  return `Not suitable. Too light or too strong.`;
}

function kiteColor(pct) {
  if (pct >= 70) return 'linear-gradient(90deg,#27ae60,#2ecc71)';
  if (pct >= 40) return 'linear-gradient(90deg,#f39c12,#f5a623)';
  return 'linear-gradient(90deg,#e94560,#c0392b)';
}

async function fetchWind() {
  const verdict = document.getElementById('kite-verdict');
  verdict.textContent = 'Fetching wind data…';

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
    `&hourly=wind_speed_10m,wind_direction_10m` +
    `&wind_speed_unit=ms&timezone=Europe%2FAmsterdam&forecast_days=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();

    const cur = data.current;
    const speedMs  = cur.wind_speed_10m;
    const gustMs   = cur.wind_gusts_10m;
    const dirDeg   = cur.wind_direction_10m;
    const knots    = (speedMs * 1.94384).toFixed(1);

    // Find current hour index in hourly array
    const nowStr = cur.time.slice(0, 13); // "2026-03-01T14"
    const idx = data.hourly.time.findIndex(t => t.startsWith(nowStr));

    // Average likelihood over next 2 hours
    let totalPct = 0, count = 0;
    for (let i = Math.max(0, idx); i <= Math.min(idx + 2, data.hourly.time.length - 1); i++) {
      totalPct += kiteLikelihood(data.hourly.wind_speed_10m[i], data.hourly.wind_direction_10m[i]);
      count++;
    }
    const avgPct = count > 0 ? Math.round(totalPct / count) : kiteLikelihood(speedMs, dirDeg);

    // Update UI
    document.getElementById('wind-speed').textContent   = speedMs.toFixed(1);
    document.getElementById('wind-gusts').textContent   = gustMs.toFixed(1);
    document.getElementById('wind-knots').textContent   = knots;
    document.getElementById('wind-dir-label').textContent = degToCardinal(dirDeg);
    document.getElementById('compass-deg').textContent  = Math.round(dirDeg) + '°';
    document.getElementById('compass-arrow').style.transform = `rotate(${dirDeg}deg)`;

    const fill = document.getElementById('kite-fill');
    fill.style.width      = avgPct + '%';
    fill.style.background = kiteColor(avgPct);
    document.getElementById('kite-percent').textContent = avgPct + '%';
    document.getElementById('kite-verdict').textContent = kiteVerdict(avgPct, dirDeg);

    const now = new Date();
    document.getElementById('wind-updated').textContent =
      `Updated ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  } catch (e) {
    document.getElementById('kite-verdict').textContent = 'Could not load wind data. Check connection.';
  }
}

// Fetch on load, then refresh every 10 minutes
fetchWind();
setInterval(fetchWind, 10 * 60 * 1000);

// ── Keyboard support
document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
  else if (e.key === '.') inputDot();
  else if (e.key === '+') inputOperator('+');
  else if (e.key === '-') inputOperator('-');
  else if (e.key === '*') inputOperator('*');
  else if (e.key === '/') { e.preventDefault(); inputOperator('/'); }
  else if (e.key === 'Enter' || e.key === '=') calculate();
  else if (e.key === 'Escape') clearAll();
  else if (e.key === 'Backspace') {
    currentInput = currentInput.slice(0, -1);
    updateDisplay(currentInput || '0');
  }
});
