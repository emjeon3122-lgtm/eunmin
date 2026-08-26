import { Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VendorStatusService } from './vendor-status.service';

// No JwtAuthGuard here by design — token IS the authentication (doc 02 section 3-5).
@Controller('vendor-status')
export class VendorStatusController {
  constructor(private readonly vendorStatusService: VendorStatusService) {}

  @Get(':token')
  getStatus(@Param('token') token: string) {
    return this.vendorStatusService.getStatus(token);
  }

  @Post(':token/accept')
  accept(@Param('token') token: string) {
    return this.vendorStatusService.accept(token);
  }

  @Post(':token/complete')
  @UseInterceptors(FileInterceptor('photo'))
  complete(@Param('token') token: string, @UploadedFile() photo?: Express.Multer.File) {
    return this.vendorStatusService.complete(token, photo);
  }
}
