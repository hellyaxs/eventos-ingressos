import { Controller, Get, Param } from '@nestjs/common';
import { ShareService } from './share.service';

@Controller('share')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Get(':shareToken')
  getByShareToken(@Param('shareToken') shareToken: string) {
    return this.shareService.getByShareToken(shareToken);
  }
}
