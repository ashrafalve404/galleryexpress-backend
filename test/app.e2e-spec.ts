import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from './../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health should return ok', async () => {
    const res = await supertest(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.data?.status ?? res.body.status).toBe('ok');
  });

  it('POST /api/v1/auth/login with invalid credentials should return 401', async () => {
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'notexist@test.com', password: 'wrongpassword' })
      .expect(401);
  });

  it('GET /api/v1/admin/bookings without auth should return 401', async () => {
    await supertest(app.getHttpServer())
      .get('/api/v1/admin/bookings')
      .expect(401);
  });
});
