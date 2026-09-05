import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
@Module({ controllers: [SearchController], imports: [AuthModule], providers: [SearchService] })
export class SearchModule {}
