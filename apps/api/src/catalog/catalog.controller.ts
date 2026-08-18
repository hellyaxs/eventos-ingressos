import { Controller, Get, Query } from '@nestjs/common';
import { PageQueryDto, SearchPageQueryDto } from '../common/pagination';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('search')
  search(@Query() query: SearchPageQueryDto) {
    return this.catalogService.search(query.q ?? '', query);
  }

  @Get('now-playing')
  nowPlaying(@Query() query: PageQueryDto) {
    return this.catalogService.nowPlaying(query);
  }

  @Get('upcoming')
  upcoming(@Query() query: PageQueryDto) {
    return this.catalogService.upcoming(query);
  }
}
