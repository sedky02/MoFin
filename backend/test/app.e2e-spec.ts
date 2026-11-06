import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  // The whole module graph boots (every provider resolves) and the public
  // probes answer; the readiness probe also reaches the database.
  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/health/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ok' });
  });

  // An unhandled error reaches the catch-all filter: a plain 500, with nothing of the stack in the body.
  it('/boom (GET) answers a 500 outside production', async () => {
    const res = await request(app.getHttpServer()).get('/boom').expect(500);
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });

  afterEach(async () => {
    await app.close();
  });
});
