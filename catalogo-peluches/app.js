/* =============================================
   PELUCHES MÁGICOS — Lógica de la aplicación
   Conecta con la API epn-event-manager en :3000
   ============================================= */

const API_BASE = 'http://localhost:3000';

/* ---------- Catálogo de peluches (datos locales) ----------
   Estos datos viven en el frontend. Cada vez que se registra
   uno nuevo via el formulario, se envía un evento CREATE a la
   API y se agrega al array en memoria durante la sesión.
   ---------------------------------------------------------- */
const CATALOG = [
  {
    id: 1, nombre: 'Osito Canela', categoria: 'Osos',
    precio: 14.99, tamano: 'Mediano', stock: 8,
    emoji: '🐻', descripcion: 'Un osito suave y esponjoso color canela, ideal para abrazar en las noches frías. Relleno hipoalergénico.',
  },
  {
    id: 2, nombre: 'Unicornio Iris', categoria: 'Unicornios',
    precio: 22.50, tamano: 'Grande', stock: 5,
    emoji: '🦄', descripcion: 'Unicornio arcoíris con melena de pelo suave y cuerno brillante. Lleva felicidad a cualquier lugar.',
  },
  {
    id: 3, nombre: 'Dino Rex', categoria: 'Dinosaurios',
    precio: 18.00, tamano: 'Grande', stock: 3,
    emoji: '🦕', descripcion: 'Dinosaurio verde gigante con manchas amarillas. Perfecto para los amantes de la prehistoria.',
  },
  {
    id: 4, nombre: 'Gatito Luna', categoria: 'Gatos',
    precio: 11.99, tamano: 'Pequeño', stock: 15,
    emoji: '🐱', descripcion: 'Gatito blanco con manchas grises y ojos grandes bordados. Cabeza extra grande, muy kawaii.',
  },
  {
    id: 5, nombre: 'Conejita Rosa', categoria: 'Conejos',
    precio: 13.50, tamano: 'Mediano', stock: 10,
    emoji: '🐰', descripcion: 'Conejita rosa pastel con orejas largas y un lazo en la cabeza. Suavísima al tacto.',
  },
  {
    id: 6, nombre: 'Panda Mochi', categoria: 'Pandas',
    precio: 19.99, tamano: 'Mediano', stock: 7,
    emoji: '🐼', descripcion: 'Panda redondito con expresión somnoliente. Relleno extra suave que lo hace perfecto como almohada.',
  },
  {
    id: 7, nombre: 'Osito Polar', categoria: 'Osos',
    precio: 16.00, tamano: 'Pequeño', stock: 0,
    emoji: '🐻‍❄️', descripcion: 'Osito polar de pelaje blanco brillante. Incluye bufanda azul removible.',
  },
  {
    id: 8, nombre: 'Dino Pastel', categoria: 'Dinosaurios',
    precio: 24.99, tamano: 'Gigante', stock: 2,
    emoji: '🦖', descripcion: 'Dinosaurio morado gigante, 60 cm de largo. El favorito de los más pequeños de la casa.',
  },
  {
    id: 9, nombre: 'Gato Merlín', categoria: 'Gatos',
    precio: 15.00, tamano: 'Mediano', stock: 6,
    emoji: '😺', descripcion: 'Gato negro con capa de mago incluida y varita. Edición especial colección fantástica.',
  },
  {
    id: 10, nombre: 'Conejo Nieve', categoria: 'Conejos',
    precio: 12.00, tamano: 'Pequeño', stock: 20,
    emoji: '🐇', descripcion: 'Conejo blanco clásico con nariz rosada y patas cortas. Hecho con tela orgánica certificada.',
  },
  {
    id: 11, nombre: 'Unicornio Dorado', categoria: 'Unicornios',
    precio: 29.90, tamano: 'Gigante', stock: 1,
    emoji: '✨', descripcion: 'Unicornio edición premium con cuerno y cascos dorados metalizados. Pieza de colección.',
  },
  {
    id: 12, nombre: 'Panda Chef', categoria: 'Pandas',
    precio: 17.50, tamano: 'Mediano', stock: 4,
    emoji: '🍜', descripcion: 'Panda con gorro y delantal de chef. Viene con accesorios de cocina en miniatura.',
  },
];

let nextId = CATALOG.length + 1;

