import { api, escapeHtml as e, formatDate, badge, pageHeading, emptyState } from './api.js';
import { renderDashboard, renderLabs, labTable, renderEquipment, renderInspections, renderIncidents, renderMaintenance, renderStats, renderUsers, renderSettings } from './views.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const inspectionSections = [
  { title: 'Infraestructura', items: ['Instalación eléctrica', 'Tomas eléctricas', 'Cableado de red', 'Acceso a Internet', 'Puertas y cerraduras', 'Mobiliario', 'Iluminación', 'Aire acondicionado'] },
  { title: 'Equipamiento', items: ['Equipos identificados', 'Computadoras en buen estado y limpias', 'Monitores disponibles', 'Teclados y mouse disponibles', 'Equipos organizados'] },
  { title: 'Seguridad', items: ['Normas visibles', 'Sin cables peligrosos', 'Extintores disponibles y vigentes', 'Áreas despejadas', 'Condiciones eléctricas seguras', 'Iluminación adecuada'] },
  { title: 'Orden y limpieza', items: ['Laboratorio limpio', 'Equipos limpios', 'Mesas ordenadas', 'Pasillos despejados', 'Área general organizada'] },
  { title: 'Recursos adicionales', items: ['Pantalla TV y Datashow', 'Interruptores y equipos audiovisuales', 'Otros recursos'] }
];
const wizardSteps = ['Laboratorio', 'Infraestructura', 'Equipamiento', 'Seguridad', 'Orden', 'Recursos', 'Computadoras', 'Resumen'];
const navItems = {
  coordinator: [['dashboard', 'Resumen general', '▦'], ['laboratorios', 'Laboratorios', '⌂'], ['equipos', 'Inventario', '▤'], ['inspecciones', 'Inspecciones', '✓'], ['incidencias', 'Incidencias', '!'], ['mantenimientos', 'Mantenimientos', '⌁'], ['estadisticas', 'Estadísticas', '▥'], ['reportes', 'Reportes', '▧'], ['usuarios', 'Usuarios', '♙'], ['configuracion', 'Configuración', '⚙']],
  teacher: [['dashboard', 'Mi jornada', '▦'], ['nueva-inspeccion', 'Realizar inspección', '＋'], ['inspecciones', 'Mis inspecciones', '✓'], ['laboratorios', 'Laboratorios', '⌂'], ['equipos', 'Consultar equipos', '▤'], ['incidencias', 'Incidencias', '!']],
  admin: [['dashboard', 'Resumen general', '▦'], ['laboratorios', 'Laboratorios', '⌂'], ['equipos', 'Inventario', '▤'], ['inspecciones', 'Inspecciones', '✓'], ['incidencias', 'Incidencias', '!'], ['mantenimientos', 'Mantenimientos', '⌁'], ['estadisticas', 'Estadísticas', '▥'], ['reportes', 'Reportes', '▧'], ['usuarios', 'Usuarios', '♙'], ['configuracion', 'Configuración', '⚙']]
};
const pageNames = { dashboard: 'Resumen general', laboratorios: 'Laboratorios', equipos: 'Inventario', inspecciones: 'Inspecciones', 'nueva-inspeccion': 'Nueva inspección', incidencias: 'Incidencias', mantenimientos: 'Mantenimientos', estadisticas: 'Estadísticas', reportes: 'Reportes', usuarios: 'Usuarios', configuracion: 'Configuración' };

const state = {
  user: null, page: 'dashboard', labs: [], equipment: [], inspections: [], incidents: [], maintenance: [], users: [], stats: null,
  wizard: null, reportFilters: null, loadToken: 0
};

function toast(message, isError = false) {
  const node = document.createElement('div');
  node.className = `toast${isError ? ' error' : ''}`;
  node.textContent = message;
  $('#toast-region').append(node);
  setTimeout(() => node.remove(), 4200);
}

function showLogin() {
  $('#application').hidden = true;
  $('#login-screen').hidden = false;
  $('#login-error').textContent = '';
}

function showApplication() {
  $('#login-screen').hidden = true;
  $('#application').hidden = false;
  const name = `${state.user.nombre} ${state.user.apellido}`;
  $('#user-name').textContent = name;
  $('#user-role').textContent = state.user.rol;
  $('#user-avatar').textContent = name.trim().charAt(0).toUpperCase();
  $('#topbar-user').textContent = state.user.nombre;
  $('#today-label').textContent = new Intl.DateTimeFormat('es-HN', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
  buildNavigation();
}

function buildNavigation() {
  let group = state.user.rol === 'Docente' ? 'teacher' : state.user.rol === 'Administrador' ? 'admin' : 'coordinator';
  $('#main-navigation').innerHTML = navItems[group].map(([page, label, icon]) => `<a href="#${page}" class="nav-link ${state.page === page ? 'active' : ''}" data-page="${page}"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${e(label)}</span></a>`).join('');
}

async function loadPage(page = state.page) {
  state.page = page;
  state.loadToken += 1;
  const token = state.loadToken;
  buildNavigation();
  $('#page-breadcrumb').textContent = pageNames[page] || pageNames.dashboard;
  $('#sidebar').classList.remove('open');
  if (page === 'nueva-inspeccion') {
    if (!state.wizard) state.wizard = { step: 0, labId: '', inspectionId: null, details: {}, computerAnswer: null, computerIssues: {}, observation: '' };
    return renderWizard();
  }
  $('#page-content').innerHTML = '<div class="panel"><div class="empty-state">Cargando información…</div></div>';
  try {
    let html = '';
    if (page === 'dashboard') {
      const [dashboard] = await Promise.all([api('/dashboard')]);
      state.labs = dashboard.labs;
      html = renderDashboard(dashboard, state.user);
    } else if (page === 'laboratorios') {
      state.labs = await api('/labs');
      html = renderLabs(state.labs);
    } else if (page === 'equipos') {
      const [equipment, labs] = await Promise.all([api('/equipment'), api('/labs')]);
      state.equipment = equipment; state.labs = labs;
      html = renderEquipment(equipment, labs, state.user);
    } else if (page === 'inspecciones') {
      state.inspections = await api('/inspections');
      html = renderInspections(state.inspections, state.user);
    } else if (page === 'incidencias') {
      const [incidents, labs] = await Promise.all([api('/incidents'), api('/labs')]);
      state.incidents = incidents; state.labs = labs;
      html = renderIncidents(incidents, labs);
    } else if (page === 'mantenimientos') {
      const [records, equipment] = await Promise.all([api('/maintenance'), api('/equipment')]);
      state.maintenance = records; state.equipment = equipment;
      html = renderMaintenance(records, equipment, state.user);
    } else if (page === 'estadisticas' || page === 'reportes') {
      state.stats = await api(statsQuery(state.reportFilters));
      html = renderStats(state.stats, page === 'reportes');
    } else if (page === 'usuarios') {
      state.users = await api('/users');
      html = renderUsers(state.users, state.user);
    } else if (page === 'configuracion') html = renderSettings(state.user);
    else html = renderDashboard(await api('/dashboard'), state.user);
    if (token === state.loadToken) $('#page-content').innerHTML = html;
  } catch (error) {
    if (error.status === 401) return showLogin();
    $('#page-content').innerHTML = `${pageHeading('No se pudo cargar la información', 'Revisa la conexión e inténtalo nuevamente.')}<div class="callout danger">${e(error.message)}</div><button class="button button-secondary" data-action="retry-page">Reintentar</button>`;
  }
}

function statsQuery(filters) {
  if (!filters) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - ((end.getDay() + 6) % 7));
    filters = { start: localDate(start), end: localDate(end), period: 'week', lab: '', equipment: '', status: '', priority: '' };
  }
  const params = new URLSearchParams({ start: filters.start, end: filters.end, period: filters.period || 'week', lab: filters.lab || '', equipment: filters.equipment || '', status: filters.status || '', priority: filters.priority || '' });
  return `/stats?${params}`;
}

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function stepLabel(step) { return wizardSteps[step] || wizardSteps[0]; }

