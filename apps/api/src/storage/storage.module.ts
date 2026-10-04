import { Module } from '@nestjs/common';
import { FileUrlService } from './file-url.service';
import { FilesController } from './files.controller';
import { LocalStorageService } from './local-storage.service';
import { STORAGE_SERVICE } from './storage.service.interface';

// STORAGE_DRIVER only supports "local" today (see .env.example); the provider
// factory stays here so adding an S3 driver later is a one-line change.
@Module({
  controllers: [FilesController],
  providers: [
    LocalStorageService,
    {
      provide: STORAGE_SERVICE,
      useExisting: LocalStorageService,
    },
    FileUrlService,
  ],
  exports: [STORAGE_SERVICE, FileUrlService],
})
export class StorageModule {}