/* ==========================================
   UTILIDADES
   ========================================== */

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function getActionIcon(action) {
  const map = { CREATE: '🟢', UPDATE: '🟡', DELETE: '🔴', QUERY: '🔵' };
  return map[action] ?? '⚪';
}

function formatDate(str) {
  if (!str) return 'Sin fecha';
  const d = new Date(str);
  if (isNaN(d)) return str;          // si no es parseable, mostramos raw
  return d.toLocaleString('es-EC');
}

function extractTimestamp(ev) {
  return ev.recorded_at ?? ev.timestamp ?? ev.createdAt ?? ev.event_date ?? null;
}

/* ==========================================
   HEALTH CHECK
   ========================================== */

async function checkApiHealth() {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      dot.className  = 'status-dot ok';
      text.textContent = 'API conectada';
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch {
    dot.className  = 'status-dot err';
    text.textContent = 'API sin conexión';
  }
}

/* ==========================================
   CATÁLOGO
   ========================================== */

function buildCard(p) {
  const card = document.createElement('article');
  card.className = 'peluche-card';
  card.dataset.id = p.id;

  const stockBadge = p.stock > 0
    ? `<span class="badge badge-stock">Stock: ${p.stock}</span>`
    : `<span class="badge badge-nostock">Sin stock</span>`;

  const sizeBadge = p.tamano
    ? `<span class="badge badge-size">${p.tamano}</span>`
    : '';

  card.innerHTML = `
    <div class="card-emoji">${p.emoji || '🧸'}</div>
    <div class="card-name">${p.nombre}</div>
    <div class="card-category">${p.categoria}</div>
    <div class="card-price">$${Number(p.precio).toFixed(2)}</div>
    <div class="card-badges">${sizeBadge}${stockBadge}</div>
    <div class="card-footer">
      <button class="btn-detail" data-id="${p.id}">Ver detalle</button>
    </div>
  `;

  card.querySelector('.btn-detail').addEventListener('click', (e) => {
    e.stopPropagation();
    openModal(p);
  });
  card.addEventListener('click', () => openModal(p));
  return card;
}

function renderCatalog(list) {
  const grid  = document.getElementById('catalogGrid');
  const empty = document.getElementById('emptyMsg');
  grid.innerHTML = '';

  if (!list.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.forEach(p => grid.appendChild(buildCard(p)));
}

function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const cat    = document.getElementById('filterCategory').value;
  const size   = document.getElementById('filterSize').value;

  const filtered = CATALOG.filter(p => {
    const matchSearch = !search || p.nombre.toLowerCase().includes(search) || p.categoria.toLowerCase().includes(search);
    const matchCat    = !cat  || p.categoria === cat;
    const matchSize   = !size || p.tamano === size;
    return matchSearch && matchCat && matchSize;
  });

  renderCatalog(filtered);
}

/* ==========================================
   MODAL DE DETALLE
   ========================================== */

let _currentPeluche = null;

function openModal(p) {
  _currentPeluche = p;
  document.getElementById('modalEmoji').textContent = p.emoji || '🧸';
  document.getElementById('modalTitle').textContent = p.nombre;
  document.getElementById('modalDesc').textContent  = p.descripcion || 'Sin descripción.';

  const stockBadge = p.stock > 0
    ? `<span class="badge badge-stock">Stock: ${p.stock}</span>`
    : `<span class="badge badge-nostock">Sin stock</span>`;
  const sizeBadge = p.tamano
    ? `<span class="badge badge-size">${p.tamano}</span>` : '';
  document.getElementById('modalBadges').innerHTML = `
    <span class="badge" style="background:var(--pink-light);color:var(--pink-dark);border-color:var(--pink)">${p.categoria}</span>
    ${sizeBadge}${stockBadge}
  `;

  document.getElementById('modalMeta').innerHTML = `
    <p><span>Precio</span><strong>$${Number(p.precio).toFixed(2)}</strong></p>
    <p><span>Categoría</span><strong>${p.categoria}</strong></p>
    <p><span>Tamaño</span><strong>${p.tamano || '—'}</strong></p>
    <p><span>Stock</span><strong>${p.stock}</strong></p>
  `;

  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  _currentPeluche = null;
}

