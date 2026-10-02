const test = require('node:test');
const assert = require('node:assert/strict');
const { translateSql } = require('../database/pg-pool');
const { normalizeFunctionEvent } = require('../netlify/functions/api.js');

test('translates MySQL placeholders and date expressions to PostgreSQL', () => {
  const sql = translateSql(`SELECT * FROM inspecciones WHERE laboratorio_id=? AND fecha=CURDATE()
    AND fecha_reporte > DATE_SUB(NOW(), INTERVAL 1 DAY)`);
  assert.match(sql, /laboratorio_id=\$1/);
  assert.match(sql, /fecha=CURRENT_DATE/);
  assert.match(sql, /NOW\(\) - INTERVAL '1 day'/);
});

test('adds RETURNING id to inserts used by the API', () => {
  const sql = translateSql('INSERT INTO public.inspecciones (laboratorio_id) VALUES (?)');
  assert.match(sql, /VALUES \(\$1\) RETURNING id$/);
});

test('translates reporting expressions and boolean filters', () => {
  const sql = translateSql(`SELECT DATEDIFF(NOW(), i.fecha_reporte),
    TIMESTAMPDIFF(HOUR, i.fecha_reporte, i.fecha_resolucion),
    DATE_FORMAT(i.fecha_reporte, '%d/%m'), CONCAT_WS(CHAR(10), observaciones, ?)
    FROM incidencias i JOIN equipos e ON e.id=i.equipo_id WHERE e.activo=1 AND DATE(i.fecha_reporte) BETWEEN ? AND ?`);
  assert.match(sql, /CURRENT_DATE - i\.fecha_reporte::date/);
  assert.match(sql, /EXTRACT\(EPOCH FROM/);
  assert.match(sql, /TO_CHAR\(i\.fecha_reporte, 'DD\/MM'\)/);
  assert.match(sql, /CONCAT_WS\(E'\\n', observaciones, \$1\)/);
  assert.match(sql, /e\.activo = TRUE/);
  assert.match(sql, /i\.fecha_reporte::date BETWEEN \$2 AND \$3/);
  assert.doesNotMatch(sql, /DATEDIFF|TIMESTAMPDIFF|DATE_FORMAT|CHAR\(10\)/);
});

test('maps Netlify function paths back to the existing API routes', () => {
  const event = normalizeFunctionEvent({ path: '/.netlify/functions/api/dashboard' });
  assert.equal(event.path, '/api/dashboard');
  assert.equal(normalizeFunctionEvent({ path: '/api/dashboard' }).path, '/api/dashboard');
});