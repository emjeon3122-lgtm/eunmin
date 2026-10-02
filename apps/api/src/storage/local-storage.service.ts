import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { AppConfig } from '../config/configuration';
import { StorageService, StoredFile } from './storage.service.interface';

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly dir: string;

  constructor(private readonly configService: ConfigService) {
    this.dir = resolve(this.configService.get<AppConfig['storageLocalDir']>('app.storageLocalDir')!);
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  async save(file: Express.Multer.File): Promise<StoredFile> {
    const safeExt = extname(file.originalname).slice(0, 10);
    const filename = `${randomUUID()}${safeExt}`;
    await writeFile(join(this.dir, filename), file.buffer);
    return { fileUrl: `/uploads/${filename}` };
  }
}
