import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const client = new Redis({
          host: configService.get<string>('redis.host') || 'localhost',
          port: configService.get<number>('redis.port') || 6379,
          password: configService.get<string>('redis.password') || undefined,
          retryStrategy: (times) => Math.min(times * 50, 2000),
          lazyConnect: true,
          enableOfflineQueue: false,
        });

        client.on('error', (err) => {
          // Don't crash on Redis connection error - degrade gracefully
          console.warn('Redis connection error:', err.message);
        });

        client.on('connect', () => {
          console.log('Redis connected');
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
