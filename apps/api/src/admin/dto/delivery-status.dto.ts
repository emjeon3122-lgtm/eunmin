import { IsIn, IsString, MinLength } from 'class-validator';

export class DeliveryStatusDto {
  @IsIn(['accepted', 'completed'])
  status: 'accepted' | 'completed';

  @IsString()
  @MinLength(1)
  note: string;
}
