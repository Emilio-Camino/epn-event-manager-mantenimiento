# Informe de Mantenimiento Preventivo — `epn-event-manager`

**Responsable:** Jahir Rocha  
**Rama:** `chore/preventivo-validaciones-health`  
**Alcance:** Mantenimiento Preventivo (Validación de DTOs, límite de payload JSON, sanitización de parámetros de ruta, manejo de errores de persistencia y verificación real de salud en `/health`).

---

## 1. Diagnóstico Inicial

Al analizar la base de código de `epn-event-manager`, se identificaron cuatro debilidades latentes que exponían al Hub de Eventos a datos corruptos, caídas no controladas, vectores de inyección/abuso y falsos positivos de disponibilidad:

1. **Ausencia de validación en `CreateEventDto` (`src/modules/events/dto/create-event.dto.ts`)**:
   - A pesar de contar con `class-validator` (`^0.15.1`) y `class-transformer` (`^0.5.1`) en `package.json`, la clase `CreateEventDto` carecía de decoradores. Cualquier cliente podía enviar campos vacíos, tipos inválidos (`payload` como texto o arreglo), cadenas excesivamente largas o acciones en minúsculas sin normalización previa.
2. **Falta de `ValidationPipe` global y de límite de tamaño de body (`src/main.ts`)**:
   - La aplicación no registraba `ValidationPipe`, por lo que ningún decorador de validación o transformación se ejecutaba en las peticiones entrantes. Tampoco restringía el tamaño máximo del body JSON, dejando el servidor expuesto a ataques de agotamiento de memoria mediante payloads masivos.
3. **Parámetros de ruta sin sanitizar y persistencia sin captura de excepciones (`src/modules/events/events.service.ts`)**:
   - Los métodos `findBySource` y `findByEntity` recibían parámetros de URL (`:source`, `:entity`) sin recortar espacios, validar longitud máxima ni restringir caracteres especiales (como `<script>`).
   - En `registerEvent`, las operaciones `await this.*Repo.save(ev)` no estaban protegidas por un bloque `try/catch`, lo que ocasionaba que un fallo de base de datos produjera errores no controlados sin registro estructurado en el `Logger` de NestJS.
4. **Health Check simulado (`src/modules/health/health.controller.ts`)**:
   - El endpoint `GET /health` devolvía siempre `{ status: 'ok' }` de manera estática sin verificar si la conexión de TypeORM (`DataSource`) hacia SQLite (`db/events.sqlite`) seguía operativa.

---

## 2. Comparativa Antes / Después por Archivo

### 2.1 `src/modules/events/dto/create-event.dto.ts`

#### Antes
```typescript
export class CreateEventDto {
  source: string;
  entity: string;
  action: string;
  title: string;
  description: string;

  payload: any;
}
```

#### Después
```typescript
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEventDto {
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  source: string;

  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  entity: string;

  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsIn(['CREATE', 'UPDATE', 'DELETE', 'QUERY'])
  action: string;

  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title: string;

  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description: string;

  @IsOptional()
  @IsObject()
  payload: any;
}
```

---

### 2.2 `src/main.ts`

#### Antes
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

#### Después
```typescript
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Preventivo: límite de tamaño de body y validación global de DTOs
  app.useBodyParser('json', { limit: '100kb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

---

### 2.3 `src/modules/events/events.service.ts`

#### Antes (fragmentos relevantes)
```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
...
  async registerEvent(dto: CreateEventDto): Promise<{ ok: boolean }> {
    const action = (dto.action ?? '').toUpperCase();
    const payloadStr = JSON.stringify(dto.payload ?? {});
    // Fecha guardada en formato local, no UTC (debilidad intencional)
    const localDate = new Date().toLocaleString();

    if (action === 'CREATE') {
      ...
      await this.createRepo.save(ev);
      return { ok: true };
    }
    ...
    // se arregló: se rechazan acciones inválidas con error 400 en lugar de devolver ok: false
    throw new BadRequestException(
      `Acción no soportada: "${dto.action}". Usa CREATE, UPDATE, DELETE o QUERY.`,
    );
  }
...
  async findBySource(source: string): Promise<object[]> {
    const creates = await this.createRepo.findBy({ source });
    const updates = await this.updateRepo.findBy({ source });
    const deletes = await this.deleteRepo.findBy({ source });
    const queries = await this.queryRepo.findBy({ source });
    return [...creates, ...updates, ...deletes, ...queries];
  }

  async findByEntity(entity: string): Promise<object[]> {
    // Incidencia preventiva: parametro entity usado directamente sin sanitizar
    const creates = await this.createRepo.findBy({ entity });
    const updates = await this.updateRepo.findBy({ entity });
    const deletes = await this.deleteRepo.findBy({ entity });
    const queries = await this.queryRepo.findBy({ entity });
    return [...creates, ...updates, ...deletes, ...queries];
  }
