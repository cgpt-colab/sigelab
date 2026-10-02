const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { pool, initializeConnection } = require('./database/pg-pool');

const scrypt = promisify(crypto.scrypt);
const root = __dirname;
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 3000);
const activeStates = ['PENDIENTE', 'EN REVISION', 'EN MANTENIMIENTO', 'ESPERANDO REPUESTO'];
const roles = { admin: 'Administrador', coordinator: 'Coordinador Académico', teacher: 'Docente' };
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon'
};

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function fail(res, status, message) {
  json(res, status, { error: message });
}

function cookieValue(req, name) {
  const pair = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}

function sessionCookie(token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `sigelab_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

async function bodyJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw Object.assign(new Error('La solicitud excede el tamaño permitido.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('El contenido enviado no es válido.'), { status: 400 }); }
}

function safeText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function normalized(value) {
  return safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = await scrypt(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

async function currentUser(req) {
  const token = cookieValue(req, 'sigelab_session');
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [rows] = await pool.execute(
    `SELECT u.id, u.nombre, u.apellido, u.correo, r.nombre AS rol
     FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id JOIN roles r ON r.id = u.rol_id
     WHERE s.token_hash = ? AND s.expira_en > NOW() AND u.estado = 'ACTIVO'`, [tokenHash]
  );
  return rows[0] || null;
}

function requireRole(user, allowed) {
  if (!user) throw Object.assign(new Error('Inicia sesión para continuar.'), { status: 401 });
  if (!allowed.includes(user.rol)) throw Object.assign(new Error('Tu perfil no tiene permiso para realizar esta acción.'), { status: 403 });
}

const coordinatorRoles = [roles.coordinator];
const inspectionRoles = [roles.teacher, roles.coordinator, roles.admin];
const viewRoles = [roles.teacher, roles.coordinator, roles.admin];

async function seedAccounts() {
  const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
  if (Number(count.total) > 0) {
    await seedPersistenceScenario();
    return;
  }
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Configura SEED_PASSWORD con al menos 12 caracteres antes de crear las cuentas iniciales.');
  }
  const demoUsers = [
    ['Administrador', 'SIGELAB', 'admin@sigelab.edu.hn', roles.admin],
    ['Coordinador', 'Académico', 'coordinacion@sigelab.edu.hn', roles.coordinator],
    ['Docente', 'Uno', 'docente1@sigelab.edu.hn', roles.teacher],
    ['Docente', 'Dos', 'docente2@sigelab.edu.hn', roles.teacher]
  ];
  for (const [nombre, apellido, correo, rol] of demoUsers) {
    const [[role]] = await pool.execute('SELECT id FROM roles WHERE nombre = ?', [rol]);
    await pool.execute(
      'INSERT INTO usuarios (nombre, apellido, correo, contrasena, rol_id) VALUES (?, ?, ?, ?, ?)',
      [nombre, apellido, correo, await passwordHash(password), role.id]
    );
  }
  await seedPersistenceScenario();
}

async function seedPersistenceScenario() {
  const [labs] = await pool.execute('SELECT id FROM laboratorios WHERE codigo=\'LAB-02\'');
  const [teachers] = await pool.execute('SELECT id FROM usuarios WHERE correo=\'docente1@sigelab.edu.hn\'');
  if (!labs[0] || !teachers[0]) return;
  const labId = labs[0].id;
  const teacherId = teachers[0].id;
  for (let number = 1; number <= 10; number += 1) {
    const code = `PC-L2-${String(number).padStart(2, '0')}`;
    const legacyCode = `PC-L02-${String(number).padStart(2, '0')}`;
    const [[canonical]] = await pool.execute('SELECT id FROM equipos WHERE codigo=?', [code]);
    const [[legacy]] = await pool.execute('SELECT id FROM equipos WHERE codigo=? AND laboratorio_id=?', [legacyCode, labId]);
    if (!canonical && legacy) await pool.execute('UPDATE equipos SET codigo=? WHERE id=?', [code, legacy.id]);
    else if (!canonical) await pool.execute(`INSERT INTO equipos (codigo, laboratorio_id, tipo, marca, modelo)
      VALUES (?, ?, 'Computadora', 'Lenovo', 'ThinkCentre') ON CONFLICT (codigo) DO NOTHING`, [code, labId]);
  }
  const [[existing]] = await pool.execute('SELECT id FROM incidencias WHERE codigo=\'INC-0001\'');
  if (existing) return;
  const [computer] = await pool.execute('SELECT id FROM equipos WHERE codigo=\'PC-L2-03\'');
  if (!computer[0]) return;
  const [inspection] = await pool.execute(`INSERT INTO inspecciones (laboratorio_id, usuario_id, fecha, hora_inicio, hora_fin, observacion_general, resultado, estado)
    VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '08:00:00', '08:15:00', 'Escenario de demostración de persistencia.', 'CON HALLAZGOS', 'FINALIZADA')`, [labId, teacherId]);
  await pool.execute(`INSERT INTO incidencias (codigo, laboratorio_id, equipo_id, inspeccion_id, usuario_id, tipo, descripcion, prioridad, estado, fecha_reporte)
    VALUES ('INC-0001', ?, ?, ?, ?, 'Encendido', 'No enciende', 'ALTA', 'PENDIENTE', DATE_SUB(NOW(), INTERVAL 1 DAY))`, [labId, computer[0].id, inspection.insertId, teacherId]);
  const [[incident]] = await pool.execute('SELECT id FROM incidencias WHERE codigo=\'INC-0001\'');
  await pool.execute(`INSERT INTO detalle_inspeccion (inspeccion_id, categoria, item, estado, observacion, tipo_problema, prioridad, equipo_id)
    VALUES (?, 'Equipamiento', 'Equipo: PC-L2-03', 'NO OPERATIVO', 'No enciende', 'Encendido', 'ALTA', ?)`, [inspection.insertId, computer[0].id]);
  await pool.execute(`INSERT INTO historial_incidencias (incidencia_id, usuario_id, estado_anterior, estado_nuevo, comentario)
    VALUES (?, ?, '', 'PENDIENTE', 'Incidencia creada en la inspección inicial de demostración.')`, [incident.id, teacherId]);
}

async function queryAll(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getDashboard() {
  const labs = await queryAll(`
    SELECT l.id, l.codigo, l.nombre, l.ubicacion,
      (SELECT COUNT(*) FROM equipos e WHERE e.laboratorio_id=l.id AND e.activo=1) AS total_equipos,
      (SELECT COUNT(*) FROM equipos e WHERE e.laboratorio_id=l.id AND e.activo=1 AND e.tipo='Computadora') AS total_pc,
      (SELECT COUNT(*) FROM equipos e WHERE e.laboratorio_id=l.id AND e.activo=1 AND e.tipo='Computadora'
        AND NOT EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado <> 'RESUELTA' AND i.prioridad IN ('ALTA','CRITICA'))
        AND NOT EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado='EN MANTENIMIENTO')
        AND NOT EXISTS (SELECT 1 FROM mantenimientos m WHERE m.equipo_id=e.id AND m.estado='EN PROCESO')) AS operativas,
      (SELECT COUNT(*) FROM equipos e WHERE e.laboratorio_id=l.id AND e.activo=1 AND e.tipo='Computadora'
        AND EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado <> 'RESUELTA' AND i.prioridad IN ('ALTA','CRITICA'))
        AND NOT EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado='EN MANTENIMIENTO')
        AND NOT EXISTS (SELECT 1 FROM mantenimientos m WHERE m.equipo_id=e.id AND m.estado='EN PROCESO')) AS no_operativas,
      (SELECT COUNT(*) FROM equipos e WHERE e.laboratorio_id=l.id AND e.activo=1 AND e.tipo='Computadora'
        AND EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado <> 'RESUELTA' AND i.prioridad NOT IN ('ALTA','CRITICA'))
        AND NOT EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado <> 'RESUELTA' AND i.prioridad IN ('ALTA','CRITICA'))
        AND NOT EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado='EN MANTENIMIENTO')
        AND NOT EXISTS (SELECT 1 FROM mantenimientos m WHERE m.equipo_id=e.id AND m.estado='EN PROCESO')) AS observaciones,
      (SELECT COUNT(*) FROM equipos e WHERE e.laboratorio_id=l.id AND e.activo=1 AND e.tipo='Computadora'
        AND (EXISTS (SELECT 1 FROM mantenimientos m WHERE m.equipo_id=e.id AND m.estado='EN PROCESO')
          OR EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado='EN MANTENIMIENTO'))) AS en_mantenimiento,
      (SELECT COUNT(*) FROM incidencias i WHERE i.laboratorio_id=l.id AND i.estado <> 'RESUELTA') AS incidencias_activas,
      (SELECT COUNT(*) FROM incidencias i WHERE i.laboratorio_id=l.id AND i.estado <> 'RESUELTA' AND i.prioridad='CRITICA') AS criticas,
      (SELECT MAX(fecha) FROM inspecciones x WHERE x.laboratorio_id=l.id AND x.estado='FINALIZADA') AS ultima_inspeccion
    FROM laboratorios l WHERE l.estado='ACTIVO' ORDER BY l.id`);
  const [[summary]] = await pool.query(`
    SELECT (SELECT COUNT(*) FROM laboratorios WHERE estado='ACTIVO') AS laboratorios,
      (SELECT COUNT(*) FROM equipos WHERE activo=1) AS equipos,
      (SELECT COUNT(*) FROM equipos WHERE activo=1 AND tipo='Computadora') AS computadoras,
      (SELECT COUNT(*) FROM incidencias WHERE estado <> 'RESUELTA') AS incidencias_activas,
      (SELECT COUNT(*) FROM incidencias WHERE estado <> 'RESUELTA' AND prioridad='CRITICA') AS incidencias_criticas,
      (SELECT COUNT(*) FROM incidencias WHERE estado='RESUELTA') AS incidencias_resueltas,
      (SELECT COUNT(*) FROM inspecciones WHERE fecha=CURDATE() AND estado='FINALIZADA') AS inspecciones_hoy,
      (SELECT COUNT(*) FROM inspecciones WHERE fecha=CURDATE() AND estado <> 'FINALIZADA') AS inspecciones_pendientes`);
  const pcOperational = labs.reduce((sum, lab) => sum + Number(lab.operativas), 0);
  const pcObserved = labs.reduce((sum, lab) => sum + Number(lab.observaciones), 0);
  const pcUnavailable = labs.reduce((sum, lab) => sum + Number(lab.no_operativas) + Number(lab.en_mantenimiento), 0);
  const today = new Date();
  const todayLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const openAlerts = await queryAll(`SELECT i.id, i.codigo, i.descripcion, i.prioridad, i.estado, i.fecha_reporte,
      DATEDIFF(NOW(), i.fecha_reporte) AS dias_abierta, l.nombre AS laboratorio, e.codigo AS equipo
    FROM incidencias i JOIN laboratorios l ON l.id=i.laboratorio_id LEFT JOIN equipos e ON e.id=i.equipo_id
    WHERE i.estado <> 'RESUELTA' ORDER BY (i.prioridad='CRITICA') DESC, i.fecha_reporte ASC LIMIT 6`);
  const alerts = [...openAlerts];
  for (const lab of labs) {
    const percent = Number(lab.total_pc) ? Number(lab.operativas) / Number(lab.total_pc) * 100 : 100;
    if (percent < 85) alerts.push({ codigo: 'Disponibilidad crítica', descripcion: `La disponibilidad está en ${percent.toFixed(1)}%.`, prioridad: 'CRITICA', estado: 'ATENCION', laboratorio: lab.nombre, dias_abierta: '—' });
    const lastInspection = lab.ultima_inspeccion ? new Date(`${String(lab.ultima_inspeccion).slice(0, 10)}T12:00:00`) : null;
    if (!lastInspection || (Date.now() - lastInspection.getTime()) / 86400000 > 7) alerts.push({ codigo: 'Inspección pendiente', descripcion: 'No se ha registrado una inspección reciente.', prioridad: 'MEDIA', estado: 'ATENCION', laboratorio: lab.nombre, dias_abierta: '—' });
  }
  const recurrentEquipment = await queryAll(`SELECT e.codigo, l.nombre AS laboratorio, COUNT(i.id) AS total
    FROM equipos e JOIN laboratorios l ON l.id=e.laboratorio_id JOIN incidencias i ON i.equipo_id=e.id
    GROUP BY e.id, e.codigo, l.nombre HAVING COUNT(i.id) >= 2 ORDER BY total DESC LIMIT 3`);
  for (const item of recurrentEquipment) alerts.push({ codigo: item.codigo, equipo: item.codigo, descripcion: `Equipo reincidente con ${item.total} fallas registradas.`, prioridad: 'ALTA', estado: 'ATENCION', laboratorio: item.laboratorio, dias_abierta: '—' });
  const operativas = labs.reduce((sum, lab) => sum + Number(lab.operativas), 0);
  const computadoras = labs.reduce((sum, lab) => sum + Number(lab.total_pc), 0);
  return { labs, summary: { ...summary, pc_operativas: pcOperational, pc_observadas: pcObserved, pc_con_problemas: pcObserved + pcUnavailable, disponibilidad: computadoras ? Math.round((operativas / computadoras) * 1000) / 10 : 100 }, alerts: alerts.slice(0, 8), today: todayLabel };
}

async function getLabs() {
  const dashboard = await getDashboard();
  return dashboard.labs;
}

async function getEquipment(filters = {}) {
  const clauses = ['e.activo=1'];
  const params = [];
  if (filters.lab) { clauses.push('e.laboratorio_id=?'); params.push(Number(filters.lab)); }
  if (filters.search) { clauses.push('(e.codigo LIKE ? OR e.tipo LIKE ? OR e.marca LIKE ?)'); const term = `%${safeText(filters.search, 120)}%`; params.push(term, term, term); }
  return queryAll(`SELECT e.*, l.nombre AS laboratorio,
    CASE WHEN e.activo=0 THEN 'FUERA DE SERVICIO'
      WHEN EXISTS (SELECT 1 FROM mantenimientos m WHERE m.equipo_id=e.id AND m.estado='EN PROCESO') THEN 'EN MANTENIMIENTO'
      WHEN EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado='EN MANTENIMIENTO') THEN 'EN MANTENIMIENTO'
      WHEN EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado <> 'RESUELTA' AND i.prioridad IN ('ALTA','CRITICA')) THEN 'NO OPERATIVO'
      WHEN EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado <> 'RESUELTA') THEN 'OPERATIVO CON OBSERVACION'
      ELSE 'OPERATIVO' END AS estado_actual,
    (SELECT COUNT(*) FROM incidencias i WHERE i.equipo_id=e.id AND i.estado <> 'RESUELTA') AS incidencias_activas
    FROM equipos e JOIN laboratorios l ON l.id=e.laboratorio_id WHERE ${clauses.join(' AND ')} ORDER BY l.id, e.codigo`, params);
}

async function getIncidents(filters = {}) {
  const clauses = ['1=1'];
  const params = [];
  if (filters.estado) { clauses.push('i.estado=?'); params.push(safeText(filters.estado, 40)); }
  if (filters.lab) { clauses.push('i.laboratorio_id=?'); params.push(Number(filters.lab)); }
  if (filters.priority) { clauses.push('i.prioridad=?'); params.push(safeText(filters.priority, 20)); }
  if (filters.search) { const term = `%${safeText(filters.search, 120)}%`; clauses.push('(i.codigo LIKE ? OR i.descripcion LIKE ? OR e.codigo LIKE ?)'); params.push(term, term, term); }
  return queryAll(`SELECT i.*, l.nombre AS laboratorio, e.codigo AS equipo, u.nombre AS reportado_por,
      u.apellido AS apellido_reportado, DATEDIFF(NOW(), i.fecha_reporte) AS dias_abierta
    FROM incidencias i JOIN laboratorios l ON l.id=i.laboratorio_id
    LEFT JOIN equipos e ON e.id=i.equipo_id JOIN usuarios u ON u.id=i.usuario_id
    WHERE ${clauses.join(' AND ')} ORDER BY (i.estado='RESUELTA'), (i.prioridad='CRITICA') DESC, i.fecha_reporte DESC`, params);
}

async function createIncident(connection, item, context) {
  const { labId, inspectionId, userId } = context;
  const equipmentId = item.equipo_id ? Number(item.equipo_id) : null;
  const type = safeText(item.tipo_problema || item.item || 'Anomalía', 100);
  const description = safeText(item.descripcion || item.observacion, 3000);
  const priority = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'].includes(item.prioridad) ? item.prioridad : 'MEDIA';
  if (!description) throw Object.assign(new Error('Cada anomalía requiere una descripción.'), { status: 400 });
  if (equipmentId) {
    await connection.execute('SELECT id FROM equipos WHERE id=? FOR UPDATE', [equipmentId]);
    const [activeForEquipment] = await connection.execute(`SELECT id, codigo, tipo, descripcion FROM incidencias
      WHERE equipo_id=? AND estado <> 'RESUELTA' FOR UPDATE`, [equipmentId]);
    const duplicate = activeForEquipment.find(row => normalized(row.tipo) === normalized(type) && normalized(row.descripcion) === normalized(description));
    if (duplicate) {
      const note = safeText(item.observacion, 3000) || 'Se confirmó que la incidencia continúa activa durante una nueva inspección.';
      await connection.execute('UPDATE incidencias SET observaciones=CONCAT_WS(CHAR(10), NULLIF(observaciones,\'\'), ?) WHERE id=?', [note, duplicate.id]);
      await connection.execute('INSERT INTO historial_incidencias (incidencia_id, usuario_id, estado_anterior, estado_nuevo, comentario) VALUES (?, ?, ?, ?, ?)',
        [duplicate.id, userId, '', '', `Incidencia confirmada durante inspección #${inspectionId}: ${note}`]);
      return { codigo: duplicate.codigo, duplicate: true };
    }
  }
  const [result] = await connection.execute(`INSERT INTO incidencias
    (codigo, laboratorio_id, equipo_id, inspeccion_id, usuario_id, tipo, descripcion, prioridad, estado, observaciones)
    VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)`,
  [labId, equipmentId, inspectionId, userId, type, description, priority, safeText(item.observacion, 3000)]);
  const code = `INC-${String(result.insertId).padStart(4, '0')}`;
  await connection.execute('UPDATE incidencias SET codigo=? WHERE id=?', [code, result.insertId]);
  await connection.execute('INSERT INTO historial_incidencias (incidencia_id, usuario_id, estado_anterior, estado_nuevo, comentario) VALUES (?, ?, ?, ?, ?)',
    [result.insertId, userId, '', 'PENDIENTE', `Incidencia creada en inspección #${inspectionId}.`]);
  return { codigo: code, duplicate: false };
}

