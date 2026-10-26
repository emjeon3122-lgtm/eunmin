import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 같은 경조사에 여러 임직원이 각자 화환을 신청하는 중복을 찾는다.
//
// "같은 경조사" 판단 — 예식장·장례식장은 같은 건물·같은 날 여러 행사가 열리므로
// 장소·날짜만으로는 단정하지 않는다.
// - 같은 배송 주소 + 같은 날(한국 시간) → 같은 장소 후보(weak)
// - 그중 받는 분 이름 또는 고객사명까지 같으면 → 같은 경조사(strong)
// 규칙 — 외부감사 고객사는 독립성 때문에 한 건만 허용한다.
// - strong 중복이 있고 새 신청이나 기존 신청 중 하나라도 외부감사 건이면 → 접수 차단(block)
//   (관리자는 사유를 남기고 예외로 접수할 수 있다)
// - 그 외 중복 후보는 경고만 하고, 신청자가 확인하면 접수한다.
// 취소된 신청과 작성 중(draft) 신청은 비교하지 않는다.

const EXTERNAL_AUDIT = 'external_audit';
// 한국은 일광절약시간이 없어 UTC+9 고정이다. 신청의 "날짜"는 한국 날짜로 비교한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_STATUSES = ['cancelled', 'draft'];

export interface DuplicateCandidate {
  deliveryAddress: string;
  desiredArrivalAt: Date;
  recipientName: string;
  clientName?: string | null;
  contractType?: string | null;
}

export interface DuplicateMatch {
  id: string;
  requesterName: string;
  department: string;
  createdAt: Date;
  occasionType: string;
  deliveryDetail: string | null;
  desiredArrivalAt: Date;
  // 같은 경조사로 판단(받는 분·고객사 일치) — 이때만 받는 분 이름을 보여 준다.
  sameEvent: boolean;
  recipientName: string | null;
  externalAudit: boolean;
}

export interface DuplicateCheckResult {
  blocked: boolean;
  matches: DuplicateMatch[];
}

// 같은 장소·같은 날 판단에 필요한 신청 정보(목록·상세에서도 같은 함수로 묶는다).
interface ComparableRequest {
  id: string;
  deliveryAddress: string;
  desiredArrivalAt: Date;
  recipientName: string;
  clientName: string | null;
  contractType: string | null;
}

