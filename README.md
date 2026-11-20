# Puzzle Operations

Dashboard de operaciones de Puzzle con tres módulos en la barra lateral. Es de acceso abierto: cualquiera con el link puede verlo (no se indexa en buscadores). Para pedir contraseña, ver "Contraseña" más abajo.

| Módulo | Ruta | Fuente de datos | Qué muestra |
| --- | --- | --- | --- |
| **Software Development** | `/` | Notion (Master SDM Tracker) | Semáforo y score por cliente, pilotos, salud del equipo, personas que requieren seguimiento. Solo el equipo de un SDM (Ana Martinez por defecto); deja fuera a Customer Success. |
| **Customer Success** | `/customer-success` | Notion (mismo tracker) | La misma vista para los clientes de Customer Success. |
| **Talent Acquisition** | `/talent-acquisition` | Google Sheets (Active Job Openings y Bonuses) y, opcional, Ashby | Roles activos y su pipeline, lo que requiere atención, contrataciones por mes y quarter, demanda por cliente. |

Repositorio: `anamartinez-creator/Dashboard` (el proyecto de Vercel se llama `sdm-status`). Producción: `puzzle-operations.vercel.app`.

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
   - En **Settings → Environment Variables**, agrega las variables (para Production, y si quieres también Preview y Development):

     | Variable | Módulo | Obligatoria | Valor |
     | --- | --- | --- | --- |
     | `NOTION_TOKEN` | Software Development y Customer Success | Sí | el token `ntn_...` de la integración |
     | `GOOGLE_SERVICE_ACCOUNT_JSON` | Talent Acquisition | Sí | el JSON completo de la cuenta de servicio de Google (solo lectura) |
     | `HIRING_SHEET_ID` | Talent Acquisition | Sí | ID de la hoja "Active Job Openings" |
     | `BONUSES_SHEET_ID` | Talent Acquisition | No | ID de la hoja "Bonuses - Hires and Referrals" (ya hay un valor por defecto en `lib/hiring.ts`) |
     | `ASHBY_API_KEY` | Talent Acquisition | No | llave de Ashby de solo lectura (Candidates y Jobs); sin ella la página funciona igual, sin las etapas de Ashby |
     | `DASHBOARD_PASSWORD`, `REQUIRE_PASSWORD` | Todos | No | solo si quieres pedir contraseña |
     | `NOTION_WEBHOOK_SECRET` | Software Development | No | ver "Actualización instantánea con webhook" |
     | `SDM_TEAM`, `SDM_OWNER` | Software Development | No | ver "Alcance" |

   - Dale **Deploy**. Si agregas o cambias variables después, haz **Redeploy**: solo aplican a deploys nuevos.

Al abrir el link, el dashboard se ve directamente, sin usuario ni contraseña. Las hojas de Google deben compartirse (Viewer) con el correo de la cuenta de servicio.

**Contraseña (opcional).** Para volver a protegerlo, agrega en Vercel `REQUIRE_PASSWORD=true` y `DASHBOARD_PASSWORD` y haz Redeploy; el navegador pedirá usuario (cualquiera) y contraseña.

## Alcance

El dashboard muestra a las personas asignadas a Ana Martinez, Maria Salinas y Victor Reyes (columna `Assigned to`; la gente de Maria y Victor también cuenta en el headcount) y los clientes donde trabajan. Los clientes de Customer Success y todo lo de otros SDMs se descartan en el servidor, antes de llegar al navegador. Para cambiar el equipo, agrega en Vercel la variable opcional `SDM_TEAM` (nombres separados por coma, exactos como en Notion); `SDM_OWNER` solo cambia el nombre que se muestra y el SDM principal.

## Reglas de health

El semáforo de cada cliente es el peor de sus motivos. Las reglas están en `lib/health.ts` y se ajustan ahí.

| Color | Cuándo |
| --- | --- |
| Rojo | Cliente o persona en High Risk, SOW en Pending, o piloto vencido de alguien que sigue como New Hire |
| Amarillo | Cliente en Needs Attention (las personas en Needs Attention aparecen en "People who need follow-up"), SOW por confirmar o enviado sin firmar, piloto que termina en 14 días o menos, o personas sin cadencia de 1:1 |
| Verde | Todo lo demás |

El score (0 a 100) empieza en 100 y resta puntos por cada motivo; sirve para ordenar dentro de cada color. Los clientes se relacionan con personas y SOWs por nombre aunque se escriban distinto en Notion ("Proline Eng" y "Proline Engineering", "Vertex" y "VertexOne"). Los pilotos solo se evalúan para personas en New Hire o con `Pilot End` lleno.

## Cómo funciona (Software Development y Customer Success)

- Los datos se leen de Notion en el servidor y se refrescan cada minuto como máximo. La página abierta se actualiza sola cada minuto, y el botón **Actualizar ahora** (al pie) fuerza una lectura nueva de Notion. Lo que cambies en el tracker aparece en el dashboard en ~1 minuto, sin redeploy.
- Al navegador solo llegan los campos que muestra la página. **Salary Rate, Equipment, la columna Notes y las notas del SOW Tracker nunca salen del servidor.**
- Excepción: para las personas que requieren seguimiento se muestra el comentario más reciente de la tabla *1:1 Notes* de su página en Notion (fecha, Health y Comments). El servidor omite las líneas cuya etiqueta sea Wellbeing, Health, Announcements, Family, Personal o Medical. Esa regla solo detecta líneas con etiqueta; si alguien escribe algo personal en un párrafo sin etiqueta, saldrá. Con el acceso abierto, cualquiera que tenga el link ve estos comentarios.
- La página no aparece en buscadores (`noindex`).

## Talent Acquisition

