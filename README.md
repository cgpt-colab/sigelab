# SIGELAB

Sistema de Gestión y Supervisión de Laboratorios de Cómputo para UNICAH.

## Puesta en marcha local

1. Instala Node.js LTS y MySQL 8.
2. Crea el esquema ejecutando `database/database.sql` en MySQL Workbench o con el cliente de MySQL.
3. Copia `.env.example` como `.env` y configura el usuario y la contraseña de MySQL.
4. Instala las dependencias e inicia el sistema desde esta carpeta:

```powershell
npm install
npm start
```

5. Abre `http://localhost:3000`.

La primera ejecución crea cuatro cuentas de prueba con la contraseña definida en `SEED_PASSWORD`. Define una contraseña privada de al menos 12 caracteres en `.env` antes del primer inicio; no publiques ni compartas ese archivo.

| Perfil | Correo |
| --- | --- |
| Coordinador Académico | coordinacion@sigelab.edu.hn |
| Docente 1 | docente1@sigelab.edu.hn |
| Docente 2 | docente2@sigelab.edu.hn |
| Administrador | admin@sigelab.edu.hn |

El conjunto de demostración incluye cinco laboratorios. Laboratorio 2 inicia con diez computadoras y la incidencia `INC-0001` abierta para `PC-L2-03`, con prioridad alta. En la tabla de incidencias se puede cambiar su estado y resolverla; el estado y la disponibilidad del equipo se recalculan usando las demás incidencias activas.

## Perfiles

- Coordinación Académica consulta todos los módulos y administra el inventario base.
- Docencia consulta equipos, inspecciona laboratorios y registra observaciones e incidencias.
- Administración puede consultar el sistema y crear usuarios.

Las inspecciones y las incidencias se conservan como historial. Ninguna inspección cierra por sí sola una incidencia. Para resolver una se debe documentar la acción, la observación y el responsable.

## Desarrollo

```powershell
npm run dev
```

## Despliegue en Netlify con MySQL

Netlify sirve la interfaz estática y ejecuta la API existente mediante una Netlify Function ligera (`netlify/functions/api.js`). MySQL debe estar en un proveedor con acceso remoto desde Netlify; un MySQL instalado solo en tu computadora no es accesible desde el sitio publicado.

1. Ejecuta `database/database.sql` en el servidor MySQL remoto.
2. En Netlify, conecta este repositorio y despliega la rama `main`.
3. En las variables de entorno del sitio configura `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SEED_PASSWORD` y `DB_CONNECTION_LIMIT=1`.
4. Verifica que el proveedor MySQL permita conexiones remotas desde las funciones de Netlify. Algunos hostings compartidos solo aceptan IPs previamente autorizadas y no son compatibles con IPs de salida dinámicas.

La interfaz utiliza HTML, CSS y JavaScript nativos. El backend es Node.js con `mysql2`; `serverless-http` solo adapta el API existente al runtime de Netlify Functions.