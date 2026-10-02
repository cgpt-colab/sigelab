CREATE DATABASE IF NOT EXISTS sigelab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sigelab;

CREATE TABLE IF NOT EXISTS roles (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL UNIQUE,
  descripcion VARCHAR(255) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  apellido VARCHAR(80) NOT NULL,
  correo VARCHAR(160) NOT NULL UNIQUE,
  contrasena VARCHAR(255) NOT NULL,
  rol_id TINYINT UNSIGNED NOT NULL,
  estado ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuario_rol FOREIGN KEY (rol_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS laboratorios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  ubicacion VARCHAR(160) NOT NULL DEFAULT '',
  descripcion TEXT,
  estado ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  responsable_id INT UNSIGNED NULL,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lab_responsable FOREIGN KEY (responsable_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS equipos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(40) NOT NULL UNIQUE,
  laboratorio_id INT UNSIGNED NOT NULL,
  tipo ENUM('Computadora','Monitor','Teclado','Mouse','Datashow','Pantalla TV','Aire acondicionado','Switch','Router','Access Point','UPS','Impresora','Otro') NOT NULL DEFAULT 'Otro',
  marca VARCHAR(80) NOT NULL DEFAULT '',
  modelo VARCHAR(100) NOT NULL DEFAULT '',
  numero_serie VARCHAR(100) NOT NULL DEFAULT '',
  numero_inventario VARCHAR(100) NOT NULL DEFAULT '',
  descripcion TEXT,
  estado ENUM('OPERATIVO','OPERATIVO CON OBSERVACION','NO OPERATIVO','EN MANTENIMIENTO','FUERA DE SERVICIO') NOT NULL DEFAULT 'OPERATIVO',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_equipo_lab FOREIGN KEY (laboratorio_id) REFERENCES laboratorios(id),
  INDEX idx_equipo_lab_activo (laboratorio_id, activo), INDEX idx_equipo_tipo (tipo)
);

CREATE TABLE IF NOT EXISTS inspecciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  laboratorio_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NULL,
  observacion_general TEXT,
  resultado VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE',
  estado ENUM('BORRADOR','EN PROCESO','FINALIZADA') NOT NULL DEFAULT 'BORRADOR',
  creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inspeccion_lab FOREIGN KEY (laboratorio_id) REFERENCES laboratorios(id),
  CONSTRAINT fk_inspeccion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_inspeccion_fecha (fecha, laboratorio_id)
);

CREATE TABLE IF NOT EXISTS categorias_inspeccion (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items_inspeccion (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  categoria_id INT UNSIGNED NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_item_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_inspeccion(id) ON DELETE CASCADE,
  UNIQUE KEY uq_item_categoria_nombre (categoria_id, nombre)
);

CREATE TABLE IF NOT EXISTS detalle_inspeccion (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inspeccion_id INT UNSIGNED NOT NULL,
  categoria VARCHAR(80) NOT NULL,
  item VARCHAR(160) NOT NULL,
  estado ENUM('OPERATIVO','CON OBSERVACION','NO OPERATIVO','NO APLICA') NOT NULL,
  observacion TEXT,
  tipo_problema VARCHAR(100) NOT NULL DEFAULT '',
  prioridad ENUM('BAJA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'MEDIA',
  equipo_id INT UNSIGNED NULL,
  CONSTRAINT fk_detalle_inspeccion FOREIGN KEY (inspeccion_id) REFERENCES inspecciones(id),
  CONSTRAINT fk_detalle_equipo FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS incidencias (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(20) NULL UNIQUE,
  laboratorio_id INT UNSIGNED NOT NULL,
  equipo_id INT UNSIGNED NULL,
  inspeccion_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NOT NULL,
  tipo VARCHAR(100) NOT NULL,
  descripcion TEXT NOT NULL,
  prioridad ENUM('BAJA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'MEDIA',
  estado ENUM('PENDIENTE','EN REVISION','EN MANTENIMIENTO','ESPERANDO REPUESTO','RESUELTA') NOT NULL DEFAULT 'PENDIENTE',
  fecha_reporte TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_primera_atencion DATETIME NULL,
  fecha_resolucion DATETIME NULL,
  responsable VARCHAR(160) NOT NULL DEFAULT '',
  accion_realizada TEXT,
  diagnostico TEXT,
  observaciones TEXT,
  CONSTRAINT fk_incidencia_lab FOREIGN KEY (laboratorio_id) REFERENCES laboratorios(id),
  CONSTRAINT fk_incidencia_equipo FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE SET NULL,
  CONSTRAINT fk_incidencia_inspeccion FOREIGN KEY (inspeccion_id) REFERENCES inspecciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_incidencia_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_incidencia_estado (estado, fecha_reporte), INDEX idx_incidencia_equipo (equipo_id, estado)
);

CREATE TABLE IF NOT EXISTS historial_incidencias (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incidencia_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  estado_anterior VARCHAR(40) NOT NULL DEFAULT '',
  estado_nuevo VARCHAR(40) NOT NULL DEFAULT '',
  comentario TEXT NOT NULL,
  fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hist_incidencia FOREIGN KEY (incidencia_id) REFERENCES incidencias(id),
  CONSTRAINT fk_hist_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_historial_fecha (incidencia_id, fecha)
);

CREATE TABLE IF NOT EXISTS mantenimientos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  equipo_id INT UNSIGNED NOT NULL,
  tipo ENUM('PREVENTIVO','CORRECTIVO') NOT NULL,
  descripcion TEXT NOT NULL,
  fecha_inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_fin DATETIME NULL,
  responsable VARCHAR(160) NOT NULL,
  estado ENUM('PROGRAMADO','EN PROCESO','COMPLETADO','CANCELADO') NOT NULL DEFAULT 'PROGRAMADO',
  resultado TEXT,
  observaciones TEXT,
  CONSTRAINT fk_mantenimiento_equipo FOREIGN KEY (equipo_id) REFERENCES equipos(id),
  INDEX idx_mantenimiento_equipo (equipo_id, fecha_inicio)
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash CHAR(64) PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  expira_en DATETIME NOT NULL,
  CONSTRAINT fk_sesion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_sesion_expira (expira_en)
);

INSERT IGNORE INTO roles (id, nombre, descripcion) VALUES
  (1, 'Administrador', 'Gestion general del sistema'),
  (2, 'Coordinador Académico', 'Supervision, inventario e incidencias'),
  (3, 'Docente', 'Inspecciones y reporte de anomalías');

INSERT IGNORE INTO laboratorios (codigo, nombre, ubicacion, descripcion) VALUES
  ('LAB-01', 'Laboratorio 1', 'Edificio académico', 'Laboratorio de cómputo 1'),
  ('LAB-02', 'Laboratorio 2', 'Edificio académico', 'Laboratorio de cómputo 2'),
  ('LAB-03', 'Laboratorio 3', 'Edificio académico', 'Laboratorio de cómputo 3'),
  ('LAB-04', 'Laboratorio 4', 'Edificio académico', 'Laboratorio de cómputo 4'),
  ('LAB-MAC', 'Laboratorio MAC', 'Edificio académico', 'Laboratorio de equipos Mac');

INSERT IGNORE INTO categorias_inspeccion (nombre, orden) VALUES
  ('Infraestructura', 1), ('Equipamiento', 2), ('Seguridad', 3), ('Orden y limpieza', 4), ('Recursos adicionales', 5);

INSERT IGNORE INTO items_inspeccion (categoria_id, nombre, orden)
SELECT c.id, i.nombre, i.orden FROM categorias_inspeccion c JOIN (
  SELECT 'Infraestructura' categoria, 'Instalación eléctrica' nombre, 1 orden UNION ALL
  SELECT 'Infraestructura','Tomas eléctricas',2 UNION ALL SELECT 'Infraestructura','Cableado de red',3 UNION ALL
  SELECT 'Infraestructura','Acceso a Internet',4 UNION ALL SELECT 'Infraestructura','Puertas y cerraduras',5 UNION ALL
  SELECT 'Infraestructura','Mobiliario',6 UNION ALL SELECT 'Infraestructura','Iluminación',7 UNION ALL
  SELECT 'Infraestructura','Aire acondicionado',8 UNION ALL SELECT 'Equipamiento','Equipos identificados',1 UNION ALL
  SELECT 'Equipamiento','Computadoras en buen estado y limpias',2 UNION ALL SELECT 'Equipamiento','Monitores disponibles',3 UNION ALL
  SELECT 'Equipamiento','Teclados y mouse disponibles',4 UNION ALL SELECT 'Equipamiento','Equipos organizados',5 UNION ALL
  SELECT 'Seguridad','Normas visibles',1 UNION ALL SELECT 'Seguridad','Sin cables peligrosos',2 UNION ALL
  SELECT 'Seguridad','Extintores disponibles y vigentes',3 UNION ALL SELECT 'Seguridad','Áreas despejadas',4 UNION ALL
  SELECT 'Seguridad','Condiciones eléctricas seguras',5 UNION ALL SELECT 'Seguridad','Iluminación adecuada',6 UNION ALL
  SELECT 'Orden y limpieza','Laboratorio limpio',1 UNION ALL SELECT 'Orden y limpieza','Equipos limpios',2 UNION ALL
  SELECT 'Orden y limpieza','Mesas ordenadas',3 UNION ALL SELECT 'Orden y limpieza','Pasillos despejados',4 UNION ALL
  SELECT 'Orden y limpieza','Área general organizada',5 UNION ALL SELECT 'Recursos adicionales','Pantalla TV y Datashow',1 UNION ALL
  SELECT 'Recursos adicionales','Interruptores y equipos audiovisuales',2 UNION ALL SELECT 'Recursos adicionales','Otros recursos',3
) i ON i.categoria = c.nombre;

INSERT IGNORE INTO equipos (codigo, laboratorio_id, tipo, marca, modelo)
SELECT CONCAT('PC-L', CAST(SUBSTRING(l.codigo, 6) AS UNSIGNED), '-', LPAD(n.numero, 2, '0')), l.id, 'Computadora', 'Lenovo', 'ThinkCentre'
FROM laboratorios l JOIN (
  SELECT 1 numero UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
) n ON l.codigo IN ('LAB-01','LAB-02','LAB-03','LAB-04')
AND NOT EXISTS (
  SELECT 1 FROM equipos existing
  WHERE existing.laboratorio_id=l.id AND existing.tipo='Computadora'
    AND existing.codigo IN (
      CONCAT('PC-L', CAST(SUBSTRING(l.codigo, 6) AS UNSIGNED), '-', LPAD(n.numero, 2, '0')),
      CONCAT('PC-L0', CAST(SUBSTRING(l.codigo, 6) AS UNSIGNED), '-', LPAD(n.numero, 2, '0'))
    )
);

INSERT IGNORE INTO equipos (codigo, laboratorio_id, tipo, marca, modelo)
SELECT CONCAT('MAC-', LPAD(n.numero, 2, '0')), l.id, 'Computadora', 'Apple', 'iMac'
FROM laboratorios l JOIN (SELECT 1 numero UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) n
WHERE l.codigo = 'LAB-MAC';

INSERT IGNORE INTO equipos (codigo, laboratorio_id, tipo, marca, modelo)
SELECT CONCAT('PROY-', REPLACE(l.codigo, 'LAB-', ''), '-01'), l.id, 'Datashow', '', '' FROM laboratorios l;