async function registerQueryEvent(p) {
  try {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source:      'catalogo-web',
        entity:      p.categoria,
        action:      'QUERY',
        title:       p.nombre,
        description: `Consulta del peluche: ${p.nombre}`,
        payload:     { peluche_id: p.id, precio: p.precio, tamano: p.tamano },
      }),
    });

    if (res.ok) {
      showToast(`Consulta de "${p.nombre}" registrada en la API ✅`, 'success');
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(`Error API: ${err.message ?? res.status}`, 'error');
    }
  } catch {
    showToast('No se pudo conectar con la API', 'error');
  }
  closeModal();
}

/* ==========================================
   FORMULARIO — AGREGAR PELUCHE
   ========================================== */

async function handleAddPeluche(e) {
  e.preventDefault();

  const nombre   = document.getElementById('f-nombre').value.trim();
  const categoria= document.getElementById('f-categoria').value;
  const precio   = parseFloat(document.getElementById('f-precio').value);
  const tamano   = document.getElementById('f-tamano').value;
  const stock    = parseInt(document.getElementById('f-stock').value) || 0;
  const emoji    = document.getElementById('f-emoji').value.trim() || '🧸';
  const desc     = document.getElementById('f-desc').value.trim();

  // Validación básica visual
  let valid = true;
  [
    ['f-nombre',   !nombre],
    ['f-categoria',!categoria],
    ['f-precio',   !precio || precio <= 0],
  ].forEach(([id, bad]) => {
    const el = document.getElementById(id);
    el.classList.toggle('invalid', bad);
    if (bad) valid = false;
  });
  if (!valid) {
    showFormMsg('Completa los campos obligatorios marcados en rojo.', 'error');
    return;
  }

  const submitBtn  = document.getElementById('submitBtn');
  const btnLabel   = submitBtn.querySelector('.btn-label');
  const btnSpinner = submitBtn.querySelector('.btn-spinner');

  submitBtn.disabled = true;
  btnLabel.textContent = 'Registrando…';
  btnSpinner.classList.remove('hidden');

  try {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source:      'catalogo-web',
        entity:      categoria,
        action:      'CREATE',
        title:       nombre,
        description: desc || `Nuevo peluche: ${nombre}`,
        payload:     { precio, tamano, stock, emoji },
      }),
    });

    if (res.ok) {
      // Agregar al catálogo en memoria
      const newItem = { id: nextId++, nombre, categoria, precio, tamano, stock, emoji, descripcion: desc };
      CATALOG.push(newItem);

      showFormMsg(`"${nombre}" registrado correctamente en la API 🎉`, 'success');
      showToast(`Peluche "${nombre}" agregado al catálogo 🧸`, 'success');
      e.target.reset();
      document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    } else {
      const err = await res.json().catch(() => ({}));
      const msg = Array.isArray(err.message) ? err.message.join(' · ') : (err.message ?? `Error ${res.status}`);
      showFormMsg(`Error de la API: ${msg}`, 'error');
    }
  } catch {
    showFormMsg('No se pudo conectar con la API. ¿Está corriendo el servidor?', 'error');
  } finally {
    submitBtn.disabled = false;
    btnLabel.textContent = 'Registrar peluche';
    btnSpinner.classList.add('hidden');
  }
}

function showFormMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = `form-message ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

/* ==========================================
   ACTIVIDAD
   ========================================== */

async function loadActivity() {
  const container = document.getElementById('activityList');
  const filter    = document.getElementById('activityFilter').value;
  container.innerHTML = '<p class="loading-msg">Cargando…</p>';

  try {
    const res  = await fetch(`${API_BASE}/events`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let events = await res.json();

    if (filter) events = events.filter(ev => ev.action === filter);

    if (!events.length) {
      container.innerHTML = '<p class="loading-msg">No hay eventos registrados todavía.</p>';
      return;
    }

    container.innerHTML = '';
    events.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'activity-item';
      const action = (ev.action ?? '').toUpperCase();
      const rawDate = extractTimestamp(ev);

      item.innerHTML = `
        <div class="activity-icon ${action}">${getActionIcon(action)}</div>
        <div class="activity-body">
          <div class="activity-title">${ev.title || ev.entity || '(sin título)'}</div>
          <div class="activity-meta">
            <strong>${ev.source || '—'}</strong> · ${ev.entity || '—'} · ${formatDate(rawDate)}
          </div>
        </div>
        <span class="action-badge ${action}">${action}</span>
      `;
      container.appendChild(item);
    });
  } catch {
    container.innerHTML = '<p class="loading-msg">⚠️ No se pudo cargar la actividad. Verifica que la API esté en línea.</p>';
  }
}

/* ==========================================
   ESTADÍSTICAS + GRÁFICA
   ========================================== */

async function loadStats() {
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = '<p class="loading-msg">Cargando…</p>';

  try {
    const res  = await fetch(`${API_BASE}/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = await res.json();

    const cards = [
      { label: 'CREATE', icon: '🟢', value: stats.create  ?? 0 },
      { label: 'UPDATE', icon: '🟡', value: stats.update  ?? 0 },
      { label: 'DELETE', icon: '🔴', value: stats.delete  ?? 0 },
      { label: 'QUERY',  icon: '🔵', value: stats.query   ?? 0 },
      { label: 'TOTAL',  icon: '🧸', value: stats.total   ?? 0 },
    ];

    grid.innerHTML = '';
    cards.forEach(c => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `
        <div class="stat-icon">${c.icon}</div>
        <div class="stat-label">${c.label}</div>
        <div class="stat-value">${c.value}</div>
      `;
      grid.appendChild(card);
    });

    drawBarChart(stats);
  } catch {
    grid.innerHTML = '<p class="loading-msg">⚠️ No se pudo cargar las estadísticas.</p>';
  }
}

