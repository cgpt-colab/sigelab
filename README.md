# SIGELAB

Sistema de Gestión y Supervisión de Laboratorios de Cómputo para UNICAH.

## Despliegue con Supabase y Netlify

1. En Supabase, ejecuta `database/supabase.sql` una vez desde **SQL Editor**.
2. En Netlify, conecta el repositorio de GitHub y usa la rama `main`. `netlify.toml` publica `public/` y enruta `/api/*` a la Netlify Function.
3. En las variables de entorno del sitio configura `DATABASE_URL` con el URI **Transaction pooler** de Supabase (puerto 6543), `DATABASE_SSL_REJECT_UNAUTHORIZED=true`, `NODE_ENV=production` y `SEED_PASSWORD` con una contraseña privada de al menos 12 caracteres.
4. Vuelve a desplegar. En la primera petición API se crean las cuatro cuentas de demostración y el escenario persistente del Laboratorio 2.

Para ejecutar localmente contra Supabase, copia `.env.example` como `.env`, completa los valores privados e inicia:

```powershell
npm install
npm start
```

Después abre `http://localhost:3000`.

Las cuatro cuentas iniciales comparten el valor configurado en `SEED_PASSWORD`; es una comodidad para el prototipo académico, no un flujo de producción.

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

La interfaz usa JavaScript nativo y PostgreSQL en Supabase almacena los datos. Las rutas API se ejecutan como Netlify Functions; no se usa un framework de interfaz.