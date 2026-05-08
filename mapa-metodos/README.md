# Mapa de Métodos

Aplicación React para crear proyectos y dibujar gráficamente árboles de dependencias entre métodos y submetodos.

El árbol se muestra completo. La búsqueda solo resalta coincidencias y los nodos se pintan por estado: `Pendiente`, `En progreso`, `Validado`, `Completado` y `Bloqueado`.

Cada proyecto puede tener colaboradores por correo. Los colaboradores se guardan junto con los métodos, links, imágenes y estados.

## Colaboración en tiempo real

La app funciona en dos modos:

- Modo local: guarda en `localStorage`, solo visible en el navegador actual.
- Modo compartido: usa Supabase para que varios navegadores vean y editen el mismo flujo.

Para activar el modo compartido:

1. Crea un proyecto en Supabase.
2. Ejecuta el SQL de `supabase-schema.sql` en el SQL editor de Supabase.
3. Copia `.env.example` como `.env.local` en `mapa-metodos`.
4. Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
5. Reinicia `npm run dev`.

Para GitHub Pages, agrega estos secrets en el repositorio:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`VITE_SUPABASE_URL` debe ser la Project URL, por ejemplo `https://xxxxx.supabase.co`. No uses la REST URL completa con `/rest/v1`.

Después de configurar Supabase, usa `Copiar enlace colaborativo` y envía ese enlace a los colaboradores. Quien abra ese enlace verá el mismo flujo y los cambios se sincronizarán.

Agregar un correo en `Colaboradores` registra quién participa en el proyecto, pero no envía invitaciones ni autentica usuarios todavía. Para que otra persona vea tus cambios debe abrir el enlace colaborativo del proyecto.

Si Realtime por WebSocket falla en alguna red corporativa, la app usa sincronización periódica con Supabase como respaldo.

Nota: el esquema incluido permite lectura/escritura pública para facilitar el prototipo colaborativo. Para producción conviene agregar autenticación y políticas RLS por usuario.

## Ejecutar

```bash
npm install
npm run dev
```

Luego abre la URL que muestra Vite, normalmente `http://127.0.0.1:5173/`.

## Flujo ejemplo

Usa el botón `Ejemplo Execute` para crear este árbol en el proyecto seleccionado:

```text
execute
└─ InitDisbursement
   ├─ Get Client
   └─ Get Document
```

También puedes crear cualquier método desde `Nuevo método` y elegir en `Depende de` si será método principal o submetodo de otro nodo.

## Datos

La información se guarda automáticamente en `localStorage` del navegador y, si Supabase está configurado, también en la tabla compartida. Puedes exportar e importar JSON desde el panel izquierdo.

Las imágenes se almacenan en el navegador como datos embebidos. Si agregas muchas imágenes o archivos grandes, el navegador puede limitar el guardado.

## Archivos principales

- `src/App.jsx`: lógica de proyectos, métodos, submetodos, árbol, links e imágenes.
- `src/cloudSync.js`: sincronización opcional con Supabase Realtime.
- `src/styles.css`: diseño de la aplicación y conectores del árbol gráfico.
- `src/main.jsx`: entrada de React.
- `supabase-schema.sql`: tabla y políticas para colaboración compartida.
