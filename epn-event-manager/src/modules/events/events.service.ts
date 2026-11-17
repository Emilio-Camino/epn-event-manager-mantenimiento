import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(CreateEventEntity)
    private readonly createRepo: Repository<CreateEventEntity>,
    @InjectRepository(UpdateEventEntity)
    private readonly updateRepo: Repository<UpdateEventEntity>,
    @InjectRepository(DeleteEventEntity)
    private readonly deleteRepo: Repository<DeleteEventEntity>,
    @InjectRepository(QueryEventEntity)
    private readonly queryRepo: Repository<QueryEventEntity>,
  ) {}

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
        const ev = this.createRepo.create({
          source: dto.source,
          entity: dto.entity,
          action: dto.action,
          title: dto.title,
          description: dto.description,
          payload: payloadStr,
          recorded_at: localDate,
        });
        await this.createRepo.save(ev);
        return { ok: true };
      }

      if (action === 'UPDATE') {
        const ev = this.updateRepo.create({
          source: dto.source,
          entity: dto.entity,
          action: dto.action,
          title: dto.title,
          description: dto.description,
          payload: payloadStr,
          timestamp: localDate,
        });
        await this.updateRepo.save(ev);
        return { ok: true };
      }

      if (action === 'DELETE') {
        // se arregló: ahora se guarda el evento DELETE en la base de datos con su description
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

      if (action === 'QUERY') {
        const ev = this.queryRepo.create({
          source: dto.source,
          entity: dto.entity,
          action: dto.action,
          title: dto.title,
          description: dto.description,
          payload: payloadStr,
          event_date: localDate,
        });
        await this.queryRepo.save(ev);
        return { ok: true };
      }

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

  async findAll(): Promise<object[]> {
    const [creates, updates, deletes, queries] = await Promise.all([
      this.createRepo.find(),
      this.updateRepo.find(),
      this.deleteRepo.find(),
      this.queryRepo.find(),
    ]);

    const merged = [
      ...creates.map((e) => ({ ...e, _table: 'create_events' })),
      ...updates.map((e) => ({ ...e, _table: 'update_events' })),
      ...deletes.map((e) => ({ ...e, _table: 'delete_events' })),
      ...queries.map((e) => ({ ...e, _table: 'query_events' })),
    ];

    merged.sort((a, b) => {
      const timeA = this.getEventTimestamp(a);
      const timeB = this.getEventTimestamp(b);

      if (timeA === null && timeB === null) return 0;
      if (timeA === null) return 1;
      if (timeB === null) return -1;
      return timeB - timeA;
    });

    return merged;
  }

  private getEventTimestamp(event: object): number | null {
    let value: unknown;
    if ('recorded_at' in event) value = event.recorded_at;
    else if ('timestamp' in event) value = event.timestamp;
    else if ('createdAt' in event) value = event.createdAt;
    else if ('event_date' in event) value = event.event_date;

    if (typeof value !== 'string') return null;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  async findBySource(source: string): Promise<object[]> {
    source = this.sanitizeParam(source, 'source');
    const [creates, updates, deletes, queries] = await Promise.all([
      this.createRepo.findBy({ source }),
      this.updateRepo.findBy({ source }),
      this.deleteRepo.findBy({ source }),
      this.queryRepo.findBy({ source }),
    ]);
    return [...creates, ...updates, ...deletes, ...queries];
  }

  async findByEntity(entity: string): Promise<object[]> {
    // se arregló (preventivo): parámetro sanitizado y validado
    entity = this.sanitizeParam(entity, 'entity');
    const [creates, updates, deletes, queries] = await Promise.all([
      this.createRepo.findBy({ entity }),
      this.updateRepo.findBy({ entity }),
      this.deleteRepo.findBy({ entity }),
      this.queryRepo.findBy({ entity }),
    ]);
    return [...creates, ...updates, ...deletes, ...queries];
  }

  async getStats(): Promise<object> {
    const [createCount, updateCount, deleteCount, queryCount] =
      await Promise.all([
        this.createRepo.count(),
        this.updateRepo.count(),
        this.deleteRepo.count(),
        this.queryRepo.count(),
      ]);

    return {
      create: createCount,
      update: updateCount,
      delete: deleteCount,
      query: queryCount,
      total: createCount + updateCount + deleteCount + queryCount,
    };
  }
}
