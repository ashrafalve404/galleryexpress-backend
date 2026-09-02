import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Body parser size limits for image uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Security
  app.use(helmet());

  // CORS
  const corsOrigins = (
    process.env.CORS_ORIGIN || 'http://localhost:3001'
  ).split(',');
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
    credentials: true,
  });

  // Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global Guards (JWT is default, use @Public() to bypass)
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));

  // Swagger documentation
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Ticket Dorkar API')
      .setDescription(
        'Production-grade bus ticket booking backend for Ticket Dorkar',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Auth', 'Authentication endpoints')
      .addTag('Schedules', 'Schedule search and seat availability')
      .addTag('Bookings', 'Booking engine')
      .addTag('Tickets', 'Ticket management and verification')
      .addTag('Routes', 'Route management')
      .addTag('Admin - Coaches', 'Coach management (admin)')
      .addTag('Admin - Fares', 'Fare management (admin)')
      .addTag('Admin - Reports', 'Reporting (admin)')
      .addTag('Admin - Counters', 'Counter management (admin)')
      .addTag('CMS', 'Content management')
      .addTag('Sliders', 'Banner/slider management')
      .addTag('Discounts', 'Coupon and discount management')
      .addTag('Settings', 'System settings')
      .addTag('Users', 'User management')
      .addTag('Admin - Audit Logs', 'Audit log access (admin)')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });

    console.log(
      `📚 Swagger docs: http://localhost:${process.env.PORT || 3000}/api/docs`,
    );
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  console.log(`🚀 Gallery Express API running on: http://localhost:${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();
