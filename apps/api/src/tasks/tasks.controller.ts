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
import {
  CreateTaskCommentDto,
  CreateTaskDto,
  TaskListQueryDto,
  UpdateTaskDto,
} from './dto/tasks.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}

  @RequirePermission(PERMISSIONS.taskRead)
  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: TaskListQueryDto) {
    return this.tasks.list(principal, query);
  }

  @RequirePermission(PERMISSIONS.taskCreate)
  @Post()
  async create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateTaskDto) {
    return { data: await this.tasks.create(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.taskRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.tasks.get(principal, id) };
  }

  @RequirePermission(PERMISSIONS.taskUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return { data: await this.tasks.update(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.taskDelete)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.tasks.archive(principal, id) };
  }

  @RequirePermission(PERMISSIONS.taskCommentRead)
  @Get(':id/comments')
  async comments(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.tasks.listComments(principal, id) };
  }

  @RequirePermission(PERMISSIONS.taskCommentCreate)
  @Post(':id/comments')
  async createComment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskCommentDto,
  ) {
    return { data: await this.tasks.createComment(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.taskCommentCreate)
  @Patch(':id/comments/:commentId')
  async updateComment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: CreateTaskCommentDto,
  ) {
    return { data: await this.tasks.updateComment(principal, id, commentId, dto) };
  }

  @RequirePermission(PERMISSIONS.taskCommentCreate)
  @Delete(':id/comments/:commentId')
  @HttpCode(204)
  async deleteComment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    await this.tasks.deleteComment(principal, id, commentId);
  }
}