```

#### Después (fragmentos relevantes)
```typescript
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
...
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
...
  private sanitizeParam(value: string, name: string): string {
    const clean = (value ?? '').trim();
    if (!clean) {
      throw new BadRequestException(
        `El parámetro "${name}" no puede estar vacío.`,
      );
    }
    if (clean.length > 60) {
      throw new BadRequestException(
        `El parámetro "${name}" no puede exceder 60 caracteres.`,
      );
    }
    if (!/^[A-Za-z0-9_\-. ]+$/.test(clean)) {
      throw new BadRequestException(
        `El parámetro "${name}" contiene caracteres no permitidos.`,
      );
    }
    return clean;
  }

  async registerEvent(dto: CreateEventDto): Promise<{ ok: boolean }> {
    const action = (dto.action ?? '').toUpperCase();
    const payloadStr = JSON.stringify(dto.payload ?? {});
    // Fecha guardada en formato local, no UTC (debilidad intencional)
    const localDate = new Date().toLocaleString();

    try {
      if (action === 'CREATE') {
        ...
        await this.createRepo.save(ev);
        return { ok: true };
      }
      ...
      // se arregló: se rechazan acciones inválidas con error 400 en lugar de devolver ok: false
      throw new BadRequestException(
        `Acción no soportada: "${dto.action}". Usa CREATE, UPDATE, DELETE o QUERY.`,
      );
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error(
        'Error al persistir evento',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('No se pudo registrar el evento');
    }
  }
...
  async findBySource(source: string): Promise<object[]> {
    source = this.sanitizeParam(source, 'source');
    const creates = await this.createRepo.findBy({ source });
    const updates = await this.updateRepo.findBy({ source });
    const deletes = await this.deleteRepo.findBy({ source });
    const queries = await this.queryRepo.findBy({ source });
    return [...creates, ...updates, ...deletes, ...queries];
  }

  async findByEntity(entity: string): Promise<object[]> {
    // se arregló (preventivo): parámetro sanitizado y validado
    entity = this.sanitizeParam(entity, 'entity');
    const creates = await this.createRepo.findBy({ entity });
    const updates = await this.updateRepo.findBy({ entity });
    const deletes = await this.deleteRepo.findBy({ entity });
    const queries = await this.queryRepo.findBy({ entity });
    return [...creates, ...updates, ...deletes, ...queries];
  }
```

---

### 2.4 `src/modules/health/health.controller.ts`

#### Antes
```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    // Incidencia preventiva: siempre responde ok sin verificar conectividad real
    return { status: 'ok', timestamp: new Date().toLocaleString() };
  }
}
```

#### Después
```typescript
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    // se arregló (preventivo): verifica conectividad real con SQLite
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        database: 'up',
        timestamp: new Date().toLocaleString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }
  }
}
```

---

## 3. Justificación de Mantenimiento Preventivo

De acuerdo con el estándar **ISO/IEC 14764**, el **mantenimiento preventivo** consiste en la modificación de un producto de software después de la entrega para **detectar y corregir fallas latentes antes de que se conviertan en fallas efectivas en operación**:

- **Validación y transformación en el DTO + `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)**: Previene que datos malformados, cadenas con espacios residuales o propiedades no autorizadas ingresen a la lógica de negocio y contaminen las tablas SQLite. Además, al normalizar `action` con `trim().toUpperCase()` en el DTO, se evita que las tablas `create_events`, `update_events` y `query_events` almacenen acciones en minúsculas cuando un CRUD externo envía `"create"` o `"delete"`.
- **Límite de `100kb` en el parser JSON**: Previene caídas por agotamiento de memoria (DoS por payloads sobredimensionados) devolviendo oportunamente `413 Payload Too Large`.
- **Sanitización de `:source` y `:entity`**: Evita consultas innecesarias con parámetros vacíos o con caracteres potencialmente peligrosos (`<script>`, inyecciones en logs o consumidores aguas abajo).
- **Manejo de excepciones y `Logger` en `registerEvent`**: Previene la exposición de trazas internas de SQLite/TypeORM al cliente ante fallos de disco o bloqueo de base de datos, registrando el stack trace internamente y respondiendo con un `500 Internal Server Error` controlado.
- **Verificación real en `/health` (`SELECT 1`)**: Previene falsos positivos en sistemas de monitoreo o balanceadores de carga cuando la base de datos SQLite no está disponible, respondiendo con `503 Service Unavailable`.

---

## 4. Tabla de Pruebas de Verificación

