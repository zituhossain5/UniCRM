import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { TasksService } from '../tasks/tasks.service';
import { TaskListQueryDto } from '../tasks/dto/tasks.dto';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  ProjectListQueryDto,
  UpdateProjectDto,
} from './dto/projects.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(TasksService) private readonly tasks: TasksService,
  ) {}

  @RequirePermission(PERMISSIONS.projectRead)
  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: ProjectListQueryDto) {
    return this.projects.list(principal, query);
  }

  @RequirePermission(PERMISSIONS.projectRead)
  @Get('reference/users')
  async users(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.projects.listUsers(principal) };
  }

  @RequirePermission(PERMISSIONS.projectCreate)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateProjectDto,
  ) {
    return { data: await this.projects.create(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.projectRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.projects.get(principal, id) };
  }

  @RequirePermission(PERMISSIONS.projectUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return { data: await this.projects.update(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.projectDelete)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.projects.archive(principal, id) };
  }

  @RequirePermission(PERMISSIONS.projectRead)
  @Get(':id/members')
  async members(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.projects.listMembers(principal, id) };
  }

  @RequirePermission(PERMISSIONS.projectManageMembers)
  @Post(':id/members')
  async addMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return { data: await this.projects.addMember(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.projectManageMembers)
  @Delete(':id/members/:userId')
  @HttpCode(204)
  async removeMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.projects.removeMember(principal, id, userId);
  }

  @RequirePermission(PERMISSIONS.taskRead)
  @Get(':id/tasks')
  listTasks(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TaskListQueryDto,
  ) {
    return this.tasks.list(principal, { ...query, project: id });
  }
}
