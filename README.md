# Verbify 🎯

Web (y app instalable en Android) para practicar los **verbos irregulares en inglés** en 1º de ESO.
Está hecha con HTML, CSS y JavaScript sin frameworks. Usa **Supabase** (gratis) como base de datos y **GitHub Pages** (gratis) como hosting.

---

## 1. Probarla ya en modo demo (sin configurar nada)

Mientras `js/config.js` esté vacío, la app funciona en **modo demo**: todo se guarda en el navegador.
En la demo, el **primer adulto que se registra es superadministrador**.

Para abrirla en tu ordenador necesitas un servidor local (no basta con hacer doble clic en `index.html`):

```powershell
python -m http.server 8765
```

Después abre <http://localhost:8765>.

---

## 2. Crear la base de datos en Supabase (≈10 minutos)

1. Entra en <https://supabase.com>, inicia sesión y pulsa **New project**. Elige un nombre (p. ej. `verbify`), una contraseña para la base de datos y la región **West EU**.
2. **Desactiva la confirmación por email.** Los niños entran con nick y contraseña, sin email:
   *Authentication → Sign In / Providers → Email* → desactiva **Confirm email** → **Save**.
   (Deja activados *Enable Email provider* y *Allow new users to sign up*.)
3. **Crea las tablas:** abre *SQL Editor → New query*, pega **todo** el contenido de [`supabase/instalar.sql`](supabase/instalar.sql) y pulsa **Run**.
   Esto crea las tablas, la seguridad y la lista maestra con los 86 verbos, repartidos de 5 en 5 por semana y todos cerrados.
   ⚠️ Si lo vuelves a ejecutar, **borra todos los datos** de Verbify.
4. **Copia tus claves:** en *Project Settings → API* copia la **Project URL** y la clave **anon public**.
5. Pégalas en [`js/config.js`](js/config.js):

   ```js
   SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...',
   ```

   La clave *anon* es pública: está pensada para ir en el código de la web. La seguridad la garantizan las reglas (RLS) del paso 3.
   **Nunca** pegues aquí la clave `service_role`.

### Hacerte superadministrador

1. Abre la web y regístrate como **"Soy profe / adulto"** con tu nick.
2. En Supabase, abre *SQL Editor* y ejecuta (cambia `tu_nick`):

   ```sql
   update public.profiles set role = 'superadmin' where lower(nick) = lower('tu_nick');
   ```

Como superadministrador puedes editar la **lista maestra** y cualquier lista. La lista maestra se copia a cada profe nuevo y es la que ven los alumnos que aún no están en ningún grupo.

> Si al registrarte aparece *"Supabase no acepta el dominio de email"*, cambia `EMAIL_DOMAIN` en `js/config.js` por un dominio que sea tuyo. Verbify nunca envía correos; solo lo necesita porque Supabase identifica a cada usuario con un email.

---

## 3. Publicarla gratis en GitHub Pages

1. En GitHub pulsa **New repository**, ponle de nombre `verbify` y márcalo como **Public**.
2. Sube **todos** los archivos de esta carpeta. Puedes arrastrarlos en *Add file → Upload files* o usar git:

   ```powershell
   git init
   git add .
   git commit -m "Verbify v1"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/verbify.git
   git push -u origin main
   ```

3. En el repositorio ve a *Settings → Pages → Build and deployment*, elige **Deploy from a branch**, la rama **main** y la carpeta **/ (root)**, y pulsa **Save**.
4. En 1 o 2 minutos estará en `https://TU_USUARIO.github.io/verbify/`.

**Cada vez que publiques cambios**, sube el número de `VERSION` en [`sw.js`](sw.js) (p. ej. `verbify-v1.0.1`). Así los móviles que la tienen instalada se actualizan.

---

## 4. Instalarla en Android (como una app)

