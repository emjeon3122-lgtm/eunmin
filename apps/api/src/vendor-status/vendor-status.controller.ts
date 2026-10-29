import { Controller, Get, Param, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PHOTO_UPLOAD_OPTIONS } from '../common/file-validation';
import { VendorStatusService } from './vendor-status.service';

const MAX_COMPLETION_PHOTOS = 5;

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
  @UseInterceptors(FilesInterceptor('photos', MAX_COMPLETION_PHOTOS, PHOTO_UPLOAD_OPTIONS))
  complete(@Param('token') token: string, @UploadedFiles() photos?: Express.Multer.File[]) {
    return this.vendorStatusService.complete(token, photos ?? []);
  }
}
