const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: true,
  ssl: { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
});

const tablesWithIds = new Set([
  'roles', 'usuarios', 'laboratorios', 'equipos', 'inspecciones', 'categorias_inspeccion',
  'items_inspeccion', 'detalle_inspeccion', 'incidencias', 'historial_incidencias', 'mantenimientos'
]);

function translateSql(statement) {
  let sql = statement
    .replace(/DATE_SUB\(CURDATE\(\),\s*INTERVAL\s+1\s+DAY\)/gi, "(CURRENT_DATE - INTERVAL '1 day')")
    .replace(/DATE_SUB\(NOW\(\),\s*INTERVAL\s+1\s+DAY\)/gi, "(NOW() - INTERVAL '1 day')")
    .replace(/DATE_ADD\(NOW\(\),\s*INTERVAL\s+12\s+HOUR\)/gi, "(NOW() + INTERVAL '12 hours')")
    .replace(/DATEDIFF\(NOW\(\),\s*([\w.]+)\)/gi, '(CURRENT_DATE - $1::date)')
    .replace(/DATE\((i\.fecha_(?:reporte|resolucion))\)/gi, '$1::date')
    .replace(/DATE_FORMAT\(i\.fecha_reporte,\s*'%d\/%m'\)/gi, "TO_CHAR(i.fecha_reporte, 'DD/MM')")
    .replace(/TIMESTAMPDIFF\(HOUR,\s*i\.fecha_reporte,\s*i\.fecha_resolucion\)/gi, '(EXTRACT(EPOCH FROM (i.fecha_resolucion - i.fecha_reporte)) / 3600)')
    .replace(/CHAR\(10\)/gi, "E'\\n'")
    .replace(/\bCURDATE\(\)/gi, 'CURRENT_DATE')
    .replace(/\bCURTIME\(\)/gi, 'LOCALTIME')
    .replace(/\bLIKE\b/gi, 'ILIKE')
    .replace(/\b((?:\w+\.)?activo)\s*=\s*1\b/gi, '$1 = TRUE')
    .replace(/\b((?:\w+\.)?activo)\s*=\s*0\b/gi, '$1 = FALSE');

  const insert = /^\s*INSERT\s+INTO\s+(?:public\.)?([a-z_]+)/i.exec(sql);
  if (insert && tablesWithIds.has(insert[1].toLowerCase()) && !/\bRETURNING\b/i.test(sql)) {
    sql = `${sql.trim().replace(/;$/, '')} RETURNING id`;
  }

  let parameter = 0;
  return sql.replace(/\?/g, () => `$${++parameter}`);
}

function isSelect(statement) {
  return /^\s*(SELECT|WITH)\b/i.test(statement);
}

async function run(client, statement, values = []) {
  const result = await client.query(translateSql(statement), values);
  if (isSelect(statement)) return [result.rows, result.fields];
  if (/^\s*INSERT\b/i.test(statement)) {
    return [{ insertId: result.rows[0]?.id, affectedRows: result.rowCount }, result.fields];
  }
  return [{ affectedRows: result.rowCount }, result.fields];
}

const poolFacade = {
  execute: (statement, values) => run(pool, statement, values),
  query: (statement, values) => run(pool, statement, values),
  async getConnection() {
    const client = await pool.connect();
    return {
      execute: (statement, values) => run(client, statement, values),
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK'),
      release: () => client.release()
    };
  },
  end: () => pool.end()
};

module.exports = { pool: poolFacade, initializeConnection: () => pool.query('SELECT 1'), translateSql };