function renderWizard() {
  const wizard = state.wizard;
  const labs = state.labs;
  const active = state.incidents.filter(item => Number(item.laboratorio_id) === Number(wizard.labId) && item.estado !== 'RESUELTA');
  const currentLab = labs.find(lab => Number(lab.id) === Number(wizard.labId));
  const progress = `<div class="wizard-progress">${wizardSteps.map((label, index) => `<div class="wizard-step ${index === wizard.step ? 'active' : index < wizard.step ? 'done' : ''}">${e(label)}</div>`).join('')}</div>`;
  const action = state.user.rol === 'Docente' ? '<button class="button button-primary" data-action="new-inspection">＋ Nueva inspección</button>' : '';
  let body = '';

  if (wizard.step === 0) {
    body = `<div class="form-stack"><div class="field"><label for="inspection-lab">Laboratorio a inspeccionar</label><select id="inspection-lab"><option value="">Selecciona un laboratorio</option>${labs.map(lab => `<option value="${lab.id}" ${Number(wizard.labId) === Number(lab.id) ? 'selected' : ''}>${e(lab.nombre)} · ${e(lab.codigo)}</option>`).join('')}</select></div>${currentLab ? `<div class="detail-grid"><div class="detail-pair"><span>Computadoras registradas</span><strong>${currentLab.total_pc}</strong></div><div class="detail-pair"><span>Disponibilidad actual</span><strong>${Number(currentLab.total_pc) ? (Number(currentLab.operativas) / Number(currentLab.total_pc) * 100).toFixed(1) : '100.0'}%</strong></div><div class="detail-pair"><span>Incidencias activas</span><strong>${currentLab.incidencias_activas}</strong></div></div><div class="callout">Las incidencias previas siguen activas hasta su resolución. La lista es informativa; confirma su continuidad o agrega el seguimiento en cada incidencia.</div>${active.length ? `<div><div class="section-title"><h2>Incidencias activas</h2><span class="muted">${active.length} en seguimiento</span></div>${active.slice(0, 8).map(item => `<div class="alert-row"><span class="alert-indicator ${item.prioridad === 'CRITICA' ? 'critical' : ''}"></span><div class="alert-copy"><strong>${e(item.equipo || item.codigo)}</strong> · ${e(item.descripcion)}<span class="table-secondary">${e(item.codigo)} · ${e(item.estado)}</span></div><button class="text-button" data-action="incident-detail" data-id="${item.id}">Ver</button></div>`).join('')}</div>` : emptyState('No hay incidencias activas en este laboratorio.')}` : ''}</div>`;
  } else if (wizard.step >= 1 && wizard.step <= 5) {
    const section = inspectionSections[wizard.step - 1];
    body = `<div class="section-title" style="margin-top:0"><h2>${e(section.title)}</h2><span class="muted">Selecciona el estado observado en cada punto.</span></div><div class="checklist">${section.items.map(item => renderCheckItem(section.title, item, wizard.details[item] || {})).join('')}</div>`;
  } else if (wizard.step === 6) {
    const computers = state.equipment.filter(item => Number(item.laboratorio_id) === Number(wizard.labId) && item.tipo === 'Computadora');
    body = `<div class="section-title" style="margin-top:0"><h2>Revisión de computadoras</h2><span class="muted">Inventario: ${computers.length} activas</span></div><div class="field"><label>¿Todas las computadoras se encuentran operativas?</label><div class="state-options"><button class="state-option ${wizard.computerAnswer === true ? 'selected' : ''}" data-action="computer-answer" data-answer="yes">Sí, todas operativas</button><button class="state-option ${wizard.computerAnswer === false ? 'selected' : ''}" data-action="computer-answer" data-answer="no">No, hay anomalías</button></div></div>${wizard.computerAnswer === false ? `<div class="callout warning" style="margin-top:12px">Selecciona solo los equipos con problemas. Un equipo con una incidencia activa conservará su estado aunque no lo vuelvas a marcar.</div><div class="panel" style="margin-top:12px"><div class="panel-body flush">${computers.length ? computers.map(item => renderComputerIssue(item, wizard.computerIssues[item.id] || null)).join('') : emptyState('No hay computadoras registradas en este laboratorio.')}</div></div>` : wizard.computerAnswer === true ? '<div class="callout" style="margin-top:12px">Las incidencias anteriores permanecen activas; esta respuesta no las cierra.</div>' : ''}`;
  } else {
    const incomplete = inspectionSections.flatMap(section => section.items).filter(item => !wizard.details[item]?.estado);
    const invalid = inspectionSections.flatMap(section => section.items).filter(item => wizard.details[item]?.estado === 'NO OPERATIVO' && !wizard.details[item]?.observacion?.trim());
    const selectedProblems = Object.values(wizard.computerIssues).filter(Boolean);
    body = `<div class="section-title" style="margin-top:0"><h2>Resumen de inspección</h2><span class="muted">${e(currentLab?.nombre || '')} · revisión ${formatDate(new Date())}</span></div><div class="detail-grid"><div class="detail-pair"><span>Puntos sin revisar</span><strong>${incomplete.length}</strong></div><div class="detail-pair"><span>Anomalías de infraestructura y equipo</span><strong>${invalid.length}</strong></div><div class="detail-pair"><span>Computadoras reportadas</span><strong>${selectedProblems.length}</strong></div></div>${invalid.length || selectedProblems.some(item => !item.descripcion?.trim()) ? '<div class="callout danger" style="margin-top:13px">Completa la descripción de cada anomalía antes de finalizar.</div>' : ''}<div class="field" style="margin-top:14px"><label for="general-observation">Observación general</label><textarea id="general-observation" placeholder="Contexto adicional de la visita">${e(wizard.observation)}</textarea></div><div class="callout" style="margin-top:13px">${selectedProblems.length + invalid.length} anomalías serán revisadas para crear incidencias. Si ya existe una incidencia idéntica activa, se agregará un seguimiento en lugar de duplicarla.</div></div>`;
  }

  const footer = `<button class="button button-secondary" data-action="save-draft" ${wizard.step === 0 || !wizard.inspectionId ? 'disabled' : ''}>Guardar borrador</button><div class="footer-actions">${wizard.step > 0 ? '<button class="button button-secondary" data-action="wizard-prev">← Anterior</button>' : ''}${wizard.step < wizardSteps.length - 1 ? `<button class="button button-primary" data-action="wizard-next">Siguiente →</button>` : '<button class="button button-primary" data-action="finalize-inspection">Finalizar inspección</button>'}</div>`;
  $('#page-content').innerHTML = `${pageHeading('Nueva inspección', 'Registra lo observado; las cantidades y los problemas activos se conservan automáticamente.', action)}${progress}<section class="panel"><div class="panel-header"><h2>${e(stepLabel(wizard.step))}</h2><span class="muted">Paso ${wizard.step + 1} de ${wizardSteps.length}</span></div><div class="panel-body">${body}<div class="wizard-footer">${footer}</div></div></section>`;
}

