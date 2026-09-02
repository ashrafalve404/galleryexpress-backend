import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Ticket Dorkar API',
      version: '1.0.0',
    };
  }

  info() {
    return {
      name: 'Ticket Dorkar Bus Ticket Booking API',
      version: '1.0.0',
      docs: '/api/docs',
    };
  }
}
