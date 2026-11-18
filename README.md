# Health del delivery SDM

Dashboard de health del Master SDM Tracker de Notion: semáforo y score por cliente, clientes en periodo de piloto (inicio y fin), salud del equipo, personas que requieren seguimiento. Muestra solo el equipo de un SDM (Ana Martinez por defecto) y deja fuera a Customer Success. Está protegido con contraseña.

Repositorio: `anamartinez-creator/Dashboard` (el proyecto se llama `sdm-status`).

## Qué necesitas

1. **Una integración de Notion**
   - Entra a https://www.notion.so/profile/integrations y crea una integración *Internal* en el workspace de Puzzle. Solo necesita "Read content".
   - Copia el token (empieza con `ntn_`).
   - En Notion, abre la página **Master SDM Tracker**, ve a `•••` → **Connections** y agrega la integración. Así puede leer las bases que están dentro.

2. **Subirlo a GitHub**
   - Usa un repo **privado** y sube todo el contenido de esta carpeta, incluidas `app/`, `lib/` y los archivos que empiezan con punto (`.gitignore`, `.env.example`). La carga desde la web de GitHub suele omitirlos; es mejor usar `git push`:

     ```bash
     git remote add origin https://github.com/<usuario>/<repo>.git
     git push -u origin main
     ```
   - Nunca subas `.env` ni `.env.local`. Ya están en `.gitignore`.

3. **Importarlo en Vercel**
   - En Vercel: **Add New → Project**, elige el repo. Vercel detecta Next.js solo.
   - En **Settings → Environment Variables**, agrega las dos variables (para Production, Preview y Development):

     | Variable | Valor |
     | --- | --- |
     | `NOTION_TOKEN` | el token `ntn_...` de la integración |
     | `DASHBOARD_PASSWORD` | la contraseña que quieras compartir |

   - Dale **Deploy**. Si agregas o cambias variables después, haz **Redeploy**: solo aplican a deploys nuevos.

Al abrir el link, el navegador pide usuario y contraseña. El usuario puede ser cualquiera; lo que importa es la contraseña.

## Alcance

El dashboard muestra a las personas asignadas a Ana Martinez, Maria Salinas y Victor Reyes (columna `Assigned to`; la gente de Maria y Victor también cuenta en el headcount) y los clientes donde trabajan. Los clientes de Customer Success y todo lo de otros SDMs se descartan en el servidor, antes de llegar al navegador. Para cambiar el equipo, agrega en Vercel la variable opcional `SDM_TEAM` (nombres separados por coma, exactos como en Notion); `SDM_OWNER` solo cambia el nombre que se muestra y el SDM principal.

## Reglas de health

El semáforo de cada cliente es el peor de sus motivos. Las reglas están en `lib/health.ts` y se ajustan ahí.

| Color | Cuándo |
| --- | --- |
| Rojo | Cliente o persona en High Risk, SOW en Pending, o piloto vencido de alguien que sigue como New Hire |
| Amarillo | Cliente o persona en Needs Attention, SOW por confirmar o enviado sin firmar, piloto que termina en 14 días o menos, o personas sin cadencia de 1:1 |
| Verde | Todo lo demás |

El score (0 a 100) empieza en 100 y resta puntos por cada motivo; sirve para ordenar dentro de cada color. Los clientes se relacionan con personas y SOWs por nombre aunque se escriban distinto en Notion ("Proline Eng" y "Proline Engineering", "Vertex" y "VertexOne"). Los pilotos solo se evalúan para personas en New Hire o con `Pilot End` lleno.

## Cómo funciona

