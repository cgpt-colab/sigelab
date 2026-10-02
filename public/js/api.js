export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'No se pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return 'Sin registro';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('es-HN', options).format(date);
}

export function titleCase(value = '') {
  return String(value).toLowerCase().replace(/\b\p{L}/gu, letter => letter.toUpperCase());
}

export function badge(value, label = titleCase(value || 'Sin datos')) {
  const key = String(value || '').toUpperCase();
  let style = 'badge-neutral';
  if (['OPERATIVO', 'NORMAL', 'RESUELTA', 'COMPLETADO', 'FINALIZADA', 'SIN HALLAZGOS'].includes(key)) style = 'badge-good';
  else if (['CON OBSERVACION', 'ATENCION', 'EN REVISION', 'EN PROCESO', 'EN MANTENIMIENTO', 'ESPERANDO REPUESTO', 'MEDIA', 'ALTA'].includes(key)) style = 'badge-watch';
  else if (['NO OPERATIVO', 'CRITICO', 'CRITICA', 'PENDIENTE', 'FUERA DE SERVICIO'].includes(key)) style = 'badge-bad';
  else if (['OPERATIVO CON OBSERVACION', 'BORRADOR'].includes(key)) style = 'badge-info';
  return `<span class="badge ${style}">${escapeHtml(label)}</span>`;
}

export function pageHeading(title, description, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">SIGELAB · UNICAH</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${action}</div>`;
}

export function metric(label, value, note, accent = '') {
  return `<article class="metric-card ${accent}"><div class="metric-label"><span>${escapeHtml(label)}</span><span class="metric-mark" aria-hidden="true">·</span></div><strong class="metric-value">${escapeHtml(value)}</strong><span class="metric-note">${escapeHtml(note)}</span></article>`;
}

export function availability(value) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return `<span class="availability"><span>${percent.toFixed(1)}%</span><span class="availability-track"><span class="availability-fill ${percent < 85 ? 'low' : ''}" style="width:${percent}%"></span></span></span>`;
}

export function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}