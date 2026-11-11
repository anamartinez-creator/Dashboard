# Estado de delivery SDM

Dashboard del Master SDM Tracker de Notion: equipo, pilotos de 90 días, SOWs sin firmar y clientes que no están On track. Tiene un filtro por SDM y está protegido con contraseña.

## Qué necesitas

1. **Una integración de Notion**
   - Entra a https://www.notion.so/profile/integrations y crea una integración *Internal* en el workspace de Puzzle. Solo necesita "Read content".
   - Copia el token (empieza con `ntn_`).
   - En Notion, abre la página **Master SDM Tracker**, ve a `•••` → **Connections** y agrega la integración. Así puede leer las bases que están dentro.

2. **Subirlo a GitHub**
   - Crea un repo **privado** (por ejemplo `sdm-status`) y sube esta carpeta.

3. **Importarlo en Vercel**
   - En Vercel: **Add New → Project**, elige el repo. Vercel detecta Next.js solo.
   - En **Environment Variables**, agrega:
     - `NOTION_TOKEN` = el token de la integración
     - `DASHBOARD_PASSWORD` = la contraseña que quieras compartir
   - Dale **Deploy**.

Al abrir el link, el navegador pide usuario y contraseña. El usuario puede ser cualquiera; lo que importa es la contraseña.

## Cómo funciona

- Los datos se leen de Notion en el servidor y se refrescan cada 5 minutos como máximo.
- Al navegador solo llegan los campos que muestra la página. **Salary Rate, Equipment, Notes y las notas del SOW Tracker nunca salen del servidor.**
- La página no aparece en buscadores (`noindex`).

## Probarlo en tu compu (opcional)

```bash
cp .env.example .env.local   # y pon tu token y contraseña
npm install
npm run dev                  # http://localhost:3000
```

## Archivos

- `lib/notion.ts`: lee Notion y decide qué campos se usan. Si renombran una propiedad en Notion, se ajusta aquí.
- `app/Dashboard.tsx`: la página con el filtro, las tablas y la gráfica.
- `middleware.ts`: la contraseña.
