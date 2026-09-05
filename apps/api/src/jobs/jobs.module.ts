import { Global, Module } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Global()
@Module({ exports: [JobsService], providers: [JobsService] })
export class JobsModule {}