Abre la web en **Chrome** en el móvil → menú ⋮ → **Añadir a pantalla de inicio / Instalar aplicación**.
Se abre a pantalla completa, con su icono, y funciona sin conexión para estudiar y practicar. Los récords se guardan cuando hay conexión.

---

## 5. Cómo se usa

**El profe o adulto**
1. Se registra como *"Soy profe / adulto"*: tiene que confirmar que es mayor de edad. La fecha de nacimiento no se guarda.
2. Recibe automáticamente **su propia copia** de la lista de verbos.
3. En **Profe → Semanas** abre las semanas que quiera, por ejemplo la 1 y la 2.
4. En **Grupos** crea un grupo (p. ej. "1º ESO B") y comparte el **código de 6 letras** con sus alumnos.
5. En **Profe → Verbos / Patrones / Importar** puede añadir, editar o borrar verbos, crear patrones e importar o exportar CSV.
6. Si un alumno olvida su contraseña: **Grupos → (grupo) → Restablecer**. La contraseña pasa a ser **nick + año actual** (p. ej. `lucia2026`), y solo el profe ve esta información.

**El alumno**
1. Se registra con **nick y contraseña**. No se pide ningún dato personal.
2. Entra en un grupo con el código: verá los verbos que su profe haya abierto.
3. Puede **Practicar** en dos modos:
   - **Del español al inglés:** recibe el significado y escribe el infinitivo, el pasado y el participio.
   - **Pista sorpresa:** recibe una forma al azar (o el significado) y completa el resto.
4. Tiene **3 intentos** por verbo y solo corrige lo que ha fallado. Al tercer fallo, la solución aparece en rojo.
5. **Puntos = aciertos a la primera × 10 × % de aciertos.** Si hay empate, gana quien tardó menos.
   Se guarda solo el **mejor récord** (de la semana y el histórico) de cada modo.
6. Al terminar, puede **repasar** los verbos que le costaron. El repaso no cuenta para el ranking.
7. También puede **Estudiar** con tarjetas: los abiertos, por semana o todo el listado, en orden alfabético o por patrón. Puede tapar las respuestas para ponerse a prueba y escuchar la pronunciación.
8. Puede **crear su propio grupo** para competir con sus amigos.

### Formato CSV para importar

Columnas separadas por punto y coma (`;`). Las columnas `patron` y `semana` son opcionales.

```
infinitivo;pasado;participio;significado;patron;semana
be;was, were;been;ser, estar;Totalmente diferentes (go-went-gone);1
```

Si hay varias respuestas válidas, sepáralas con comas (`was, were`). La corrección no distingue mayúsculas ni tildes, e ignora los espacios sobrantes.

---

## 6. Estructura del proyecto

```
index.html               Página única de la app
css/styles.css           Estilos (móvil primero, claro/oscuro)
js/config.js             ← Aquí van las claves de Supabase
js/app.js                Arranque, menú y navegación
js/state.js              Estado, preferencias y caché sin conexión
js/i18n.js               Textos en español e inglés
js/utils.js              Corrección de respuestas, CSV, pronunciación…
js/backend-supabase.js   Conexión con Supabase
js/backend-demo.js       Modo demo (localStorage)
js/views/*.js            Pantallas: acceso, inicio, practicar, estudiar, grupos, profe, ajustes
supabase/instalar.sql    Script para crear la base de datos (generado)
data/verbos-1eso.csv     Lista original de 86 verbos
tools/                   schema.sql + build-sql.mjs (regenera instalar.sql)
sw.js, manifest.webmanifest, icons/   App instalable (PWA)
```

Si cambias `tools/schema.sql` o `data/verbos-1eso.csv`, regenera el script:

```powershell
node tools/build-sql.mjs
```

## 7. Límites del plan gratuito de Supabase

- Sobra para varias clases: 500 MB de base de datos y 50.000 usuarios activos al mes.
- Si el proyecto pasa **una semana sin uso**, Supabase lo pausa. Se reactiva desde el panel de Supabase con *Restore project*.