- Los datos se leen de Notion en el servidor y se refrescan cada minuto como máximo. La página abierta se actualiza sola cada minuto, y el botón **Actualizar ahora** (al pie) fuerza una lectura nueva de Notion. Lo que cambies en el tracker aparece en el dashboard en ~1 minuto, sin redeploy.
- Al navegador solo llegan los campos que muestra la página. **Salary Rate, Equipment, la columna Notes y las notas del SOW Tracker nunca salen del servidor.**
- Excepción: para las personas que requieren seguimiento se muestra el comentario más reciente de la tabla *1:1 Notes* de su página en Notion (fecha, Health y Comments). El servidor omite las líneas cuya etiqueta sea Wellbeing, Health, Announcements, Family, Personal o Medical. Esa regla solo detecta líneas con etiqueta; si alguien escribe algo personal en un párrafo sin etiqueta, saldrá. Quien tenga la contraseña del dashboard ve estos comentarios.
- La página no aparece en buscadores (`noindex`).

## Actualización instantánea con webhook (opcional)

Sin esto el dashboard se pone al día en ~1 minuto. Con el webhook, Notion avisa en cuanto algo cambia.

1. Haz deploy con el código actual (la ruta `/api/notion-webhook` ya existe).
2. En https://www.notion.so/profile/integrations abre tu integración → pestaña **Webhooks** → **Create a subscription**.
   - URL: `https://<tu-dominio-de-vercel>/api/notion-webhook`
   - Eventos: `page.created`, `page.properties_updated`, `page.deleted` y `page.undeleted`.
3. Notion envía un `verification_token`. Cópialo de **Vercel → Logs** (busca "Notion webhook verification_token") y pégalo en Notion para verificar la suscripción.
4. Guarda ese mismo token en Vercel como `NOTION_WEBHOOK_SECRET` y haz **Redeploy**.

Cada evento llega firmado; la ruta rechaza todo lo que no tenga una firma válida. Es la única ruta que no pide la contraseña del sitio.

## Probarlo en tu compu (opcional)

```bash
cp .env.example .env.local   # y pon tu token y contraseña
npm install
npm run dev                  # http://localhost:3000
```

Para comprobar que compila antes de subir: `npm run build`.

## Problemas comunes

- **El deploy falla por "vulnerable version of Next.js"**: actualiza `next` y `react` a una versión con parche (ver `package.json`), haz commit y push, y redeploy sin build cache.
- **Falta `NOTION_TOKEN` o `DASHBOARD_PASSWORD`**: agrégalas en Vercel (paso 3) y haz Redeploy.
- **La página sale vacía o con error de Notion (401/404)**: la integración no está conectada a la página Master SDM Tracker (`•••` → **Connections**), o el token es incorrecto.
- **Falta una columna o dato**: si renombraron una propiedad en Notion, ajústala en `lib/notion.ts`.

## Archivos

- `lib/notion.ts`: lee Notion y decide qué campos se usan. Si renombran una propiedad en Notion, se ajusta aquí.
- `lib/health.ts`: reglas del semáforo y del score.
- `app/Dashboard.tsx`: la página con las tablas y las gráficas.
- `middleware.ts`: la contraseña.
- `app/api/notion-webhook/route.ts`: recibe los avisos de Notion y refresca los datos.
- `app/api/refresh/route.ts`: el botón "Actualizar ahora".
- `.env.example`: plantilla de las variables de entorno.

## Client meetings (snapshot)

La sección "Client meetings" lee `lib/client-meetings.ts`, una lista manual (fecha, fuente, enlace) de la última reunión con cada cliente, tomada de Fathom y Google Calendar al 2026-11-18. Hoy solo cubre Sparkfire, Barosa y OTR Solutions; el resto aparece sin dato. Actualiza el archivo para añadir más.

## Estilo

El formato sigue la guía de marca de Puzzle: Puzzle Blue `#00406C`, Signal Cyan `#29ABE0`, Grow Green `#8CC63F`, Ink `#001828` y Paper `#FCFCFC`; titulares en Omnes (si está instalada, si no Poppins) y texto en Poppins; fondos planos, sin sombras ni gradientes. Los colores del semáforo (verde, ámbar, rojo) se mantienen porque comunican estado.
