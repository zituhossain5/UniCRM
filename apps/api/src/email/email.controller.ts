import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { EmailService } from './email.service';

@Controller('dev/emails')
export class EmailController {
  constructor(@Inject(EmailService) private readonly email: EmailService) {}

  @Public()
  @Get()
  list(@Headers('x-dev-email-key') key?: string) {
    return { data: this.email.readDevelopmentOutbox(key) };
  }
}