function renderCheckItem(category, item, detail) {
  const states = ['OPERATIVO', 'CON OBSERVACION', 'NO OPERATIVO', 'NO APLICA'];
  const status = detail.estado || '';
  const conditional = status === 'CON OBSERVACION' || status === 'NO OPERATIVO';
  return `<article class="check-item" data-check-item="${e(item)}"><div class="check-item-head"><span class="check-item-name">${e(item)}</span><div class="state-options">${states.map(value => `<button class="state-option ${status === value ? 'selected' : ''}" data-action="set-check" data-item="${e(item)}" data-category="${e(category)}" data-value="${value}">${value === 'CON OBSERVACION' ? 'Observación' : value === 'NO APLICA' ? 'N/A' : value.replace('NO ', 'No ')}</button>`).join('')}</div></div>${conditional ? `<div class="conditional-fields"><div class="field wide"><label>${status === 'NO OPERATIVO' ? 'Descripción del problema' : 'Observación'}<textarea data-check-field="observacion" data-item="${e(item)}" placeholder="Describe lo observado">${e(detail.observacion || '')}</textarea></label></div>${status === 'NO OPERATIVO' ? `<div class="field"><label>Tipo de problema<input data-check-field="tipo_problema" data-item="${e(item)}" value="${e(detail.tipo_problema || item)}"></label></div><div class="field"><label>Prioridad<select data-check-field="prioridad" data-item="${e(item)}">${['BAJA','MEDIA','ALTA','CRITICA'].map(value => `<option ${detail.prioridad === value ? 'selected' : value === 'MEDIA' && !detail.prioridad ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>` : ''}</div>` : ''}</article>`;
}

function renderComputerIssue(item, issue) {
  const selected = Boolean(issue);
  return `<div class="equipment-issue"><input type="checkbox" data-computer="${item.id}" ${selected ? 'checked' : ''} aria-label="Reportar problema en ${e(item.codigo)}"><div><strong>${e(item.codigo)}</strong><span class="table-secondary">${e([item.marca, item.modelo].filter(Boolean).join(' · ') || item.tipo)}</span>${selected ? `<div class="conditional-fields"><div class="field"><label>Tipo de problema<input data-computer-field="tipo" data-id="${item.id}" value="${e(issue.tipo || '')}" placeholder="Ej. No enciende"></label></div><div class="field"><label>Prioridad<select data-computer-field="prioridad" data-id="${item.id}">${['BAJA','MEDIA','ALTA','CRITICA'].map(value => `<option ${issue.prioridad === value ? 'selected' : value === 'ALTA' && !issue.prioridad ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><div class="field wide"><label>Descripción<textarea data-computer-field="descripcion" data-id="${item.id}" placeholder="Describe la falla">${e(issue.descripcion || '')}</textarea></label></div><div class="field wide"><label>Observación<textarea data-computer-field="observacion" data-id="${item.id}" placeholder="Seguimiento adicional (opcional)">${e(issue.observacion || '')}</textarea></label></div></div>` : ''}</div></div>`;
}

async function startInspection() {
  state.wizard = { step: 0, labId: '', inspectionId: null, details: {}, computerAnswer: null, computerIssues: {}, observation: '' };
  const [labs, incidents, equipment] = await Promise.all([api('/labs'), api('/incidents'), api('/equipment')]);
  state.labs = labs; state.incidents = incidents; state.equipment = equipment;
  await loadPage('nueva-inspeccion');
}

async function resumeInspection(id) {
  const [inspection, labs, incidents, equipment] = await Promise.all([api(`/inspections/${id}`), api('/labs'), api('/incidents'), api('/equipment')]);
  const details = {};
  const computerIssues = {};
  for (const item of inspection.detalles) {
    if (item.equipo_id) computerIssues[item.equipo_id] = { tipo: item.tipo_problema, descripcion: item.observacion, prioridad: item.prioridad, observacion: '' };
    else details[item.item] = { estado: item.estado, observacion: item.observacion || '', tipo_problema: item.tipo_problema, prioridad: item.prioridad };
  }
  state.labs = labs;
  state.incidents = incidents;
  state.equipment = equipment;
  state.wizard = { step: 1, labId: String(inspection.laboratorio_id), inspectionId: inspection.id, details, computerAnswer: Object.keys(computerIssues).length ? false : true, computerIssues, observation: inspection.observacion_general || '' };
  await loadPage('nueva-inspeccion');
}

async function createDraft(labId) {
  const result = await api('/inspections', { method: 'POST', body: JSON.stringify({ laboratorio_id: Number(labId) }) });
  state.wizard.inspectionId = result.id;
  state.wizard.labId = String(labId);
  const [labs, incidents, equipment] = await Promise.all([api('/labs'), api('/incidents'), api('/equipment')]);
  state.labs = labs; state.incidents = incidents; state.equipment = equipment;
  toast('Borrador iniciado. El progreso se guardará al continuar.');
}

function draftDetails() {
  const wizard = state.wizard;
  const details = [];
  for (const section of inspectionSections) {
    for (const item of section.items) {
      const value = wizard.details[item];
      if (!value?.estado) continue;
      details.push({ categoria: section.title, item, estado: value.estado, observacion: value.observacion || '', tipo_problema: value.tipo_problema || item, prioridad: value.prioridad || 'MEDIA' });
    }
  }
  for (const [id, issue] of Object.entries(wizard.computerIssues)) {
    if (!issue) continue;
    const equipment = state.equipment.find(item => Number(item.id) === Number(id));
    if (!equipment) continue;
    details.push({ categoria: 'Equipamiento', item: `Equipo: ${equipment.codigo}`, estado: 'NO OPERATIVO', observacion: issue.descripcion || '', tipo_problema: issue.tipo || 'Falla de computadora', prioridad: issue.prioridad || 'ALTA', equipo_id: Number(id) });
  }
  return details;
}

async function saveDraft(showMessage = true) {
  const wizard = state.wizard;
  if (!wizard?.inspectionId) return;
  await api(`/inspections/${wizard.inspectionId}`, { method: 'PUT', body: JSON.stringify({ detalles: draftDetails(), observacion_general: wizard.observation }) });
  if (showMessage) toast('Borrador guardado.');
}

let draftTimer;
function scheduleDraft() {
  clearTimeout(draftTimer);
  if (!state.wizard?.inspectionId) return;
  draftTimer = setTimeout(() => saveDraft(false).catch(error => toast(error.message, true)), 900);
}

function updateCheck(item, field, value) {
  state.wizard.details[item] ||= {};
  state.wizard.details[item][field] = value;
  scheduleDraft();
}

function readWizardFields() {
  const wizard = state.wizard;
  $$('[data-check-field]').forEach(input => updateCheck(input.dataset.item, input.dataset.checkField, input.value));
  $$('[data-computer-field]').forEach(input => {
    const issue = wizard.computerIssues[input.dataset.id];
    if (issue) issue[input.dataset.computerField] = input.value;
  });
  const observation = $('#general-observation');
  if (observation) wizard.observation = observation.value;
  scheduleDraft();
}

async function wizardNext() {
  const wizard = state.wizard;
  readWizardFields();
  if (wizard.step === 0 && !wizard.inspectionId) {
    const lab = $('#inspection-lab')?.value;
    if (!lab) return toast('Selecciona el laboratorio para comenzar.', true);
    try { await createDraft(lab); } catch (error) { return toast(error.message, true); }
  }
  if (wizard.step >= 1 && wizard.step <= 5) {
    const section = inspectionSections[wizard.step - 1];
    const missing = section.items.find(item => !wizard.details[item]?.estado);
    if (missing) return toast(`Indica el estado de «${missing}».`, true);
    const invalid = section.items.find(item => wizard.details[item]?.estado === 'NO OPERATIVO' && !wizard.details[item]?.observacion?.trim());
    if (invalid) return toast(`Describe la anomalía de «${invalid}».`, true);
  }
  if (wizard.step === 6) {
    if (wizard.computerAnswer === null) return toast('Confirma si todas las computadoras están operativas.', true);
    if (wizard.computerAnswer === false) {
      const selected = Object.values(wizard.computerIssues).filter(Boolean);
      const missing = selected.find(issue => !issue.descripcion?.trim() || !issue.tipo?.trim());
      if (missing) return toast('Completa el tipo y la descripción de cada equipo con problemas.', true);
    }
  }
  try { await saveDraft(false); } catch (error) { return toast(error.message, true); }
  wizard.step = Math.min(wizard.step + 1, wizardSteps.length - 1);
  renderWizard();
}

async function finalizeInspection() {
  const wizard = state.wizard;
  readWizardFields();
  const missing = inspectionSections.flatMap(section => section.items).find(item => !wizard.details[item]?.estado);
  if (missing) return toast(`Falta revisar «${missing}».`, true);
  const issueMissing = inspectionSections.flatMap(section => section.items).find(item => wizard.details[item]?.estado === 'NO OPERATIVO' && !wizard.details[item]?.observacion?.trim());
  if (issueMissing) return toast(`Describe la anomalía de «${issueMissing}».`, true);
  const computerMissing = Object.values(wizard.computerIssues).filter(Boolean).find(issue => !issue.tipo?.trim() || !issue.descripcion?.trim());
  if (computerMissing) return toast('Completa la descripción de cada computadora con problemas.', true);
  try {
    await saveDraft(false);
    const result = await api(`/inspections/${wizard.inspectionId}/finalize`, { method: 'POST' });
    state.wizard = null;
    toast(`Inspección finalizada. ${result.incidencias_reportadas} incidencias revisadas.`);
    await loadPage('inspecciones');
  } catch (error) { toast(error.message, true); }
}

function modal(title, content, footer = '', wide = false) {
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${e(title)}"><header class="modal-header"><div><h2>${e(title)}</h2></div><button class="modal-close" data-action="close-modal" aria-label="Cerrar">×</button></header><div class="modal-body">${content}</div>${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}</section></div>`;
  $('.modal', $('#modal-root')).focus?.();
}

function closeModal() { $('#modal-root').innerHTML = ''; }

function details(label, value) { return `<div class="detail-pair"><span>${e(label)}</span><strong>${e(value || '—')}</strong></div>`; }

async function showLab(id) {
  const lab = await api(`/labs/${id}`);
  const history = lab.inspections.length ? lab.inspections.map(item => `<tr><td>${formatDate(item.fecha)}</td><td>${e(item.docente)} ${e(item.apellido_docente || '')}</td><td>${badge(item.resultado)}</td><td>${badge(item.estado)}</td></tr>`).join('') : '<tr><td colspan="4">Sin inspecciones registradas.</td></tr>';
  const open = lab.incidents.filter(item => item.estado !== 'RESUELTA');
  const body = `<div class="detail-grid">${details('Código', lab.codigo)}${details('Ubicación', lab.ubicacion)}${details('Equipos registrados', lab.total_equipos)}${details('Computadoras registradas', lab.total_pc)}${details('Operativas', lab.operativas)}${details('Con observación', lab.observaciones)}${details('No operativas', lab.no_operativas)}${details('En mantenimiento', lab.en_mantenimiento)}${details('Incidencias activas', lab.incidencias_activas)}</div><div class="divider"></div><h3>Incidencias activas</h3>${open.length ? `<div class="alert-list">${open.map(item => `<div class="alert-row"><span class="alert-indicator ${item.prioridad === 'CRITICA' ? 'critical' : ''}"></span><div class="alert-copy"><strong>${e(item.equipo || item.codigo)}</strong> · ${e(item.descripcion)}<span class="table-secondary">${e(item.codigo)} · ${e(item.estado)} · ${item.dias_abierta} días</span></div><button class="text-button" data-action="incident-detail" data-id="${item.id}">Abrir</button></div>`).join('')}</div>` : emptyState('No hay incidencias activas.') }<div class="divider"></div><h3>Inspecciones recientes</h3><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Docente</th><th>Resultado</th><th>Estado</th></tr></thead><tbody>${history}</tbody></table></div>`;
  modal(lab.nombre, body, `<button class="button button-secondary" data-action="close-modal">Cerrar</button><button class="button button-primary" data-action="lab-inspection" data-id="${lab.id}">Realizar inspección</button>`, true);
}

async function showEquipment(id) {
  const item = await api(`/equipment/${id}`);
  const events = item.events.length ? item.events.map(event => `<tr><td>${formatDate(event.fecha)}</td><td>${e(event.evento)}</td><td>${e(event.referencia)}</td><td>${e(event.detalle)}</td><td>${badge(event.estado)}</td><td>${e(event.responsable || '—')}</td></tr>`).join('') : '<tr><td colspan="6">El equipo todavía no tiene historial.</td></tr>';
  const body = `<div class="detail-grid">${details('Código', item.codigo)}${details('Laboratorio', item.laboratorio)}${details('Tipo', item.tipo)}${details('Marca', item.marca)}${details('Modelo', item.modelo)}${details('Número de serie', item.numero_serie)}${details('N.º inventario', item.numero_inventario)}${details('Estado calculado', item.estado_actual)}${details('Registrado', formatDate(item.fecha_registro))}</div><div class="divider"></div><h3>Historial del equipo</h3><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Referencia</th><th>Detalle</th><th>Estado</th><th>Responsable</th></tr></thead><tbody>${events}</tbody></table></div>`;
  modal(item.codigo, body, '<button class="button button-secondary" data-action="close-modal">Cerrar</button>', true);
}

async function showInspection(id) {
  const inspection = await api(`/inspections/${id}`);
  const detailsList = inspection.detalles.length ? inspection.detalles.map(detail => `<tr><td>${e(detail.categoria)}</td><td>${e(detail.item)}</td><td>${badge(detail.estado)}</td><td>${e(detail.observacion || '—')}</td></tr>`).join('') : '<tr><td colspan="4">No hay detalles registrados.</td></tr>';
  const incidentsList = inspection.incidencias.length ? inspection.incidencias.map(item => `<tr><td><button class="table-link" data-action="incident-detail" data-id="${item.id}">${e(item.codigo)}</button></td><td>${e(item.equipo || 'Infraestructura')}</td><td>${e(item.descripcion)}</td><td>${badge(item.prioridad)}</td><td>${badge(item.estado)}</td></tr>`).join('') : '<tr><td colspan="5">Esta inspección no generó incidencias nuevas.</td></tr>';
  const body = `<div class="detail-grid">${details('Laboratorio', inspection.laboratorio)}${details('Docente', `${inspection.docente} ${inspection.apellido_docente}`)}${details('Fecha', formatDate(inspection.fecha))}${details('Inicio', String(inspection.hora_inicio).slice(0, 5))}${details('Finalización', inspection.hora_fin ? String(inspection.hora_fin).slice(0, 5) : 'En curso')}${details('Estado', inspection.estado)}</div><div class="divider"></div><h3>Observación general</h3><p class="muted">${e(inspection.observacion_general || 'Sin observación general.')}</p><h3>Detalle de inspección</h3><div class="table-wrap"><table><thead><tr><th>Bloque</th><th>Punto</th><th>Estado</th><th>Observación</th></tr></thead><tbody>${detailsList}</tbody></table></div><div class="divider"></div><h3>Incidencias vinculadas</h3><div class="table-wrap"><table><thead><tr><th>Código</th><th>Equipo</th><th>Descripción</th><th>Prioridad</th><th>Estado</th></tr></thead><tbody>${incidentsList}</tbody></table></div>`;
  modal(`Inspección · ${inspection.laboratorio}`, body, '<button class="button button-secondary" data-action="close-modal">Cerrar</button>', true);
}

async function showIncident(id) {
  const item = await api(`/incidents/${id}`);
  const canManage = ['Coordinador Académico', 'Administrador'].includes(state.user.rol);
  const history = item.history.length ? item.history.map(entry => `<div class="alert-row"><span class="alert-indicator"></span><div class="alert-copy"><strong>${e(entry.nombre)} ${e(entry.apellido)}</strong> · ${e(entry.estado_anterior || 'Creada')} ${entry.estado_nuevo ? `→ ${e(entry.estado_nuevo)}` : ''}<span class="table-secondary">${e(entry.comentario)}</span></div><span class="alert-age">${formatDate(entry.fecha)}</span></div>`).join('') : emptyState('Sin eventos de seguimiento.');
  const management = canManage ? `<form id="incident-update-form" data-id="${item.id}" class="form-stack"><div class="divider"></div><h3>Actualizar seguimiento</h3><div class="form-row"><div class="field"><label>Nuevo estado<select name="estado">${['PENDIENTE','EN REVISION','EN MANTENIMIENTO','ESPERANDO REPUESTO','RESUELTA'].map(value => `<option ${item.estado === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><div class="field"><label>Responsable<input name="responsable" value="${e(item.responsable || '')}" placeholder="Nombre del responsable"></label></div></div><div class="field"><label>Comentario o seguimiento<textarea name="observaciones" placeholder="Registra el avance">${e(item.observaciones || '')}</textarea></label></div><div class="resolution-fields"><div class="field"><label>Acción realizada<textarea name="accion_realizada" placeholder="Obligatorio para resolver"></textarea></label></div><div class="field"><label>Diagnóstico<textarea name="diagnostico" placeholder="Diagnóstico técnico"></textarea></label></div></div><p class="form-help">Para marcar como resuelta se requieren acción realizada, responsable y observación.</p><button class="button button-primary" type="submit">Guardar seguimiento</button></form>` : `<form id="incident-note-form" data-id="${item.id}" class="form-stack"><div class="divider"></div><div class="field"><label>Confirmar que continúa / agregar observación<textarea name="comentario" required placeholder="Describe el estado actual"></textarea></label></div><button class="button button-secondary" type="submit">Agregar al historial</button></form>`;
  const body = `<div class="detail-grid">${details('Código', item.codigo)}${details('Laboratorio', item.laboratorio)}${details('Equipo', item.equipo || 'Infraestructura')}${details('Tipo', item.tipo)}${details('Prioridad', item.prioridad)}${details('Estado', item.estado)}${details('Reportada', formatDate(item.fecha_reporte))}${details('Días abierta', item.estado === 'RESUELTA' ? 'Resuelta' : `${item.dias_abierta} días`)}${details('Responsable', item.responsable)}</div><div class="divider"></div><h3>Descripción</h3><p class="muted">${e(item.descripcion)}</p><h3>Historial de seguimiento</h3><div class="alert-list">${history}</div>${management}`;
  modal(`Incidencia ${item.codigo}`, body, '<button class="button button-secondary" data-action="close-modal">Cerrar</button>', true);
}

function equipmentForm(item = null) {
  const edit = Boolean(item);
  const values = item || {};
  const fields = `<div class="form-row"><div class="field"><label>Código<input name="codigo" required value="${e(values.codigo || '')}" placeholder="PC-L2-06"></label></div><div class="field"><label>Laboratorio<select name="laboratorio_id" required>${state.labs.map(lab => `<option value="${lab.id}" ${Number(values.laboratorio_id) === Number(lab.id) ? 'selected' : ''}>${e(lab.nombre)}</option>`).join('')}</select></label></div></div><div class="form-row"><div class="field"><label>Tipo<select name="tipo" required>${['Computadora','Monitor','Teclado','Mouse','Datashow','Pantalla TV','Aire acondicionado','Switch','Router','Access Point','UPS','Impresora','Otro'].map(value => `<option ${values.tipo === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><div class="field"><label>Marca<input name="marca" value="${e(values.marca || '')}"></label></div></div><div class="form-row"><div class="field"><label>Modelo<input name="modelo" value="${e(values.modelo || '')}"></label></div><div class="field"><label>Número de serie<input name="numero_serie" value="${e(values.numero_serie || '')}"></label></div></div><div class="field"><label>Número de inventario<input name="numero_inventario" value="${e(values.numero_inventario || '')}"></label></div><div class="field"><label>Descripción<textarea name="descripcion">${e(values.descripcion || '')}</textarea></label></div>`;
  const footer = `${edit ? '<button class="button button-danger" data-action="deactivate-equipment" data-id="' + item.id + '">Desactivar</button>' : ''}<span class="toolbar-spacer"></span><button class="button button-secondary" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit" form="equipment-form">${edit ? 'Guardar cambios' : 'Registrar equipo'}</button>`;
  modal(edit ? `Editar ${item.codigo}` : 'Registrar equipo', `<form id="equipment-form" data-id="${edit ? item.id : ''}" class="form-stack">${fields}</form><p class="form-help">Al desactivar un equipo se conserva su historial; ya no cuenta en el inventario activo.</p>`, footer);
}

function maintenanceForm() {
  const body = `<form id="maintenance-form" class="form-stack"><div class="form-row"><div class="field"><label>Equipo<select name="equipo_id" required><option value="">Selecciona equipo</option>${state.equipment.map(item => `<option value="${item.id}">${e(item.codigo)} · ${e(item.laboratorio)}</option>`).join('')}</select></label></div><div class="field"><label>Tipo<select name="tipo"><option>PREVENTIVO</option><option>CORRECTIVO</option></select></label></div></div><div class="form-row"><div class="field"><label>Responsable<input name="responsable" required></label></div><div class="field"><label>Estado<select name="estado"><option>PROGRAMADO</option><option>EN PROCESO</option><option>COMPLETADO</option></select></label></div></div><div class="field"><label>Descripción<textarea name="descripcion" required></textarea></label></div><div class="field"><label>Resultado / observaciones<textarea name="resultado"></textarea></label></div></form>`;
  modal('Registrar mantenimiento', body, '<button class="button button-secondary" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit" form="maintenance-form">Guardar mantenimiento</button>');
}

function userForm() {
  modal('Crear usuario', `<form id="user-form" class="form-stack"><div class="form-row"><div class="field"><label>Nombre<input name="nombre" required></label></div><div class="field"><label>Apellido<input name="apellido" required></label></div></div><div class="field"><label>Correo institucional<input name="correo" type="email" required></label></div><div class="form-row"><div class="field"><label>Perfil<select name="rol"><option>Docente</option><option>Coordinador Académico</option><option>Administrador</option></select></label></div><div class="field"><label>Contraseña inicial<input name="contrasena" type="password" minlength="10" required></label></div></div><p class="form-help">La contraseña debe contener al menos 10 caracteres.</p></form>`, '<button class="button button-secondary" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit" form="user-form">Crear usuario</button>');
}

function syncFilterResults() {
  const page = state.page;
  if (page === 'laboratorios') {
    const term = $('[data-filter="labs"]')?.value.toLowerCase() || '';
    $('#labs-table').innerHTML = labTable(state.labs.filter(item => `${item.nombre} ${item.codigo}`.toLowerCase().includes(term)));
  }
  if (page === 'equipos') {
    const term = $('[data-filter="equipment-search"]')?.value.toLowerCase() || '';
    const lab = $('[data-filter="equipment-lab"]')?.value || '';
    const filtered = state.equipment.filter(item => (!lab || String(item.laboratorio_id) === lab) && `${item.codigo} ${item.tipo} ${item.marca}`.toLowerCase().includes(term));
    const html = renderEquipment(filtered, state.labs, state.user);
    const start = html.indexOf('<div class="table-wrap">');
    const end = html.indexOf('</section>');
    $('#equipment-table').innerHTML = start >= 0 ? html.slice(start, end).replace(/<\/div>\s*$/, '') : emptyState('No hay equipos que coincidan con los filtros.');
  }
  if (page === 'incidencias') {
    const term = $('[data-filter="incident-search"]')?.value.toLowerCase() || '';
    const status = $('[data-filter="incident-state"]')?.value || '';
    const lab = $('[data-filter="incident-lab"]')?.value || '';
    const priority = $('[data-filter="incident-priority"]')?.value || '';
    const filtered = state.incidents.filter(item => (!status || item.estado === status) && (!lab || String(item.laboratorio_id) === lab) && (!priority || item.prioridad === priority) && `${item.codigo} ${item.equipo || ''} ${item.descripcion}`.toLowerCase().includes(term));
    const html = renderIncidents(filtered, state.labs);
    const start = html.indexOf('<div class="table-wrap">');
    const end = html.indexOf('</section>');
    $('#incident-table').innerHTML = start >= 0 ? html.slice(start, end).replace(/<\/div>\s*$/, '') : emptyState('No hay incidencias con estos filtros.');
  }
}

function reportDates() {
  const selection = $('[data-filter="stats-period"]')?.value || 'week';
  const end = new Date();
  const start = new Date(end);
  if (selection === 'today') start.setTime(end.getTime());
  else if (selection === 'previous') { const weekday = (end.getDay() + 6) % 7; start.setDate(end.getDate() - weekday - 7); end.setDate(start.getDate() + 6); }
  else if (selection === 'month') start.setDate(1);
  else if (selection === 'last-month') { start.setDate(1); start.setMonth(start.getMonth() - 1); end.setDate(0); }
  else if (selection === 'week') start.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  else if (selection === 'custom') {
    const customStart = $('[data-filter="stats-start"]')?.value;
    const customEnd = $('[data-filter="stats-end"]')?.value;
    if (!customStart || !customEnd) throw new Error('Selecciona ambas fechas para el rango personalizado.');
    if (customStart > customEnd) throw new Error('La fecha inicial debe ser anterior a la fecha final.');
    return { start: customStart, end: customEnd };
  }
  return { start: localDate(start), end: localDate(end) };
}

function downloadReport() {
  const s = state.stats;
  const lines = [['Resumen SIGELAB'], ['Fecha inicial', s.start], ['Fecha final', s.end], ['Inspecciones', s.summary.inspecciones], ['Incidencias nuevas', s.summary.nuevas], ['Incidencias resueltas', s.summary.resueltas], ['Incidencias pendientes', s.summary.pendientes], ['Incidencias críticas', s.summary.criticas], ['Días promedio para resolver', s.summary.dias_promedio ?? '—'], [], ['Laboratorio', 'Incidencias', 'Disponibilidad'], ...s.byLab.map(row => { const lab = s.labs.find(item => item.nombre === row.nombre); const percent = lab && Number(lab.total_pc) ? Number(lab.operativas) / Number(lab.total_pc) * 100 : 100; return [row.nombre, row.total, `${percent.toFixed(1)}%`]; }), [], ['Categoría', 'Incidencias'], ...s.byType.map(row => [row.nombre, row.total]), [], ['Estado', 'Incidencias'], ...s.byState.map(row => [row.nombre, row.total]), [], ['Equipo recurrente', 'Incidencias'], ...s.recurrent.map(row => [row.codigo, row.total])];
  const csv = lines.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `sigelab-reporte-${s.start}-${s.end}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function handleClick(event) {
  const link = event.target.closest('[data-page]');
  if (link) { event.preventDefault(); return loadPage(link.dataset.page); }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  try {
    if (action === 'close-modal' || action === 'backdrop-close' && event.target === button) closeModal();
    else if (action === 'new-inspection') return startInspection();
    else if (action === 'retry-page') return loadPage();
    else if (action === 'lab-detail') return await showLab(button.dataset.id);
    else if (action === 'equipment-detail') return await showEquipment(button.dataset.id);
      else if (action === 'inspection-detail') return await showInspection(button.dataset.id);
    else if (action === 'resume-inspection') return await resumeInspection(button.dataset.id);
    else if (action === 'incident-detail') return await showIncident(button.dataset.id);
    else if (action === 'lab-inspection') { closeModal(); await startInspection(); $('#inspection-lab').value = button.dataset.id; await createDraft(button.dataset.id); state.wizard.step = 1; renderWizard(); }
    else if (action === 'add-equipment') equipmentForm();
    else if (action === 'edit-equipment') { const item = state.equipment.find(row => Number(row.id) === Number(button.dataset.id)); if (!item) { state.equipment = await api('/equipment'); return equipmentForm(state.equipment.find(row => Number(row.id) === Number(button.dataset.id))); } equipmentForm(item); }
    else if (action === 'deactivate-equipment') {
      if (!confirm('¿Desactivar este equipo? Se conservará su historial, pero saldrá del inventario activo.')) return;
      await api(`/equipment/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ activo: false }) });
      closeModal(); toast('Equipo desactivado.'); await loadPage('equipos');
    } else if (action === 'add-maintenance') maintenanceForm();
    else if (action === 'add-user') userForm();
        else if (action === 'save-maintenance') {
          const status = $(`[data-maintenance-state="${button.dataset.id}"]`)?.value;
          await api(`/maintenance/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ estado: status }) });
          toast('Estado de mantenimiento actualizado.'); await loadPage('mantenimientos');
        } else if (action === 'toggle-user') {
          await api(`/users/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ estado: button.dataset.next }) });
          toast(button.dataset.next === 'ACTIVO' ? 'Cuenta activada.' : 'Cuenta desactivada.'); await loadPage('usuarios');
        }
    else if (action === 'save-draft') { readWizardFields(); await saveDraft(); }
    else if (action === 'wizard-next') return wizardNext();
    else if (action === 'wizard-prev') { readWizardFields(); state.wizard.step = Math.max(0, state.wizard.step - 1); renderWizard(); }
    else if (action === 'finalize-inspection') return finalizeInspection();
    else if (action === 'set-check') {
      readWizardFields();
      const { item, category, value } = button.dataset;
      state.wizard.details[item] ||= {};
      Object.assign(state.wizard.details[item], { categoria: category, estado: value, prioridad: state.wizard.details[item].prioridad || 'MEDIA', tipo_problema: state.wizard.details[item].tipo_problema || item });
      if (value === 'OPERATIVO' || value === 'NO APLICA') state.wizard.details[item].observacion = '';
      renderWizard(); scheduleDraft();
    } else if (action === 'computer-answer') { readWizardFields(); state.wizard.computerAnswer = button.dataset.answer === 'yes'; if (state.wizard.computerAnswer) state.wizard.computerIssues = {}; renderWizard(); scheduleDraft(); }
    else if (action === 'apply-stats') {
      state.reportFilters = { ...reportDates(), period: $('[data-filter="stats-period"]')?.value || 'week', lab: $('[data-filter="stats-lab"]')?.value || '', equipment: $('[data-filter="stats-equipment"]')?.value.trim() || '', status: $('[data-filter="stats-status"]')?.value || '', priority: $('[data-filter="stats-priority"]')?.value || '' };
      await loadPage();
    }
    else if (action === 'export-report') downloadReport();
  } catch (error) { toast(error.message, true); }
}

