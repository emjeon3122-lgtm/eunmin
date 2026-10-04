// Swappable file storage interface — see docs/04-backend-integration.md section 8-3.
// LocalStorageService is the only implementation today; an S3StorageService would
// implement the same interface and be selected via STORAGE_DRIVER, same pattern as
// the VendorAdapter injection token.
export interface StoredFile {
  fileUrl: string;
}

export interface StorageService {
  save(file: Express.Multer.File): Promise<StoredFile>;
  // 저장된 파일명(UUID.확장자)의 실제 경로 — 서명 검증을 통과한 다운로드에서만 쓴다.
  filePath(fileName: string): string;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
