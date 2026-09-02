import { Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { STORAGE_SERVICE } from './storage.service.interface';

// STORAGE_DRIVER only supports "local" today (see .env.example); the provider
// factory stays here so adding an S3 driver later is a one-line change.
@Module({
  providers: [
    LocalStorageService,
    {
      provide: STORAGE_SERVICE,
      useExisting: LocalStorageService,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