async function handleSubmit(event) {
  const form = event.target;
  if (!form.matches('form')) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.id === 'login-form') {
      const result = await api('/login', { method: 'POST', body: JSON.stringify(data) });
      state.user = result.user; state.page = 'dashboard'; state.wizard = null;
      showApplication(); await Promise.all([api('/labs').then(labs => { state.labs = labs; }), loadPage('dashboard')]);
    } else if (form.id === 'equipment-form') {
      const id = form.dataset.id;
      if (id) await api(`/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      else await api('/equipment', { method: 'POST', body: JSON.stringify(data) });
      closeModal(); toast(id ? 'Inventario actualizado.' : 'Equipo registrado.'); await loadPage('equipos');
    } else if (form.id === 'maintenance-form') {
      await api('/maintenance', { method: 'POST', body: JSON.stringify(data) });
      closeModal(); toast('Mantenimiento registrado.'); await loadPage('mantenimientos');
    } else if (form.id === 'user-form') {
      await api('/users', { method: 'POST', body: JSON.stringify(data) });
      closeModal(); toast('Usuario creado.'); await loadPage('usuarios');
    } else if (form.id === 'incident-update-form') {
      await api(`/incidents/${form.dataset.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      closeModal(); toast(data.estado === 'RESUELTA' ? 'Incidencia resuelta. El estado del equipo se recalculó.' : 'Seguimiento actualizado.'); await loadPage(state.page);
    } else if (form.id === 'incident-note-form') {
      await api(`/incidents/${form.dataset.id}/note`, { method: 'POST', body: JSON.stringify(data) });
      closeModal(); toast('Seguimiento agregado al historial.'); await loadPage(state.page);
    }
  } catch (error) {
    if (form.id === 'login-form') $('#login-error').textContent = error.message;
    else toast(error.message, true);
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.id === 'inspection-lab') { state.wizard.labId = target.value; return renderWizard(); }
  if (target.matches('[data-check-field]')) {
    updateCheck(target.dataset.item, target.dataset.checkField, target.value);
    if (target.dataset.checkField === 'observacion') state.wizard.details[target.dataset.item].observacion = target.value;
  }
  if (target.matches('[data-computer]')) {
    const id = target.dataset.computer;
    if (target.checked) state.wizard.computerIssues[id] = { tipo: '', descripcion: '', prioridad: 'ALTA', observacion: '' };
    else delete state.wizard.computerIssues[id];
    renderWizard(); scheduleDraft();
  }
  if (target.matches('[data-computer-field]')) {
    const issue = state.wizard.computerIssues[target.dataset.id];
    if (issue) issue[target.dataset.computerField] = target.value;
    scheduleDraft();
  }
  if (target.id === 'general-observation') { state.wizard.observation = target.value; scheduleDraft(); }
  if (target.matches('[data-filter]')) syncFilterResults();
    if (target.matches('[data-user-role]')) {
      api(`/users/${target.dataset.userRole}`, { method: 'PATCH', body: JSON.stringify({ rol: target.value }) })
        .then(() => toast('Perfil actualizado.')).catch(error => toast(error.message, true));
    }
  if (target.matches('[data-filter="stats-period"]')) {
    const custom = target.value === 'custom';
    $('[data-filter="stats-start"]').hidden = !custom;
    $('[data-filter="stats-end"]').hidden = !custom;
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.matches('[data-filter="labs"], [data-filter="equipment-search"], [data-filter="incident-search"]')) syncFilterResults();
  if (target.matches('[data-check-field]')) {
    state.wizard.details[target.dataset.item] ||= {};
    state.wizard.details[target.dataset.item][target.dataset.checkField] = target.value;
    scheduleDraft();
  }
  if (target.matches('[data-computer-field]')) {
    const issue = state.wizard.computerIssues[target.dataset.id];
    if (issue) issue[target.dataset.computerField] = target.value;
    scheduleDraft();
  }
  if (target.id === 'general-observation') { state.wizard.observation = target.value; scheduleDraft(); }
}

async function initialize() {
  try {
    const session = await api('/me');
    state.user = session.user;
    showApplication();
    await loadPage('dashboard');
  } catch { showLogin(); }
}

$('#login-form').addEventListener('submit', handleSubmit);
$('#page-content').addEventListener('click', handleClick);
$('#page-content').addEventListener('submit', handleSubmit);
$('#page-content').addEventListener('change', handleChange);
$('#page-content').addEventListener('input', handleInput);
$('#modal-root').addEventListener('click', handleClick);
$('#modal-root').addEventListener('submit', handleSubmit);
$('#main-navigation').addEventListener('click', handleClick);
  $('#logout-button').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch {}
  state.user = null; state.wizard = null; showLogin();
});
$('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

initialize();