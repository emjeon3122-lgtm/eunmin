import { OccasionType } from '@prisma/client';

const LABELS: Record<OccasionType, string> = {
  wedding: '결혼',
  funeral: '부고',
  opening: '개업',
  etc: '기타',
};

export function occasionLabel(type: OccasionType | string): string {
  return LABELS[type as OccasionType] ?? type;
}

export function formatKrw(amount: number): string {
  return amount.toLocaleString('ko-KR');
}
