import { IsUUID } from 'class-validator';

export class AttachPhotoDto {
  @IsUUID()
  attachmentId: string;
}
