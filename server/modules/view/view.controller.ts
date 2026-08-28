import { Controller, Get, Render } from '@nestjs/common';

@Controller()
export class ViewController {
  @Get(['/', '*'])
  @Render('index')
  async render(): Promise<Record<string, unknown>> {
    return {};
  }
}
