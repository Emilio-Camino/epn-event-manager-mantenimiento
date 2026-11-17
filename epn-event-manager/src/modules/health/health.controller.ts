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
