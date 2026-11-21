# Catálogo Peluches Mágicos 🧸

Página web estática que actúa como frontend de demostración para la API **epn-event-manager**.

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Estructura HTML de la SPA |
| `styles.css` | Estilos (sin dependencias externas) |
| `app.js` | Lógica de la aplicación, conexión con la API |

## Cómo usar

1. Levanta la API backend:
   ```bash
   cd ../epn-event-manager
   npm run start:dev
   ```
2. Abre `index.html` directamente en el navegador (doble clic) o sírvela con cualquier servidor estático:
   ```bash
   npx serve .
   ```

> La API debe estar corriendo en `http://localhost:3000`. Si está en otro puerto, cambia la constante `API_BASE` en `app.js`.

## Funcionalidades

### 🏪 Catálogo
- 12 peluches predefinidos con emoji, nombre, categoría, precio, tamaño y stock.
- Filtros por texto libre, categoría y tamaño.
- Modal de detalle con opción de registrar un evento `QUERY` en la API.

### ➕ Agregar peluche
- Formulario con validación visual.
- Envía un evento `CREATE` a `POST /events` con los datos del peluche en el `payload`.
- El peluche nuevo se agrega al catálogo en memoria durante la sesión.

### 📋 Actividad
- Consume `GET /events` y muestra todos los eventos registrados.
- Filtro por tipo de acción (CREATE / UPDATE / DELETE / QUERY).
- Botón de actualización manual.

### 📊 Estadísticas
- Consume `GET /stats` y muestra conteos por tipo de acción.
- Gráfica de barras dibujada con Canvas nativo (sin librerías).

### Indicador de estado API
- Realiza un `GET /health` cada 30 segundos.
- Punto verde = API activa · Punto rojo = API sin conexión.

## Eventos que genera hacia la API

| Acción | Cuándo |
|--------|--------|
| `CREATE` | Al registrar un nuevo peluche desde el formulario |
| `QUERY`  | Al hacer clic en "Registrar consulta" en el modal de detalle |
