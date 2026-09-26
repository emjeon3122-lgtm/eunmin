import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const TEN_MB = 10 * 1024 * 1024;

const PROOF_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function multerOptions(allowed: Set<string>): MulterOptions {
  return {
    limits: { fileSize: TEN_MB },
    fileFilter: (_req, file, callback) => {
      if (!allowed.has(file.mimetype)) {
        callback(new BadRequestException('지원하지 않는 파일 형식입니다.'), false);
        return;
      }
      callback(null, true);
    },
  };
}

// 파트너 승인 증빙 — JPG/JPEG/PNG/PDF/WEBP, 최대 10MB (신규 요구사항 Section 1).
export const PROOF_UPLOAD_OPTIONS = multerOptions(PROOF_MIME_TYPES);

// 배송완료 사진/청첩장 참고 이미지 — 이미지 전용, 최대 10MB (신규 요구사항 Section 4).
export const PHOTO_UPLOAD_OPTIONS = multerOptions(PHOTO_MIME_TYPES);