Página con pestañas: **Active roles & pipeline** (la primera), **Needs attention**, **Hiring momentum** y **Demand by client**. Los datos se leen en el servidor con la API de Google Sheets en modo solo lectura (cuenta de servicio) y se refrescan cada minuto, igual que el botón **Refresh now** del pie.

**Fuentes**

- **Hoja Active Job Openings** (pestañas mensuales `Jan 2026` … `Nov 2026`): roles, clientes, LOB, estados, fechas de apertura y de cierre (columna L, Closed Date), candidatos internos, enviados y con el cliente. Es la fuente de verdad de los roles.
- **Hoja Bonuses - Hires and Referrals** (pestañas `Q1 2026` … `Q4 2026`, tabla "Talent Acquisition Hire Bonus"): fecha, cliente y rol de cada contratación. Define el conteo de hires y las fechas de cierre de los roles Filled. Si no se puede leer, la página usa solo la hoja de roles.
- **Ashby** (opcional): solo para la tabla de Active roles. Cuenta los candidatos de cada job abierto por etapa. Cada rol de la hoja se liga a su job por título (se ignoran detalles como `(PZ-25)`, `Remote LATAM` y una letra de diferencia; si ambos llevan código PZ, ese manda). Si dos roles tienen el mismo título, el mismo número aparece en los dos con la marca "shared". Los jobs de Ashby sin rol activo en la hoja aparecen al final como "Ashby only".

**Reglas**

- Un rol se cuenta una vez, desde su última pestaña. Solo cuentan los roles abiertos desde enero de 2026.
- Si un rol desaparece de la pestaña más reciente sin estado final, la página lo marca como **Dropped**. Hay que cerrarlo en la hoja (Cancelled, Lost o Filled).
- Fill rate = roles Filled entre los que cerraron; los Cancelled no cuentan. Los Lost sí.
- Días abiertos = de la apertura al cierre. Si no hay fecha de cierre real (la celda sigue en `=today()`), cuenta hasta hoy y se marca "counting".
- **Needs attention**: roles abiertos 30 días o más, y roles abiertos 14 días o más sin ningún submittal. Los On Hold solo entran con 30 días o más.
- Los clientes con nombres distintos se unen en `lib/hiring.ts` (`CLIENT_ALIASES`, por ejemplo Improvifi → Improvify, Dr. Taz → Hol+).
- LOB: lo que empieza con "Engineer" va a Engineering, "Customer…" a Customer Success y el resto a "Staff & other".

**Confidencialidad.** Billing rates, salarios, nombres de personas y montos de bonos no se cargan en la página: el código solo lee las columnas que muestra. Como el sitio es abierto, mantén así esa regla.

**Hoja de roles: cómo mantenerla.** Escribe la fecha de cierre (columna L) cuando un rol se llene, cancele o pierda. Usa los mismos estados (Active, Pend Functional Spec, Pending SOW, MSA sent, Sales/In progress, On Hold, Filled, Cancelled, Lost). Un título con el código del job de Ashby (por ejemplo `PZ 29`) hace el cruce más seguro.

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
- **Talent Acquisition dice "Almost ready" o no carga**: falta `GOOGLE_SERVICE_ACCOUNT_JSON` o `HIRING_SHEET_ID`, o la hoja no está compartida con el correo de la cuenta de servicio.
- **Talent Acquisition no muestra las etapas de Ashby**: falta `ASHBY_API_KEY`, o la llave no tiene permiso de lectura sobre Jobs y Candidates. Después de agregarla hay que hacer Redeploy.
- **Un rol aparece como Dropped o con días que siguen contando**: el rol desapareció de la hoja sin estado final o no tiene fecha de cierre; ajusta la hoja.
- **Falta una columna o dato**: si renombraron una propiedad en Notion, ajústala en `lib/notion.ts`.

## Archivos

- `lib/notion.ts`: lee Notion y decide qué campos se usan. Si renombran una propiedad en Notion, se ajusta aquí.
- `lib/health.ts`: reglas del semáforo y del score.
- `lib/hiring.ts`: lee las hojas de Google y arma los datos de Talent Acquisition (roles, estados, hires, historial por cliente).
- `lib/ashby.ts`: candidatos por etapa de Ashby y el cruce por título con la hoja.
- `app/Dashboard.tsx`: Software Development y Customer Success.
- `app/TalentAcquisition.tsx` y `app/TaTabs.tsx`: la página de Talent Acquisition y sus pestañas.
- `app/AutoRefresh.tsx`: refresco automático y botón de actualizar.
- `app/Sidebar.tsx`: la barra lateral con los módulos.
- `middleware.ts`: la contraseña (opcional).
- `app/api/notion-webhook/route.ts`: recibe los avisos de Notion y refresca los datos.
- `app/api/refresh/route.ts`: el botón de actualizar (limpia la caché de Notion o de las hojas de Google, según el módulo).
- `.env.example`: plantilla de las variables de entorno.

## Client meetings (snapshot)

La sección "Client meetings" lee `lib/client-meetings.ts`, una lista manual (fecha, fuente, enlace) de la última reunión con cada cliente, tomada de Fathom y Google Calendar al 2026-11-18. Hoy solo cubre Sparkfire, Barosa y OTR Solutions; el resto aparece sin dato. Actualiza el archivo para añadir más.

## Estilo

El formato sigue la guía de marca de Puzzle: Puzzle Blue `#00406C`, Signal Cyan `#29ABE0`, Grow Green `#8CC63F`, Ink `#001828` y Paper `#FCFCFC`; titulares en Omnes (si está instalada, si no Poppins) y texto en Poppins; fondos planos, sin sombras ni gradientes. Los colores del semáforo (verde, ámbar, rojo) se mantienen porque comunican estado.
