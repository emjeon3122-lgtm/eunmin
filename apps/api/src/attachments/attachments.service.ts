import { Inject, Injectable } from '@nestjs/common';
import { AttachmentType, UploaderType } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service.interface';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async upload(
    file: Express.Multer.File,
    type: AttachmentType,
    uploaderType: UploaderType,
    uploadedById: string | null,
  ) {
    const { fileUrl } = await this.storage.save(file);
    return this.prisma.attachment.create({
      data: {
        fileName: file.originalname,
        fileUrl,
        mimeType: file.mimetype,
        type,
        uploaderType,
        uploadedById,
      },
    });
  }
}
