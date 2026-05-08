# Mapa de Métodos

Aplicación React para crear proyectos y dibujar gráficamente árboles de dependencias entre métodos y submetodos.

El árbol se muestra completo. La búsqueda solo resalta coincidencias y los nodos se pintan por estado: `Pendiente`, `En progreso`, `Validado`, `Completado` y `Bloqueado`.

Cada proyecto puede tener colaboradores por correo. Los colaboradores se guardan junto con los métodos, links, imágenes y estados.

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

La información se guarda automáticamente en `localStorage` del navegador. Puedes exportar e importar JSON desde el panel izquierdo.

Las imágenes se almacenan en el navegador como datos embebidos. Si agregas muchas imágenes o archivos grandes, el navegador puede limitar el guardado.

## Archivos principales

- `src/App.jsx`: lógica de proyectos, métodos, submetodos, árbol, links e imágenes.
- `src/styles.css`: diseño de la aplicación y conectores del árbol gráfico.
- `src/main.jsx`: entrada de React.