function drawBarChart(stats) {
  const canvas = document.getElementById('statsChart');
  const ctx    = canvas.getContext('2d');

  const data   = [
    { label: 'CREATE', value: stats.create ?? 0, color: '#34d399' },
    { label: 'UPDATE', value: stats.update ?? 0, color: '#fbbf24' },
    { label: 'DELETE', value: stats.delete ?? 0, color: '#f87171' },
    { label: 'QUERY',  value: stats.query  ?? 0, color: '#60a5fa' },
  ];

  const dpr    = window.devicePixelRatio || 1;
  const W      = canvas.offsetWidth  || 400;
  const H      = canvas.offsetHeight || 220;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const padL = 40, padR = 20, padT = 20, padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW   = (chartW / data.length) * 0.55;
  const gap    = (chartW / data.length) * 0.45;

  ctx.clearRect(0, 0, W, H);

  // Fondo
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // Líneas de guía
  ctx.strokeStyle = '#f0d4e8';
  ctx.lineWidth = 1;
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const y = padT + (chartH / ticks) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartW, y);
    ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px Segoe UI, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal * (1 - i / ticks)), padL - 6, y + 4);
  }

  // Barras
  data.forEach((d, i) => {
    const x   = padL + i * (barW + gap) + gap / 2;
    const bH  = (d.value / maxVal) * chartH;
    const y   = padT + chartH - bH;

    // Gradiente
    const grad = ctx.createLinearGradient(x, y, x, padT + chartH);
    grad.addColorStop(0, d.color);
    grad.addColorStop(1, d.color + '66');
    ctx.fillStyle = grad;

    const r = 6;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, padT + chartH);
    ctx.lineTo(x, padT + chartH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();

    // Valor sobre la barra
    ctx.fillStyle = '#1e1b2e';
    ctx.font = 'bold 13px Segoe UI, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.value, x + barW / 2, y - 6);

    // Etiqueta
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px Segoe UI, system-ui, sans-serif';
    ctx.fillText(d.label, x + barW / 2, padT + chartH + 18);
  });
}

/* ==========================================
   NAVEGACIÓN POR TABS
   ========================================== */

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');

      // Cargar datos al cambiar de tab
      if (target === 'actividad') loadActivity();
      if (target === 'stats')     loadStats();
    });
  });
}

/* ==========================================
   BOOTSTRAP
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Tabs
  initTabs();

  // Catálogo inicial
  renderCatalog(CATALOG);

  // Filtros
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('filterCategory').addEventListener('change', applyFilters);
  document.getElementById('filterSize').addEventListener('change', applyFilters);

  // Formulario
  document.getElementById('addPeluche').addEventListener('submit', handleAddPeluche);

  // Limpiar errores al escribir
  ['f-nombre','f-categoria','f-precio'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      document.getElementById(id).classList.remove('invalid');
    });
  });

  // Actividad — botón refrescar
  document.getElementById('refreshActivity').addEventListener('click', loadActivity);
  document.getElementById('activityFilter').addEventListener('change', loadActivity);

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('modalRegisterQuery').addEventListener('click', () => {
    if (_currentPeluche) registerQueryEvent(_currentPeluche);
  });

  // Health check inicial y periódico
  checkApiHealth();
  setInterval(checkApiHealth, 30_000);
});