| # | Caso de prueba | Comando ejecutado (PowerShell / `curl.exe`) | Esperado | Obtenido | Cuerpo de respuesta |
| :-: | :--- | :--- | :---: | :---: | :--- |
| 1 | Body válido | `'{"source":"crud-python","entity":"usuario","action":"CREATE","title":"Alta usuario","description":"Registro inicial","payload":{"id":1}}' \| curl.exe -s -i -X POST http://localhost:3000/events -H "Content-Type: application/json" --data-binary "@-"` | `201 Created` | `201 Created` | `{"ok":true}` |
| 2 | `action: "delete"` en minúsculas | `'{"source":"crud-python","entity":"usuario","action":"delete","title":"Baja usuario","description":"Eliminado","payload":{"id":1}}' \| curl.exe -s -i -X POST http://localhost:3000/events -H "Content-Type: application/json" --data-binary "@-"` | `201 Created` | `201 Created` | `{"ok":true}` |
| 3 | `source: ""` vacío | `curl.exe -s -i -X POST http://localhost:3000/events -H "Content-Type: application/json" -d '{\"source\":\"\",\"entity\":\"usuario\",\"action\":\"CREATE\"}'` | `400 Bad Request` | `400 Bad Request` | `{"message":["source should not be empty"],"error":"Bad Request","statusCode":400}` |
| 4 | `action: "UPSERT"` inválida | `curl.exe -s -i -X POST http://localhost:3000/events -H "Content-Type: application/json" -d '{\"source\":\"crud-python\",\"entity\":\"usuario\",\"action\":\"UPSERT\"}'` | `400 Bad Request` | `400 Bad Request` | `{"message":["action must be one of the following values: CREATE, UPDATE, DELETE, QUERY"],"error":"Bad Request","statusCode":400}` |
| 5 | `title` de 200 caracteres | `$t="A"*200; "{`"source`":`"crud-python`",`"entity`":`"usuario`",`"action`":`"CREATE`",`"title`":`"$t`"}" \| curl.exe -s -i -X POST http://localhost:3000/events -H "Content-Type: application/json" --data-binary "@-"` | `400 Bad Request` | `400 Bad Request` | `{"message":["title must be shorter than or equal to 120 characters"],"error":"Bad Request","statusCode":400}` |
| 6 | `payload: "texto"` no objeto | `curl.exe -s -i -X POST http://localhost:3000/events -H "Content-Type: application/json" -d '{\"source\":\"crud-python\",\"entity\":\"usuario\",\"action\":\"CREATE\",\"payload\":\"texto\"}'` | `400 Bad Request` | `400 Bad Request` | `{"message":["payload must be an object"],"error":"Bad Request","statusCode":400}` |
| 7 | Campo extra `"hack": 1` | `curl.exe -s -i -X POST http://localhost:3000/events -H "Content-Type: application/json" -d '{\"source\":\"crud-python\",\"entity\":\"usuario\",\"action\":\"CREATE\",\"hack\":1}'` | `400 Bad Request` | `400 Bad Request` | `{"message":["property hack should not exist"],"error":"Bad Request","statusCode":400}` |
| 8 | Body > 100kb (`110kb`) | `$b="X"*110000; "{`"source`":`"crud-python`",`"entity`":`"usuario`",`"action`":`"CREATE`",`"payload`":{`"blob`":`"$b`"}}" \| curl.exe -s -i -X POST http://localhost:3000/events -H "Content-Type: application/json" --data-binary "@-"` | `413 Payload Too Large` | `413 Payload Too Large` | `{"statusCode":413,"message":"request entity too large"}` |
| 9 | `GET /events/entity/%20%20` | `curl.exe -s -i http://localhost:3000/events/entity/%20%20` | `400 Bad Request` | `400 Bad Request` | `{"message":"El parámetro \"entity\" no puede estar vacío.","error":"Bad Request","statusCode":400}` |
| 10 | `GET /events/entity/%3Cscript%3E` | `curl.exe -s -i http://localhost:3000/events/entity/%3Cscript%3E` | `400 Bad Request` | `400 Bad Request` | `{"message":"El parámetro \"entity\" contiene caracteres no permitidos.","error":"Bad Request","statusCode":400}` |
| 11 | `GET /events/source/crud-python` | `curl.exe -s -i http://localhost:3000/events/source/crud-python` | `200 OK` | `200 OK` | `[{"id":4,"source":"crud-python","entity":"usuario","action":"CREATE",...},{"id":1,"source":"crud-python","entity":"usuario","action":"DELETE",...}]` |
| 12 | `GET /health` | `curl.exe -s -i http://localhost:3000/health` | `200 OK` (`database: "up"`) | `200 OK` | `{"status":"ok","database":"up","timestamp":"11/17/2026, 9:57:18 AM"}` |

---

## 5. Observaciones Fuera de Alcance (Para el resto del equipo)

Las siguientes incidencias fueron identificadas durante el análisis pero **no fueron tocadas** para respetar la separación de responsabilidades y evitar conflictos de merge:

1. **Mantenimiento Adaptativo**:
   - **Formato de fechas local (`toLocaleString`)**: Tanto `EventsService.registerEvent` (línea 54) como `HealthController.check` (línea 16) siguen usando `new Date().toLocaleString()` en lugar de UTC ISO 8601 (`new Date().toISOString()`).
   - **Nombres heterogéneos de columnas de fecha en las 4 entidades**: `recorded_at` (`create_events`), `timestamp` (`update_events`), `createdAt` (`delete_events`) y `event_date` (`query_events`).
   - **CORS en `src/main.ts`**: Falta habilitar `app.enableCors()` para permitir peticiones desde clientes web/frontends.
   - **Scripts de compilación nativa en `package.json`**: `better-sqlite3` requiere descargar o compilar el binario nativo (`better_sqlite3.node`) cuando se instala en entornos con bloqueo de scripts.
2. **Mantenimiento Perfectivo**:
   - **Consultas secuenciales en `findAll`, `findBySource`, `findByEntity` y `getStats`**: Actualmente se ejecutan 4 `await` en serie en lugar de paralelizarlos con `Promise.all([...])`.
   - **Ordenamiento lexicográfico en `findAll`**: `localeCompare` sobre fechas locales no garantiza orden cronológico real.
   - **Omisión de `query_events` en `GET /stats`**: `EventsService.getStats()` no cuenta los registros de `queryRepo` ni los incluye en `total`.
   - **Falta de metadato `_table` en `findBySource` y `findByEntity`**: A diferencia de `findAll()`, estos dos métodos devuelven las entidades sin indicar su tabla de origen.
   - **Columna `query_term` en `QueryEventEntity`**: Existe en la entidad `query_events` pero no se recibe ni se asigna. Si el equipo decide recibir `query_term` en `POST /events`, deberá declararse como `@IsOptional() @IsString() query_term?: string;` en `CreateEventDto` porque `forbidNonWhitelisted: true` ya está activo.
3. **Higiene del repositorio**:
   - El archivo binario `epn-event-manager/db/events.sqlite` está rastreado por Git. Conviene agregarlo a `.gitignore` y usar `git rm --cached` en una tarea coordinada para evitar conflictos binarios entre ramas.

---

## 6. Texto listo para el Pull Request

### Título sugerido
`chore(preventivo): validar DTOs, limitar body JSON, sanitizar parámetros y verificar SQLite en /health`

### Descripción del PR
```markdown
## Resumen
Este PR implementa las mejoras de **Mantenimiento Preventivo** sobre `epn-event-manager` para prevenir el ingreso de datos corruptos, acotar el tamaño de payloads entrantes, sanitizar parámetros de búsqueda, capturar errores de persistencia y comprobar la conectividad real con SQLite en el endpoint de salud.

## Cambios realizados
- **`src/modules/events/dto/create-event.dto.ts`**:
  - Validaciones con `class-validator` (`@IsString`, `@IsNotEmpty`, `@MaxLength`, `@IsIn`, `@IsOptional`, `@IsObject`) y normalización con `@Transform` (`trim()` en strings y `trim().toUpperCase()` en `action`).
- **`src/main.ts`**:
  - Configuración de `app.useBodyParser('json', { limit: '100kb' })` sobre `NestExpressApplication`.
  - Registro global de `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- **`src/modules/events/events.service.ts`**:
  - Método privado `sanitizeParam(value, name)` aplicado en `findBySource` y `findByEntity` (recorte de espacios, longitud máxima de 60 caracteres y lista blanca `^[A-Za-z0-9_\-. ]+$`).
  - Bloque `try/catch` en `registerEvent` que relanza instancias de `HttpException` y registra fallos inesperados con `Logger` antes de lanzar `InternalServerErrorException('No se pudo registrar el evento')`.
- **`src/modules/health/health.controller.ts`**:
  - Inyección de `DataSource` y ejecución de `SELECT 1` en `GET /health`, retornando `{ status: 'ok', database: 'up', timestamp }` o lanzando `ServiceUnavailableException` (`503`) si la base de datos no responde.

## Verificación
- `npm run build` y `npm run lint` sin errores.
- 12 pruebas HTTP ejecutadas con `curl.exe -i` verificando códigos `200`, `201`, `400` y `413` (sin incluir cambios en `db/events.sqlite`).

Closes #4
```
