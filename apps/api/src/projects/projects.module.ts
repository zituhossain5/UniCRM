import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TasksModule } from '../tasks/tasks.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { TagsModule } from '../tags/tags.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuditModule, TasksModule, CustomFieldsModule, TagsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
