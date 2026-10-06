import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

import { openApiDocument } from './openapi.ts';

export function mountSwagger(app: Express): void {
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'SSC QR Attendance API',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    }),
  );
}
