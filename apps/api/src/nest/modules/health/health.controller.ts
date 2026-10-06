import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get(['health', 'api/health', 'api/v1/health', 'v1/health'])
  health(): { status: 'ok'; server_time: string } {
    return {
      status: 'ok',
      server_time: new Date().toISOString(),
    };
  }
}