async function api(req, res, url) {
  const pathname = url.pathname;
  const method = req.method;

  if (pathname === '/api/health' && method === 'GET') return json(res, 200, { ok: true });
  if (pathname === '/api/login' && method === 'POST') {
    const input = await bodyJson(req);
    const [users] = await pool.execute(`SELECT u.id, u.nombre, u.apellido, u.correo, u.contrasena, u.estado, r.nombre AS rol
      FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.correo=? LIMIT 1`, [safeText(input.correo, 160).toLowerCase()]);
    const user = users[0];
    if (!user || user.estado !== 'ACTIVO' || !await verifyPassword(input.contrasena || '', user.contrasena)) return fail(res, 401, 'Correo o contraseña incorrectos.');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.execute('INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 12 HOUR))', [tokenHash, user.id]);
    return json(res, 200, { user: { id: user.id, nombre: user.nombre, apellido: user.apellido, correo: user.correo, rol: user.rol } }, { 'Set-Cookie': sessionCookie(token, 43200) });
  }

  const user = await currentUser(req);
  if (pathname === '/api/me' && method === 'GET') return user ? json(res, 200, { user }) : fail(res, 401, 'La sesión ha expirado.');
  if (pathname === '/api/logout' && method === 'POST') {
    const token = cookieValue(req, 'sigelab_session');
    if (token) await pool.execute('DELETE FROM sesiones WHERE token_hash=?', [crypto.createHash('sha256').update(token).digest('hex')]);
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }
  requireRole(user, viewRoles);

  if (pathname === '/api/dashboard' && method === 'GET') return json(res, 200, await getDashboard());
  if (pathname === '/api/labs' && method === 'GET') return json(res, 200, await getLabs());
  if (pathname === '/api/equipment' && method === 'GET') return json(res, 200, await getEquipment(Object.fromEntries(url.searchParams)));
  if (pathname === '/api/incidents' && method === 'GET') return json(res, 200, await getIncidents(Object.fromEntries(url.searchParams)));
  if (pathname === '/api/inspections' && method === 'GET') {
    const conditions = user.rol === roles.teacher ? 'WHERE x.usuario_id=?' : 'WHERE 1=1';
    const values = user.rol === roles.teacher ? [user.id] : [];
    const rows = await queryAll(`SELECT x.*, l.nombre AS laboratorio, u.nombre AS docente, u.apellido AS apellido_docente
      FROM inspecciones x JOIN laboratorios l ON l.id=x.laboratorio_id JOIN usuarios u ON u.id=x.usuario_id ${conditions}
      ORDER BY x.fecha DESC, x.hora_inicio DESC LIMIT 250`, values);
    return json(res, 200, rows);
  }
  if (pathname.startsWith('/api/inspections/') && method === 'GET') {
    const id = Number(pathname.split('/').at(-1));
    const [rows] = await pool.execute(`SELECT x.*, l.nombre AS laboratorio, u.nombre AS docente, u.apellido AS apellido_docente
      FROM inspecciones x JOIN laboratorios l ON l.id=x.laboratorio_id JOIN usuarios u ON u.id=x.usuario_id WHERE x.id=?`, [id]);
    if (!rows[0]) return fail(res, 404, 'No se encontró la inspección.');
    if (user.rol === roles.teacher && rows[0].usuario_id !== user.id) return fail(res, 403, 'Solo puedes consultar tus propias inspecciones.');
    const [details] = await pool.execute('SELECT * FROM detalle_inspeccion WHERE inspeccion_id=? ORDER BY categoria, id', [id]);
    const [incidents] = await pool.execute(`SELECT i.id, i.codigo, e.codigo AS equipo, i.tipo, i.descripcion, i.prioridad, i.estado
      FROM incidencias i LEFT JOIN equipos e ON e.id=i.equipo_id WHERE i.inspeccion_id=?`, [id]);
    return json(res, 200, { ...rows[0], detalles: details, incidencias: incidents });
  }
  if (pathname === '/api/maintenance' && method === 'GET') return json(res, 200, await queryAll(`SELECT m.*, e.codigo AS equipo, l.nombre AS laboratorio
    FROM mantenimientos m JOIN equipos e ON e.id=m.equipo_id JOIN laboratorios l ON l.id=e.laboratorio_id ORDER BY m.fecha_inicio DESC LIMIT 250`));
  if (pathname === '/api/stats' && method === 'GET') {
    const start = safeText(url.searchParams.get('start'), 10) || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const end = safeText(url.searchParams.get('end'), 10) || new Date().toISOString().slice(0, 10);
    const period = safeText(url.searchParams.get('period'), 20) || 'week';
    const labFilter = Number(url.searchParams.get('lab')) || 0;
    const equipmentFilter = safeText(url.searchParams.get('equipment'), 40);
    const priorityFilter = safeText(url.searchParams.get('priority'), 20);
    const statusFilter = safeText(url.searchParams.get('status'), 40);
    const filters = [];
    const filterParams = [];
    if (labFilter) { filters.push('i.laboratorio_id=?'); filterParams.push(labFilter); }
    if (equipmentFilter) { filters.push('e.codigo=?'); filterParams.push(equipmentFilter); }
    if (priorityFilter) { filters.push('i.prioridad=?'); filterParams.push(priorityFilter); }
    if (statusFilter) { filters.push('i.estado=?'); filterParams.push(statusFilter); }
    const filterSql = filters.length ? ` AND ${filters.join(' AND ')}` : '';
    const dateParams = [start, end, ...filterParams];
    const incidentFrom = 'FROM incidencias i LEFT JOIN equipos e ON e.id=i.equipo_id';
    const [[inspections], [newIncidents], [resolvedIncidents], [pendingIncidents], [criticalIncidents], [resolutionTime]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM inspecciones WHERE estado='FINALIZADA' AND fecha BETWEEN ? AND ?${labFilter ? ' AND laboratorio_id=?' : ''}`, labFilter ? [start, end, labFilter] : [start, end]),
      pool.execute(`SELECT COUNT(*) AS total ${incidentFrom} WHERE DATE(i.fecha_reporte) BETWEEN ? AND ?${filterSql}`, dateParams),
      pool.execute(`SELECT COUNT(*) AS total ${incidentFrom} WHERE DATE(i.fecha_resolucion) BETWEEN ? AND ?${filterSql}`, dateParams),
      pool.execute(`SELECT COUNT(*) AS total ${incidentFrom} WHERE i.estado<>'RESUELTA'${filterSql}`, filterParams),
      pool.execute(`SELECT COUNT(*) AS total ${incidentFrom} WHERE i.estado<>'RESUELTA' AND i.prioridad='CRITICA'${filterSql}`, filterParams),
      pool.execute(`SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, i.fecha_reporte, i.fecha_resolucion))/24,1) AS total ${incidentFrom}
        WHERE i.fecha_resolucion IS NOT NULL AND DATE(i.fecha_resolucion) BETWEEN ? AND ?${filterSql}`, dateParams)
    ]);
    const summary = {
      inspecciones: inspections[0].total, nuevas: newIncidents[0].total, resueltas: resolvedIncidents[0].total,
      pendientes: pendingIncidents[0].total, criticas: criticalIncidents[0].total, dias_promedio: resolutionTime[0].total
    };
    const byLab = await queryAll(`SELECT l.nombre, COUNT(f.id) AS total FROM laboratorios l LEFT JOIN (
      SELECT i.id, i.laboratorio_id ${incidentFrom} WHERE DATE(i.fecha_reporte) BETWEEN ? AND ?${filterSql}
      ) f ON f.laboratorio_id=l.id GROUP BY l.id ORDER BY total DESC`, dateParams);
    const byType = await queryAll(`SELECT i.tipo AS nombre, COUNT(*) AS total ${incidentFrom}
      WHERE DATE(i.fecha_reporte) BETWEEN ? AND ?${filterSql} GROUP BY i.tipo ORDER BY total DESC LIMIT 8`, dateParams);
    const byState = await queryAll(`SELECT i.estado AS nombre, COUNT(*) AS total ${incidentFrom}
      WHERE DATE(i.fecha_reporte) BETWEEN ? AND ?${filterSql} GROUP BY i.estado ORDER BY total DESC`, dateParams);
    const timeline = await queryAll(`SELECT DATE_FORMAT(i.fecha_reporte, '%d/%m') AS nombre, COUNT(*) AS total ${incidentFrom}
      WHERE DATE(i.fecha_reporte) BETWEEN ? AND ?${filterSql} GROUP BY DATE(i.fecha_reporte) ORDER BY DATE(i.fecha_reporte)`, dateParams);
    const recurrent = await queryAll(`SELECT e.codigo, l.nombre AS laboratorio, COUNT(i.id) AS total FROM equipos e
      JOIN laboratorios l ON l.id=e.laboratorio_id JOIN incidencias i ON i.equipo_id=e.id
      WHERE DATE(i.fecha_reporte) BETWEEN ? AND ?${filterSql} GROUP BY e.id, e.codigo, l.nombre ORDER BY total DESC LIMIT 6`, dateParams);
    return json(res, 200, { start, end, filters: { period, lab: labFilter, equipment: equipmentFilter, priority: priorityFilter, status: statusFilter }, summary, byLab, byType, byState, timeline, recurrent, labs: await getLabs() });
  }

  if (pathname.startsWith('/api/incidents/') && method === 'GET') {
    const id = Number(pathname.split('/').at(-1));
    const [rows] = await pool.execute(`SELECT i.*, l.nombre AS laboratorio, e.codigo AS equipo, u.nombre AS reportado_por,
      DATEDIFF(NOW(), i.fecha_reporte) AS dias_abierta
      FROM incidencias i JOIN laboratorios l ON l.id=i.laboratorio_id LEFT JOIN equipos e ON e.id=i.equipo_id
      JOIN usuarios u ON u.id=i.usuario_id WHERE i.id=?`, [id]);
    if (!rows[0]) return fail(res, 404, 'No se encontró la incidencia.');
    const history = await queryAll(`SELECT h.*, u.nombre, u.apellido FROM historial_incidencias h JOIN usuarios u ON u.id=h.usuario_id WHERE h.incidencia_id=? ORDER BY h.fecha`, [id]);
    return json(res, 200, { ...rows[0], history });
  }
  if (pathname.startsWith('/api/equipment/') && method === 'GET') {
    const id = Number(pathname.split('/').at(-1));
    const [equipment] = await pool.execute(`SELECT e.*, l.nombre AS laboratorio,
      CASE WHEN EXISTS (SELECT 1 FROM mantenimientos m WHERE m.equipo_id=e.id AND m.estado='EN PROCESO') THEN 'EN MANTENIMIENTO'
      WHEN EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado='EN MANTENIMIENTO') THEN 'EN MANTENIMIENTO'
      WHEN EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado<>'RESUELTA' AND i.prioridad IN ('ALTA','CRITICA')) THEN 'NO OPERATIVO'
      WHEN EXISTS (SELECT 1 FROM incidencias i WHERE i.equipo_id=e.id AND i.estado<>'RESUELTA') THEN 'OPERATIVO CON OBSERVACION' ELSE 'OPERATIVO' END AS estado_actual
      FROM equipos e JOIN laboratorios l ON l.id=e.laboratorio_id WHERE e.id=?`, [id]);
    if (!equipment[0]) return fail(res, 404, 'No se encontró el equipo.');
    const events = await queryAll(`SELECT fecha_reporte AS fecha, 'Incidencia'::text AS evento,
      codigo::text AS referencia, descripcion::text AS detalle, estado::text AS estado, responsable::text AS responsable
      FROM incidencias WHERE equipo_id=?
      UNION ALL SELECT fecha_inicio, ('Mantenimiento ' || tipo)::text, id::text, descripcion::text, estado::text, responsable::text
      FROM mantenimientos WHERE equipo_id=?
      ORDER BY fecha DESC`, [id, id]);
    return json(res, 200, { ...equipment[0], events });
  }
  if (pathname.startsWith('/api/labs/') && method === 'GET') {
    const id = Number(pathname.split('/').at(-1));
    const lab = (await getLabs()).find(row => Number(row.id) === id);
    if (!lab) return fail(res, 404, 'No se encontró el laboratorio.');
    const [equipment, incidents, inspections] = await Promise.all([
      getEquipment({ lab: id }), getIncidents({ lab: id }),
      queryAll(`SELECT x.*, u.nombre AS docente, u.apellido AS apellido_docente FROM inspecciones x JOIN usuarios u ON u.id=x.usuario_id WHERE x.laboratorio_id=? ORDER BY fecha DESC LIMIT 20`, [id])
    ]);
    return json(res, 200, { ...lab, equipment, incidents, inspections });
  }

  if (pathname === '/api/equipment' && method === 'POST') {
    requireRole(user, coordinatorRoles);
    const input = await bodyJson(req);
    const code = safeText(input.codigo, 40).toUpperCase();
    const labId = Number(input.laboratorio_id);
    if (!code || !labId || !safeText(input.tipo, 80)) return fail(res, 400, 'Código, laboratorio y tipo son obligatorios.');
    try {
      const [result] = await pool.execute(`INSERT INTO equipos (codigo, laboratorio_id, tipo, marca, modelo, numero_serie, numero_inventario, descripcion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [code, labId, input.tipo, safeText(input.marca, 80), safeText(input.modelo, 100), safeText(input.numero_serie, 100), safeText(input.numero_inventario, 100), safeText(input.descripcion)]);
      return json(res, 201, { id: result.insertId, codigo: code });
    } catch (error) { if (error.code === '23505') return fail(res, 409, 'Ya existe un equipo con ese código.'); throw error; }
  }
  if (pathname.startsWith('/api/equipment/') && method === 'PATCH') {
    requireRole(user, coordinatorRoles);
    const id = Number(pathname.split('/').at(-1));
    const input = await bodyJson(req);
    if (input.activo === false) await pool.execute('UPDATE equipos SET activo=0, estado=\'FUERA DE SERVICIO\' WHERE id=?', [id]);
    else {
      const fields = ['laboratorio_id', 'tipo', 'marca', 'modelo', 'numero_serie', 'numero_inventario', 'descripcion', 'codigo'];
      const values = fields.filter(key => input[key] !== undefined);
      if (!values.length) return fail(res, 400, 'No hay cambios para guardar.');
      const set = values.map(key => `${key}=?`).join(', ');
      await pool.execute(`UPDATE equipos SET ${set} WHERE id=?`, [...values.map(key => input[key]), id]);
    }
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/inspections' && method === 'POST') {
    requireRole(user, inspectionRoles);
    const input = await bodyJson(req);
    const labId = Number(input.laboratorio_id);
    if (!labId) return fail(res, 400, 'Selecciona un laboratorio.');
    const [result] = await pool.execute(`INSERT INTO inspecciones (laboratorio_id, usuario_id, fecha, hora_inicio, estado) VALUES (?, ?, CURDATE(), CURTIME(), 'BORRADOR')`, [labId, user.id]);
    return json(res, 201, { id: result.insertId });
  }
  if (pathname.startsWith('/api/inspections/') && method === 'PUT') {
    requireRole(user, inspectionRoles);
    const id = Number(pathname.split('/').at(-1));
    const input = await bodyJson(req);
    const [found] = await pool.execute('SELECT id, laboratorio_id, usuario_id, estado FROM inspecciones WHERE id=?', [id]);
    const inspection = found[0];
    if (!inspection) return fail(res, 404, 'No se encontró la inspección.');
    if (inspection.estado === 'FINALIZADA') return fail(res, 409, 'Las inspecciones finalizadas no se pueden editar.');
    if (user.rol === roles.teacher && inspection.usuario_id !== user.id) return fail(res, 403, 'Solo puedes editar tus propias inspecciones.');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('DELETE FROM detalle_inspeccion WHERE inspeccion_id=?', [id]);
      for (const detail of input.detalles || []) {
        await connection.execute(`INSERT INTO detalle_inspeccion (inspeccion_id, categoria, item, estado, observacion, tipo_problema, prioridad, equipo_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, safeText(detail.categoria, 80), safeText(detail.item, 160), detail.estado, safeText(detail.observacion), safeText(detail.tipo_problema, 100), detail.prioridad || 'MEDIA', detail.equipo_id || null]);
      }
      await connection.execute('UPDATE inspecciones SET observacion_general=?, estado=\'EN PROCESO\' WHERE id=?', [safeText(input.observacion_general), id]);
      await connection.commit();
      return json(res, 200, { ok: true });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  if (pathname.startsWith('/api/inspections/') && method === 'POST' && pathname.endsWith('/finalize')) {
    requireRole(user, inspectionRoles);
    const id = Number(pathname.split('/')[3]);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [found] = await connection.execute('SELECT * FROM inspecciones WHERE id=? FOR UPDATE', [id]);
      const inspection = found[0];
      if (!inspection || (user.rol === roles.teacher && inspection.usuario_id !== user.id)) throw Object.assign(new Error('No se encontró la inspección o no tienes permiso.'), { status: 404 });
      if (inspection.estado === 'FINALIZADA') throw Object.assign(new Error('Esta inspección ya fue finalizada.'), { status: 409 });
      const [details] = await connection.execute('SELECT * FROM detalle_inspeccion WHERE inspeccion_id=?', [id]);
      if (!details.length) throw Object.assign(new Error('Completa los apartados de la inspección antes de finalizar.'), { status: 400 });
      const [requiredItems] = await connection.execute(`SELECT c.nombre AS categoria, i.nombre AS item FROM items_inspeccion i
        JOIN categorias_inspeccion c ON c.id=i.categoria_id ORDER BY c.orden, i.orden`);
      const missingItem = requiredItems.find(required => !details.some(detail => detail.categoria === required.categoria && detail.item === required.item && detail.estado));
      if (missingItem) throw Object.assign(new Error(`Indica el estado de «${missingItem.item}» antes de finalizar.`), { status: 400 });
      const missingObservation = details.find(detail => detail.estado === 'CON OBSERVACION' && !safeText(detail.observacion));
      if (missingObservation) throw Object.assign(new Error(`Agrega una observación para «${missingObservation.item}».`), { status: 400 });
      const [issues] = await connection.execute(`SELECT d.*, e.laboratorio_id AS equipo_lab FROM detalle_inspeccion d LEFT JOIN equipos e ON e.id=d.equipo_id WHERE d.inspeccion_id=? AND d.estado='NO OPERATIVO'`, [id]);
      for (const issue of issues) {
        if (!safeText(issue.observacion)) throw Object.assign(new Error(`Describe el problema de «${issue.item}» antes de finalizar.`), { status: 400 });
        if (issue.equipo_id && Number(issue.equipo_lab) !== Number(inspection.laboratorio_id)) throw Object.assign(new Error('El equipo seleccionado no pertenece a este laboratorio.'), { status: 400 });
        await createIncident(connection, { equipo_id: issue.equipo_id, item: issue.item, tipo_problema: issue.tipo_problema, descripcion: issue.observacion, prioridad: issue.prioridad }, { labId: inspection.laboratorio_id, inspectionId: id, userId: user.id });
      }
      const [general] = await connection.execute('SELECT observacion_general FROM inspecciones WHERE id=?', [id]);
      await connection.execute('UPDATE inspecciones SET estado=\'FINALIZADA\', hora_fin=CURTIME(), resultado=? WHERE id=?', [issues.length ? 'CON HALLAZGOS' : 'SIN HALLAZGOS', id]);
      await connection.commit();
      return json(res, 200, { ok: true, incidencias_reportadas: issues.length, observacion_general: general[0].observacion_general });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  if (pathname.startsWith('/api/incidents/') && method === 'PATCH') {
    requireRole(user, [roles.coordinator, roles.admin]);
    const id = Number(pathname.split('/')[3]);
    const input = await bodyJson(req);
    const allowedStates = ['PENDIENTE', 'EN REVISION', 'EN MANTENIMIENTO', 'ESPERANDO REPUESTO', 'RESUELTA'];
    if (!allowedStates.includes(input.estado)) return fail(res, 400, 'Selecciona un estado válido.');
    if (input.estado === 'RESUELTA' && (!safeText(input.accion_realizada) || !safeText(input.responsable) || !safeText(input.observaciones))) return fail(res, 400, 'Para resolver registra la acción realizada, responsable y observación.');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT estado FROM incidencias WHERE id=? FOR UPDATE', [id]);
      if (!rows[0]) throw Object.assign(new Error('No se encontró la incidencia.'), { status: 404 });
      const old = rows[0].estado;
      await connection.execute(`UPDATE incidencias SET estado=?, responsable=COALESCE(NULLIF(?, ''), responsable),
        observaciones=CONCAT_WS(CHAR(10), NULLIF(observaciones,''), NULLIF(?,'')),
        accion_realizada=CASE WHEN ?='RESUELTA' THEN ? ELSE accion_realizada END,
        diagnostico=CASE WHEN ?='RESUELTA' THEN ? ELSE diagnostico END,
        fecha_primera_atencion=CASE WHEN ?<>'PENDIENTE' AND fecha_primera_atencion IS NULL THEN NOW() ELSE fecha_primera_atencion END,
        fecha_resolucion=CASE WHEN ?='RESUELTA' THEN NOW() ELSE NULL END WHERE id=?`,
      [input.estado, safeText(input.responsable, 160), safeText(input.observaciones), input.estado, safeText(input.accion_realizada), input.estado, safeText(input.diagnostico), input.estado, input.estado, id]);
      await connection.execute('INSERT INTO historial_incidencias (incidencia_id, usuario_id, estado_anterior, estado_nuevo, comentario) VALUES (?, ?, ?, ?, ?)',
        [id, user.id, old, input.estado, safeText(input.comentario || input.observaciones || input.accion_realizada, 3000) || `Estado actualizado a ${input.estado}.`]);
      await connection.commit();
      return json(res, 200, { ok: true });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  if (pathname.startsWith('/api/incidents/') && method === 'POST' && pathname.endsWith('/note')) {
    requireRole(user, [roles.coordinator, roles.admin, roles.teacher]);
    const id = Number(pathname.split('/')[3]);
    const input = await bodyJson(req);
    const note = safeText(input.comentario, 3000);
    if (!note) return fail(res, 400, 'Escribe el seguimiento antes de guardarlo.');
    const [rows] = await pool.execute('SELECT estado FROM incidencias WHERE id=? AND estado<>\'RESUELTA\'', [id]);
    if (!rows[0]) return fail(res, 404, 'No se encontró una incidencia activa.');
    await pool.execute('UPDATE incidencias SET observaciones=CONCAT_WS(CHAR(10), NULLIF(observaciones,\'\'), ?) WHERE id=?', [note, id]);
    await pool.execute('INSERT INTO historial_incidencias (incidencia_id, usuario_id, estado_anterior, estado_nuevo, comentario) VALUES (?, ?, ?, ?, ?)', [id, user.id, rows[0].estado, rows[0].estado, note]);
    return json(res, 201, { ok: true });
  }

  if (pathname === '/api/maintenance' && method === 'POST') {
    requireRole(user, [roles.coordinator, roles.admin]);
    const input = await bodyJson(req);
    if (!input.equipo_id || !['PREVENTIVO', 'CORRECTIVO'].includes(input.tipo) || !safeText(input.descripcion) || !safeText(input.responsable)) return fail(res, 400, 'Completa equipo, tipo, descripción y responsable.');
    const [result] = await pool.execute(`INSERT INTO mantenimientos (equipo_id, tipo, descripcion, responsable, estado, resultado, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [Number(input.equipo_id), input.tipo, safeText(input.descripcion), safeText(input.responsable, 160), input.estado || 'PROGRAMADO', safeText(input.resultado), safeText(input.observaciones)]);
    return json(res, 201, { id: result.insertId });
  }
  if (pathname.startsWith('/api/maintenance/') && method === 'PATCH') {
    requireRole(user, [roles.coordinator, roles.admin]);
    const id = Number(pathname.split('/').at(-1));
    const input = await bodyJson(req);
    const allowedStates = ['PROGRAMADO', 'EN PROCESO', 'COMPLETADO', 'CANCELADO'];
    if (!allowedStates.includes(input.estado)) return fail(res, 400, 'Selecciona un estado válido.');
    const [result] = await pool.execute(`UPDATE mantenimientos SET estado=?, resultado=COALESCE(NULLIF(?,''), resultado),
      observaciones=CONCAT_WS(CHAR(10), NULLIF(observaciones,''), NULLIF(?,'')),
      fecha_fin=CASE WHEN ?='COMPLETADO' THEN NOW() ELSE NULL END WHERE id=?`,
    [input.estado, safeText(input.resultado), safeText(input.observaciones), input.estado, id]);
    if (!result.affectedRows) return fail(res, 404, 'No se encontró el mantenimiento.');
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/users' && method === 'GET') {
    requireRole(user, [roles.coordinator, roles.admin]);
    return json(res, 200, await queryAll(`SELECT u.id, u.nombre, u.apellido, u.correo, r.nombre AS rol, u.estado, u.fecha_creacion
      FROM usuarios u JOIN roles r ON r.id=u.rol_id ORDER BY u.nombre`));
  }
  if (pathname === '/api/users' && method === 'POST') {
    requireRole(user, [roles.admin]);
    const input = await bodyJson(req);
    const password = safeText(input.contrasena, 200);
    if (!safeText(input.nombre, 80) || !safeText(input.apellido, 80) || !safeText(input.correo, 160) || password.length < 10) return fail(res, 400, 'Completa los datos y utiliza una contraseña de al menos 10 caracteres.');
    const [roleRows] = await pool.execute('SELECT id FROM roles WHERE nombre=?', [safeText(input.rol, 60)]);
    if (!roleRows[0]) return fail(res, 400, 'Selecciona un perfil válido.');
    const [result] = await pool.execute('INSERT INTO usuarios (nombre, apellido, correo, contrasena, rol_id) VALUES (?, ?, ?, ?, ?)',
      [safeText(input.nombre, 80), safeText(input.apellido, 80), safeText(input.correo, 160).toLowerCase(), await passwordHash(password), roleRows[0].id]);
    return json(res, 201, { id: result.insertId });
  }
  if (pathname.startsWith('/api/users/') && method === 'PATCH') {
    requireRole(user, [roles.admin]);
    const id = Number(pathname.split('/').at(-1));
    const input = await bodyJson(req);
    if (input.estado && !['ACTIVO', 'INACTIVO'].includes(input.estado)) return fail(res, 400, 'El estado de la cuenta no es válido.');
    const updates = [];
    const values = [];
    if (input.estado) { updates.push('estado=?'); values.push(input.estado); }
    if (input.rol) {
      const [roleRows] = await pool.execute('SELECT id FROM roles WHERE nombre=?', [safeText(input.rol, 60)]);
      if (!roleRows[0]) return fail(res, 400, 'Selecciona un perfil válido.');
      updates.push('rol_id=?'); values.push(roleRows[0].id);
    }
    if (!updates.length) return fail(res, 400, 'No hay cambios para guardar.');
    const [result] = await pool.execute(`UPDATE usuarios SET ${updates.join(', ')} WHERE id=?`, [...values, id]);
    if (!result.affectedRows) return fail(res, 404, 'No se encontró el usuario.');
    if (input.estado === 'INACTIVO') await pool.execute('DELETE FROM sesiones WHERE usuario_id=?', [id]);
    return json(res, 200, { ok: true });
  }

  return fail(res, 404, 'No se encontró la ruta solicitada.');
}

async function staticFile(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const file = path.resolve(publicDir, `.${requested}`);
  if (!file.startsWith(publicDir + path.sep) && file !== path.join(publicDir, 'index.html')) return fail(res, 403, 'Acceso denegado.');
  try {
    const contents = await fs.promises.readFile(file);
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(contents);
  } catch { fail(res, 404, 'No se encontró el archivo.'); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await staticFile(req, res, url.pathname);
  } catch (error) {
    const status = error.status || (error.code === '23505' ? 409 : 500);
    if (status >= 500) console.error(error);
    json(res, status, { error: status === 500 ? 'Ocurrió un error al procesar la solicitud.' : error.message });
  }
});

let initialization;
async function initializeDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('Falta configurar DATABASE_URL para PostgreSQL.');
  if (!initialization) {
    initialization = (async () => {
      await initializeConnection();
      await seedAccounts();
    })();
  }
  return initialization;
}

if (require.main === module) {
  server.listen(port, async () => {
    try {
      await initializeDatabase();
      console.log(`SIGELAB disponible en http://localhost:${port}`);
    } catch (error) {
      console.error('No se pudo inicializar PostgreSQL. Verifica DATABASE_URL y el SQL de Supabase.', error.message);
      server.close(() => process.exit(1));
    }
  });
  process.on('SIGINT', async () => { await pool.end(); process.exit(0); });
}

module.exports = { server, initializeDatabase, pool };