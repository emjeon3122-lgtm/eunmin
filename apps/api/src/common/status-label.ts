import { RequestStatus } from './enums';

const LABELS: Record<RequestStatus, string> = {
  draft: '임시저장',
  submitted: '제출됨',
  submitted_to_vendor: '꽃집전달',
  accepted: '접수됨',
  completed: '완료',
  cancelled: '취소',
};

export function statusLabel(status: RequestStatus | string): string {
  return LABELS[status as RequestStatus] ?? status;
}