export function normalizeAddress(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function normalizeName(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toLowerCase();
}

// "(주)○○전자", "○○전자 주식회사", "㈜ ○○전자"를 같은 회사로 본다.
export function normalizeClientName(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\(\s*(주|유|사|재)\s*\)|㈜|㈲|주식회사|유한회사|유한책임회사|사단법인|재단법인/g, '')
    .replace(/[\s.,·\-_'"()[\]]/g, '')
    .toLowerCase();
}

export function kstDayStart(date: Date): number {
  return Math.floor((date.getTime() + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
}

function eventKey(r: { deliveryAddress: string; desiredArrivalAt: Date }): string {
  return `${normalizeAddress(r.deliveryAddress)}|${kstDayStart(r.desiredArrivalAt)}`;
}

export function isSameEvent(a: Omit<ComparableRequest, 'id'>, b: Omit<ComparableRequest, 'id'>): boolean {
  const recipient = normalizeName(a.recipientName);
  if (recipient && recipient === normalizeName(b.recipientName)) return true;
  const client = normalizeClientName(a.clientName);
  return client !== '' && client === normalizeClientName(b.clientName);
}

const COMPARABLE_SELECT = {
  id: true,
  deliveryAddress: true,
  desiredArrivalAt: true,
  recipientName: true,
  clientName: true,
  contractType: true,
} as const;

@Injectable()
export class DuplicateCheckService {
  constructor(private readonly prisma: PrismaService) {}

  // 새 신청(아직 저장 전)과 같은 장소·같은 날인 기존 신청을 찾는다.
  async check(candidate: DuplicateCandidate): Promise<DuplicateCheckResult> {
    const dayStart = kstDayStart(candidate.desiredArrivalAt);
    const address = normalizeAddress(candidate.deliveryAddress);
    const rows = await this.prisma.wreathRequest.findMany({
      where: {
        status: { notIn: INACTIVE_STATUSES },
        desiredArrivalAt: { gte: new Date(dayStart), lt: new Date(dayStart + DAY_MS) },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        ...COMPARABLE_SELECT,
        createdAt: true,
        occasionType: true,
        deliveryDetail: true,
        requester: { select: { name: true, department: true } },
      },
    });

    const candidateIsAudit = candidate.contractType === EXTERNAL_AUDIT;
    const matches: DuplicateMatch[] = rows
      .filter((r) => normalizeAddress(r.deliveryAddress) === address)
      .map((r) => {
        const sameEvent = isSameEvent(
          { ...candidate, clientName: candidate.clientName ?? null, contractType: candidate.contractType ?? null },
          r,
        );
        return {
          id: r.id,
          requesterName: r.requester.name,
          department: r.requester.department,
          createdAt: r.createdAt,
          occasionType: r.occasionType,
          deliveryDetail: r.deliveryDetail,
          desiredArrivalAt: r.desiredArrivalAt,
          sameEvent,
          recipientName: sameEvent ? r.recipientName : null,
          externalAudit: r.contractType === EXTERNAL_AUDIT,
        };
      });

    const blocked = matches.some((m) => m.sameEvent && (candidateIsAudit || m.externalAudit));
    return { blocked, matches };
  }

  // 관리자 목록용 — 주어진 신청들 각각에 대해 같은 장소·같은 날의 다른 신청이 있는지 표시한다.
  // 'same_event': 같은 경조사로 보이는 신청이 있음, 'same_place': 같은 장소·날짜 신청만 있음.
  async flagsFor(requests: ComparableRequest[]): Promise<Map<string, 'same_event' | 'same_place'>> {
    const flags = new Map<string, 'same_event' | 'same_place'>();
    if (requests.length === 0) return flags;
    // 목록에 나온 날짜들만 골라 조회한다(기간 전체를 훑지 않는다).
    const days = [...new Set(requests.map((r) => kstDayStart(r.desiredArrivalAt)))];
    const others = await this.prisma.wreathRequest.findMany({
      where: {
        status: { notIn: INACTIVE_STATUSES },
        OR: days.map((d) => ({ desiredArrivalAt: { gte: new Date(d), lt: new Date(d + DAY_MS) } })),
      },
      select: COMPARABLE_SELECT,
    });
    const byKey = new Map<string, ComparableRequest[]>();
    for (const o of others) {
      const key = eventKey(o);
      byKey.set(key, [...(byKey.get(key) ?? []), o]);
    }
    for (const r of requests) {
      const peers = (byKey.get(eventKey(r)) ?? []).filter((o) => o.id !== r.id);
      if (peers.length === 0) continue;
      flags.set(r.id, peers.some((o) => isSameEvent(r, o)) ? 'same_event' : 'same_place');
    }
    return flags;
  }

  // 관리자 상세용 — 이 신청과 같은 장소·같은 날의 다른 신청 목록.
  async relatedTo(requestId: string) {
    const self = await this.prisma.wreathRequest.findUnique({ where: { id: requestId }, select: COMPARABLE_SELECT });
    if (!self) return [];
    const dayStart = kstDayStart(self.desiredArrivalAt);
    const rows = await this.prisma.wreathRequest.findMany({
      where: {
        id: { not: requestId },
        status: { notIn: INACTIVE_STATUSES },
        desiredArrivalAt: { gte: new Date(dayStart), lt: new Date(dayStart + DAY_MS) },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        ...COMPARABLE_SELECT,
        status: true,
        createdAt: true,
        requester: { select: { name: true, department: true } },
      },
    });
    const address = normalizeAddress(self.deliveryAddress);
    return rows
      .filter((r) => normalizeAddress(r.deliveryAddress) === address)
      .map((r) => ({
        id: r.id,
        requesterName: r.requester.name,
        department: r.requester.department,
        status: r.status,
        createdAt: r.createdAt,
        recipientName: r.recipientName,
        clientName: r.clientName,
        sameEvent: isSameEvent(self, r),
        externalAudit: r.contractType === EXTERNAL_AUDIT,
      }));
  }
}
