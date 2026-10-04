import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { AppConfig } from '../config/configuration';
import { StorageService, StoredFile } from './storage.service.interface';

// 저장 파일의 확장자는 업로더가 보낸 파일명이 아니라 허용된 MIME 타입에서만 정한다.
// 파일명을 따르면 "x.html"을 이미지인 척 올려 /uploads에서 웹페이지로 실행시킬 수 있다.
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

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
    const ext = EXT_BY_MIME[file.mimetype];
    if (!ext) {
      throw new Error(`허용되지 않은 파일 형식입니다: ${file.mimetype}`);
    }
    const filename = `${randomUUID()}${ext}`;
    await writeFile(join(this.dir, filename), file.buffer);
    return { fileUrl: `/uploads/${filename}` };
  }
}
