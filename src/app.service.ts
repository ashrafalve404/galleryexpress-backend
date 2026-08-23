import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Gallery Express API',
      version: '1.0.0',
    };
  }

  info() {
    return {
      name: 'Gallery Express Bus Ticket Booking API',
      version: '1.0.0',
      docs: '/api/docs',
    };
  }
}
