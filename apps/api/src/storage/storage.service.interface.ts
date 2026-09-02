// Swappable file storage interface — see docs/04-backend-integration.md section 8-3.
// LocalStorageService is the only implementation today; an S3StorageService would
// implement the same interface and be selected via STORAGE_DRIVER, same pattern as
// the VendorAdapter injection token.
export interface StoredFile {
  fileUrl: string;
}

export interface StorageService {
  save(file: Express.Multer.File): Promise<StoredFile>;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
