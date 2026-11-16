# Plan de Equipo y Diagnóstico Técnico — Taller de Mantenimiento (`epn-event-manager`)

Este repositorio contiene el código base extraído de [`2026a-sw-const-gr2/EGUEZ-SARZOSA-VICENTE-ADRIAN-constswgr2`](https://github.com/2026a-sw-const-gr2/EGUEZ-SARZOSA-VICENTE-ADRIAN-constswgr2) sin alterar el commit inicial (`main`), de modo que cada integrante pueda crear una rama / Issue en GitHub y mostrar el contraste **Antes vs. Después** en la sustentación.

---

## Mapa General de los 6 Fallos en los 6 Endpoints

| Endpoint | Archivo principal | Incidencia detectada | Tipo de mantenimiento | Responsable |
|---|---|---|---|---|
| `POST /events` | `src/modules/events/events.service.ts` (L57-69) y `src/database/entities/delete-event.entity.ts` (L20-21) | En `action === 'DELETE'`, llama a `this.deleteRepo.create(...)` pero nunca ejecuta `save()`, devolviendo `{ ok: true }` falsamente. Además `delete_events` carece de la columna `description`. | **Correctivo** 🐞 | **Emilio** |
| `POST /events` / `GET /health` / `src/main.ts` | `src/modules/events/events.service.ts` (L26-27), `src/database/entities/update-event.entity.ts` (L26-28), `src/modules/health/health.controller.ts` (L8), `src/main.ts` | Fechas guardadas con `new Date().toLocaleString()` (formato local dependiente del SO, no estándar UTC ISO-8601) y ausencia de CORS (`app.enableCors()`) para clientes externos. | **Adaptativo** ⚙️ | **Karen** |
| `GET /stats` | `src/modules/events/events.service.ts` (L133-144) | `getStats()` omite `query_events` en el conteo y en el `total`. | **Perfectivo** 📈 | **Mateo** |
| `GET /events` (y `source`/`entity`) | `src/modules/events/events.service.ts` (L88-131) | Consultas secuenciales a las 4 tablas (`await` uno por uno) y ordenamiento lexicográfico erróneo (`ta.localeCompare(tb)`) sobre strings de fecha heterogéneos. | **Perfectivo** 📈 | **Mateo** |
| `GET /events/entity/:entity` (y `POST /events` DTO) | `src/modules/events/dto/create-event.dto.ts` (L1-9), `src/main.ts`, `src/modules/events/events.service.ts` (L124-131) | DTO sin validaciones (`class-validator` instalado pero sin usar), sin `ValidationPipe`, sin límite de longitud de campos, sin `try/catch` en persistencia y parámetro `:entity` usado sin sanitizar. | **Preventivo** 🛡️ | **Yair** |
| `GET /health` | `src/modules/health/health.controller.ts` (L5-9) y `health.module.ts` | Responde `{ status: 'ok' }` de forma estática sin comprobar la conexión real a SQLite (`SELECT 1`). | **Preventivo** 🛡️ | **Yair** |

---

## Flujo de Trabajo Recomendado en GitHub

1. **Rama base (`main`):** Mantiene intacto el proyecto original del docente como punto de referencia ("Antes").
2. **Issues:** Crea 4 Issues en GitHub usando las plantillas del final de este documento y asigna uno a cada integrante.
3. **Ramas individuales:** Cada persona trabaja en su propia rama a partir de `main`:
   - Emilio: `git checkout -b fix/correctivo-delete-event`
   - Karen: `git checkout -b feat/adaptativo-utc-cors`
   - Mateo: `git checkout -b perf/perfectivo-stats-y-ordenamiento`
   - Yair: `git checkout -b chore/preventivo-validaciones-health`
4. **Pull Requests:** Cada integrante abre un PR hacia `main` referenciando su Issue (`Closes #1`, etc.). El diff del PR servirá directamente como evidencia **"Antes vs. Después"** en la presentación.

---

## Detalle Técnico por Integrante

### 1. Emilio — Mantenimiento Correctivo 🐞

#### Diagnóstico
1. **`epn-event-manager/src/modules/events/events.service.ts` (líneas 57–69):**
   Cuando llega un `POST /events` con `action: "DELETE"`, se ejecuta `this.deleteRepo.create({...})` pero **no se asigna ni se llama a `await this.deleteRepo.save(ev)`**. El endpoint responde `{ ok: true }` cuando en realidad no guardó nada en `delete_events`.
2. **`epn-event-manager/src/database/entities/delete-event.entity.ts` (líneas 20–21):**
   La entidad `DeleteEventEntity` no define la columna `description` (a diferencia de `create_events`, `update_events` y `query_events`), por lo que se pierde información enviada por el cliente.
3. **`epn-event-manager/src/modules/events/events.service.ts` (línea 85):**
   Si llega una acción desconocida (ej. `"UPSERT"`), `registerEvent` retorna `{ ok: false }` con código HTTP `201 Created` en lugar de rechazar la petición con un error `400 Bad Request` (`BadRequestException`).

#### Intervención (Antes vs. Después)

**Antes (`delete-event.entity.ts`, líneas 17–28):**
```ts
  @Column({ nullable: true })
  title: string;

  // Inconsistencia intencional: no existe campo description en esta tabla
  // a diferencia de las otras tablas

  @Column({ type: 'text', nullable: true })
  payload: string;
```

**Después (`delete-event.entity.ts`):**
```ts
  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  payload: string;
```

**Antes (`events.service.ts`, líneas 57–69 y 85):**
```ts
    if (action === 'DELETE') {
      // BUG INTENCIONAL (correctivo): se construye el objeto pero se devuelve
      // exito antes de persistirlo. El save nunca se ejecuta.
      this.deleteRepo.create({
        source: dto.source,
        entity: dto.entity,
        action: dto.action,
        title: dto.title,
        payload: payloadStr,
        createdAt: localDate,
      });
      return { ok: true };
    }
    ...
    return { ok: false };
```

**Después (`events.service.ts`):**
```ts
    if (action === 'DELETE') {
      const ev = this.deleteRepo.create({
        source: dto.source,
        entity: dto.entity,
        action: action,
        title: dto.title,
        description: dto.description,
        payload: payloadStr,
        createdAt: localDate,
      });
      await this.deleteRepo.save(ev);
      return { ok: true };
    }
    ...
    throw new BadRequestException(
      `Acción no soportada: "${dto.action}". Valores permitidos: CREATE, UPDATE, DELETE, QUERY.`,
    );
```
*(Nota: recuerda importar `BadRequestException` desde `@nestjs/common` y normalizar `action` al guardar para que `"delete"` en minúsculas quede consistente).*

#### Justificación para la Sustentación
Clasifica como **Mantenimiento Correctivo** porque corrige defectos funcionales existentes en tiempo de ejecución: el sistema prometía éxito (`{ ok: true }`) pero perdía silenciosamente los eventos `DELETE` y su campo `description`, además de responder HTTP `201` ante acciones inexistentes.

#### Prueba de Vida (Antes vs. Después)
1. **Reproducir el fallo (Antes):**
   ```powershell
   # Enviar evento DELETE
   Invoke-RestMethod -Method Post -Uri http://localhost:3000/events -ContentType "application/json" -Body '{"source":"crud-prueba","entity":"planet","action":"DELETE","title":"Planeta eliminado","description":"Se elimino Marte","payload":{"id":4}}'
   # Consultar stats y listado -> delete seguira en 0 y no aparece en GET /events
   Invoke-RestMethod -Uri http://localhost:3000/stats
   Invoke-RestMethod -Uri http://localhost:3000/events
   ```
2. **Verificar solución (Después):**
   Volver a ejecutar los mismos comandos; ahora `stats.delete` incrementa en `1` y `GET /events` muestra el evento en `_table: "delete_events"` con su `description`.

---

### 2. Karen — Mantenimiento Adaptativo ⚙️

#### Diagnóstico
1. **`epn-event-manager/src/modules/events/events.service.ts` (líneas 26–27) y `src/modules/health/health.controller.ts` (línea 8):**
   Las fechas se generan con `new Date().toLocaleString()`. Este formato depende de la zona horaria y configuración regional del sistema operativo (en Windows español produce `16/11/2026, 17:30:00`, en Linux inglés `11/16/2026, 5:30:00 PM`), lo cual rompe el ordenamiento cronológico y la interoperabilidad con clientes de otros entornos.
2. **`epn-event-manager/src/database/entities/update-event.entity.ts` (línea 26):**
   Documenta explícitamente: `// Inconsistencia intencional: timestamp guardado como texto local, no UTC`.
3. **`epn-event-manager/src/main.ts` (líneas 4–7):**
   No habilita CORS (`app.enableCors()`), impidiendo que aplicaciones frontend (React, Angular, Vue, etc.) de los integrantes consuman la API desde otro puerto/origen.
4. **`epn-event-manager/package.json` (`better-sqlite3@^12.9.0`):**
   La versión original solo incluye binarios precompilados hasta Node 25 (`20.x || 22.x || 23.x || 24.x || 25.x`). En entornos con Node.js v26 falla `npm install` intentando compilar con `node-gyp` si no hay Visual Studio C++ Build Tools.

#### Intervención (Antes vs. Después)
- En `events.service.ts` (L27) y `health.controller.ts` (L8): reemplazar `new Date().toLocaleString()` por `new Date().toISOString()` (estándar internacional **UTC ISO-8601**, ej. `2026-11-16T22:30:00.000Z`).
- En `events.service.ts`: exponer un campo homogéneo `occurredAt` (normalizado desde `recorded_at`, `timestamp`, `createdAt` o `event_date`) en las respuestas de `findAll()`, `findBySource()` y `findByEntity()` para que cualquier CRUD cliente pueda leer la fecha sin conocer el nombre interno de la columna de cada tabla.
- En `src/main.ts`: habilitar `app.enableCors()` para soportar clientes web externos.
- En `package.json`: actualizar `"better-sqlite3": "^13.2.0"` (compatible con N-API en Node `>=22`, incluyendo Node v26 sin requerir compilación local de C++).

#### Justificación para la Sustentación
Clasifica como **Mantenimiento Adaptativo** porque adapta el sistema a requisitos de interoperabilidad externa y cambios del entorno de ejecución (formato estándar internacional UTC ISO-8601 independiente del sistema operativo, políticas CORS para clientes web multi-origen y actualización de dependencia `better-sqlite3` para compatibilidad con Node.js v26), sin corregir un bug lógico de negocio ni agregar reportes nuevos.

---

### 3. Mateo — Mantenimiento Perfectivo 📈

#### Diagnóstico
1. **`epn-event-manager/src/modules/events/events.service.ts` (`getStats`, líneas 133–144):**
   `// Incidencia perfectiva: query_events no se incluye en el total`. Solo cuenta `createRepo`, `updateRepo` y `deleteRepo`, dejando fuera todas las consultas `QUERY`.
2. **`epn-event-manager/src/modules/events/events.service.ts` (`findAll` L88-114, `findBySource` L116-122, `findByEntity` L124-131):**
   - Ejecuta las 4 consultas a la base de datos de forma **secuencial** (4 `await` seguidos) en lugar de concurrente.
   - Ordena las fechas usando `ta.localeCompare(tb)` (ordenamiento alfabético de strings con formatos locales inconsistentes, donde `"2/11/2026"` queda después de `"16/11/2026"`).

#### Intervención (Antes vs. Después)
- Usar `Promise.all([...])` en `findAll()`, `findBySource()`, `findByEntity()` y `getStats()` para consultar las 4 tablas en paralelo.
- En `getStats()`: incluir `const queryCount = await this.queryRepo.count()` (dentro del `Promise.all`), devolver `query: queryCount` y sumarlo al `total`, además de poder agregar métricas útiles como `bySource` o porcentajes por operación.
- En `findAll()`: corregir el ordenamiento convirtiendo las fechas a milisegundos con `Date.parse(...)` (y ordenando cronológicamente del más reciente al más antiguo o viceversa de forma determinista).

#### Justificación para la Sustentación
Clasifica como **Mantenimiento Perfectivo** porque el sistema ya devolvía respuestas, pero se mejora su rendimiento (paralelismo con `Promise.all`), su precisión en la lógica de ordenamiento y la completitud de sus métricas y reportes (`GET /stats` incluyendo `query` y nuevas métricas agregadas).

---

### 4. Yair — Mantenimiento Preventivo 🛡️

#### Diagnóstico
1. **`epn-event-manager/src/modules/events/dto/create-event.dto.ts` (líneas 1–9) y `src/main.ts`:**
   Aunque `class-validator` y `class-transformer` ya están declarados en `package.json`, `CreateEventDto` no tiene ningún decorador de validación y `main.ts` no tiene `app.useGlobalPipes(new ValidationPipe(...))`. Se aceptan campos vacíos, tipos erróneos o textos gigantes que pueden saturar la base de datos.
2. **`epn-event-manager/src/modules/events/events.service.ts` (`findByEntity` L124-131 y `findBySource` L116-122):**
   `// Incidencia preventiva: parametro entity usado directamente sin sanitizar`. No se validan ni limpian espacios/caracteres inválidos ni se captura posibles fallos de persistencia con `try/catch`.
3. **`epn-event-manager/src/modules/health/health.controller.ts` (líneas 5–9):**
   `// Incidencia preventiva: siempre responde ok sin verificar conectividad real`. Si la base SQLite falla o está bloqueada, `/health` sigue mintiendo que todo está `"ok"`.

#### Intervención (Antes vs. Después)
- En `create-event.dto.ts`: agregar `@IsString()`, `@IsNotEmpty()`, `@MaxLength(...)` (ej. `source`: 60, `entity`: 60, `title`: 120, `description`: 500), `@IsIn(['CREATE', 'UPDATE', 'DELETE', 'QUERY'])` en `action`, y `@IsOptional() @IsObject()` (o validación de tamaño) en `payload`.
- En `src/main.ts`: activar `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))` y limitar tamaño de body JSON (`express.json({ limit: '100kb' })`).
- En `events.service.ts`: envolver operaciones de escritura en `try/catch` lanzando `InternalServerErrorException` controlada, y sanitizar/validar `source` y `entity` (ej. `trim()`, rechazo de cadenas vacías o caracteres inválidos con `BadRequestException`).
- En `health.module.ts` y `health.controller.ts`: inyectar `DataSource` de TypeORM y ejecutar `await this.dataSource.query('SELECT 1')` dentro de un `try/catch`, devolviendo estado real de la BD (o `ServiceUnavailableException` 503 si falla).

#### Justificación para la Sustentación
Clasifica como **Mantenimiento Preventivo** porque no espera a que el servidor colapse en producción: endurece validaciones de entrada, limita tamaños de campos/payload, captura excepciones y convierte el `/health` en una sonda real para detectar fallos de base de datos antes de afectar a los usuarios.

---

## Plantillas Listas para GitHub Issues (Copiar y Pegar)

### Issue 1 — `[Correctivo] Persistir eventos DELETE y agregar columna description` (Asignar a: Emilio)
```markdown
## Descripción del Problema
Actualmente `POST /events` con `action: "DELETE"` responde `{ "ok": true }`, pero no guarda el registro en la tabla `delete_events` porque nunca se invoca `deleteRepo.save(...)`. Adicionalmente, la entidad `DeleteEventEntity` omite la columna `description` que sí existe en las demás tablas, y el servicio responde `201` con `{ "ok": false }` cuando llega una acción inválida.

## Archivos Afectados
- `epn-event-manager/src/modules/events/events.service.ts` (líneas 57-69 y 85)
- `epn-event-manager/src/database/entities/delete-event.entity.ts` (líneas 20-21)

## Criterios de Aceptación
- [ ] Agregar columna `description` a `DeleteEventEntity`.
- [ ] Guardar correctamente la entidad en `this.deleteRepo.save(ev)` dentro de `registerEvent`.
- [ ] Lanzar `BadRequestException` (HTTP 400) cuando `action` no sea `CREATE`, `UPDATE`, `DELETE` o `QUERY`.
- [ ] Documentar captura de prueba Antes vs. Después en `POST /events` y `GET /events`.
```

### Issue 2 — `[Adaptativo] Estandarizar fechas a UTC ISO-8601 y habilitar CORS` (Asignar a: Karen)
```markdown
## Descripción del Problema
El Hub genera y almacena timestamps usando `new Date().toLocaleString()`, lo cual cambia según el idioma y zona horaria del servidor/SO, rompiendo la compatibilidad entre entornos. Además, la aplicación no habilita CORS en `main.ts`, bloqueando peticiones desde frontends o CRUDs web que corran en otros puertos.

## Archivos Afectados
- `epn-event-manager/src/modules/events/events.service.ts` (líneas 26-27 y normalización en consultas)
- `epn-event-manager/src/database/entities/update-event.entity.ts` (línea 26)
- `epn-event-manager/src/modules/health/health.controller.ts` (línea 8)
- `epn-event-manager/src/main.ts`
- `epn-event-manager/package.json` (`better-sqlite3`)

## Criterios de Aceptación
- [ ] Reemplazar `toLocaleString()` por `new Date().toISOString()` (UTC ISO-8601).
- [ ] Exponer un campo de fecha estándar consistente en las respuestas de `GET /events`, `GET /events/source/:source` y `GET /events/entity/:entity`.
- [ ] Habilitar CORS en `src/main.ts` (`app.enableCors()`).
- [ ] Actualizar `better-sqlite3` a `^13.2.0` en `package.json` para compatibilidad con Node.js v26.
- [ ] Probar integración desde un cliente externo tras el cambio.
```

### Issue 3 — `[Perfectivo] Incluir query_events en /stats, paralelizar consultas y corregir ordenamiento` (Asignar a: Mateo)
```markdown
## Descripción del Problema
1. `GET /stats` no contabiliza la tabla `query_events` ni la suma al `total`.
2. `findAll()`, `findBySource()`, `findByEntity()` y `getStats()` consultan las 4 tablas secuencialmente.
3. `findAll()` ordena eventos con `localeCompare()` sobre strings de fecha heterogéneos, produciendo un historial desordenado.

## Archivos Afectados
- `epn-event-manager/src/modules/events/events.service.ts` (líneas 88-144)

## Criterios de Aceptación
- [ ] Incluir `query: queryCount` en `GET /stats` y sumarlo en `total`.
- [ ] Refactorizar las consultas a las 4 tablas usando `Promise.all(...)`.
- [ ] Corregir el ordenamiento en `findAll()` usando timestamps numéricos válidos.
- [ ] Mostrar comparativa Antes vs. Después en `GET /stats` y `GET /events`.
```

### Issue 4 — `[Preventivo] Validación de DTOs, sanitización de parámetros, try-catch y /health real` (Asignar a: Yair)
```markdown
## Descripción del Problema
1. `CreateEventDto` no tiene reglas de validación ni límites de longitud a pesar de tener `class-validator` instalado, y `ValidationPipe` no está activado en `main.ts`.
2. `findByEntity` y `findBySource` reciben parámetros sin sanitizar ni validar.
3. `registerEvent` no maneja excepciones de base de datos con `try-catch`.
4. `GET /health` responde siempre `{ status: 'ok' }` sin comprobar la conexión real con SQLite.

## Archivos Afectados
- `epn-event-manager/src/modules/events/dto/create-event.dto.ts`
- `epn-event-manager/src/main.ts`
- `epn-event-manager/src/modules/events/events.service.ts` (líneas 124-131 y `registerEvent`)
- `epn-event-manager/src/modules/health/health.controller.ts` y `health.module.ts`

## Criterios de Aceptación
- [ ] Agregar decoradores de `class-validator` y `@MaxLength` a `source`, `entity`, `title`, `description`, y `@IsIn` para `action`.
- [ ] Activar `ValidationPipe` global en `main.ts` y límite de tamaño de payload JSON.
- [ ] Sanitizar/validar `:entity` y `:source` y agregar manejo de errores (`try-catch`) en el servicio.
- [ ] Inyectar `DataSource` en `HealthController` y verificar SQLite con `SELECT 1`.
```

---

## Nota sobre el CRUD Personal y la Comunicación Asíncrona

Para la **Prueba de Vida** de la sustentación, cada CRUD personal (en Python/FastAPI, Java, Node, etc.) debe realizar operaciones locales sobre su dominio (ej. Gestión de Jugadores, Catálogo de Anime, Planetas, etc.) y **disparar de forma asíncrona (no bloqueante / fire-and-forget con manejo de timeout)** una petición `POST http://localhost:3000/events` por cada acción:
- Al listar/consultar un registro -> `action: "QUERY"`
- Al crear un registro -> `action: "CREATE"`
- Al actualizar un registro -> `action: "UPDATE"`
- Al eliminar un registro -> `action: "DELETE"`

De este modo, aunque el Hub de Eventos estuviera caído o lento, el CRUD sigue respondiendo al usuario sin bloquearse, y cuando el Hub está arriba registra toda la auditoría en tiempo real.
