import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationSettingsService } from '../settings/integration-settings.service';

// 회사(Entra) 디렉터리에서 직원을 찾아 명단에 추가한다 — 배포 센터의 회사 사용자 검색과 같은 방식.
//
// - 관리자 화면 "외부 연동 설정 > 로그인 방식"에 저장한 테넌트·클라이언트 ID·암호로 앱 전용 토큰
//   (client_credentials)을 받아 Microsoft Graph /v1.0/users 를 조회한다.
// - Entra 앱에 Microsoft Graph **애플리케이션 권한 User.Read.All + 관리자 동의**가 있어야 한다.
//   없으면 403 이 오고, 무엇을 하면 되는지 안내 문구로 바꿔 돌려준다.
// - 추가할 때 Microsoft 계정 고유값(oid)을 바로 연결해 두므로(ssoSubjectId=oidc:<oid>) 첫 로그인부터
//   메일 주소 표기 차이와 상관없이 같은 사람으로 매칭된다.
// - 시험용으로 주소를 바꿀 수 있다: MS_LOGIN_BASE_URL, GRAPH_BASE_URL (기본은 Microsoft 공식 주소).
const LOGIN_BASE = (process.env.MS_LOGIN_BASE_URL ?? 'https://login.microsoftonline.com').replace(/\/+$/, '');
const GRAPH_BASE = (process.env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com').replace(/\/+$/, '');
const SELECT = 'id,displayName,mail,userPrincipalName,department,jobTitle,mobilePhone,employeeId,accountEnabled';
const TIMEOUT_MS = 15_000;
const EMPLOYEE_NO = /^[A-Za-z0-9_-]{1,30}$/;
const PHONE = /^[0-9+\- ]{9,20}$/;

export interface DirectoryPerson {
  oid: string;
  name: string;
  email: string;
  department: string;
  jobTitle: string;
  phone: string;
  enabled: boolean;
  // 이미 명단에 있으면 그 사번(아니면 null)
  registeredAs: string | null;
}

interface GraphUser {
  id?: unknown;
  displayName?: unknown;
  mail?: unknown;
  userPrincipalName?: unknown;
  department?: unknown;
  jobTitle?: unknown;
  mobilePhone?: unknown;
  employeeId?: unknown;
  accountEnabled?: unknown;
}

export class DirectoryError extends ApiException {
  constructor(message: string, status = HttpStatus.BAD_GATEWAY) {
    super(status, 'DIRECTORY_ERROR', message);
  }
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);
  private token: { key: string; value: string; until: number } | null = null;

  constructor(
    private readonly settings: IntegrationSettingsService,
    private readonly prisma: PrismaService,
  ) {
    // 로그인 설정이 바뀌면 받아 둔 토큰을 버린다.
    this.settings.onChange(() => {
      this.token = null;
    });
  }

  // 이름·메일로 회사 계정을 찾는다(최대 20명). 두 글자 미만이면 빈 목록.
  async search(query: string): Promise<DirectoryPerson[]> {
    const term = String(query ?? '').replace(/["\\]/g, '').trim();
    if (term.length < 2) return [];
    const params = new URLSearchParams({
      $search: `"displayName:${term}" OR "mail:${term}" OR "userPrincipalName:${term}"`,
      $select: SELECT,
      $top: '20',
    });
    const answer = await this.graph<{ value?: unknown }>(`/v1.0/users?${params.toString()}`);
    if (!Array.isArray(answer.value)) {
      throw new DirectoryError('Microsoft Graph 의 사용자 목록 응답이 올바르지 않습니다. 잠시 후 다시 시도하세요.');
    }
    const people = (answer.value as GraphUser[])
      .map(toPerson)
      .filter((p): p is DirectoryPerson => p !== null)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return this.markRegistered(people);
  }

  // 회사 계정 하나를 직원 명단에 추가한다. oid 로 Graph 에서 다시 읽어 회사 계정인지 확인한다.
  async add(oid: string, opts: { isAdmin: boolean; isPartner: boolean }) {
    if (!/^[0-9a-fA-F-]{36}$/.test(oid)) {
      throw new DirectoryError('회사 계정 식별값 형식이 올바르지 않습니다.', HttpStatus.BAD_REQUEST);
    }
    const raw = await this.graph<GraphUser>(`/v1.0/users/${encodeURIComponent(oid)}?$select=${SELECT}`);
    const person = toPerson(raw);
    if (!person) throw new DirectoryError('회사 계정 정보를 읽지 못했습니다.', HttpStatus.BAD_REQUEST);

    const subject = `oidc:${person.oid}`;
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ ssoSubjectId: subject }, { email: person.email }] },
    });
    if (existing) {
      throw new DirectoryError(`이미 명단에 있습니다(사번 ${existing.employeeNo}).`, HttpStatus.BAD_REQUEST);
    }

    const employeeNo = await this.freeEmployeeNo(employeeNoFor(raw, person.email));
    await this.prisma.user.create({
      data: {
        employeeNo,
        name: person.name.slice(0, 50),
        department: (person.department || '미입력').slice(0, 50),
        email: person.email,
        phone: PHONE.test(person.phone) ? person.phone : null,
        isPartner: opts.isPartner,
        role: opts.isAdmin ? 'admin' : 'employee',
        ssoSubjectId: subject,
      },
    });
    this.logger.log(`회사 계정에서 직원 추가: ${employeeNo} (${opts.isAdmin ? '관리자' : '직원'})`);
    return { employeeNo };
  }

  private async markRegistered(people: DirectoryPerson[]): Promise<DirectoryPerson[]> {
    if (people.length === 0) return people;
    const rows = await this.prisma.user.findMany({
      where: {
        OR: [
          { ssoSubjectId: { in: people.map((p) => `oidc:${p.oid}`) } },
          { email: { in: people.map((p) => p.email) } },
        ],
      },
      select: { employeeNo: true, email: true, ssoSubjectId: true },
    });
    return people.map((p) => {
      const hit = rows.find((r) => r.ssoSubjectId === `oidc:${p.oid}` || r.email.toLowerCase() === p.email);
      return { ...p, registeredAs: hit?.employeeNo ?? null };
    });
  }

  // 같은 사번이 이미 있으면 뒤에 _2, _3 … 을 붙인다.
  private async freeEmployeeNo(base: string): Promise<string> {
    for (let n = 1; n < 100; n++) {
      const suffix = n === 1 ? '' : `_${n}`;
      const candidate = base.slice(0, 30 - suffix.length) + suffix;
      if (!(await this.prisma.user.findUnique({ where: { employeeNo: candidate } }))) return candidate;
    }
    return `u_${randomUUID().slice(0, 8)}`;
  }

  // ---- Microsoft 호출 ---------------------------------------------------------

  private credentials() {
    const auth = this.settings.get().auth;
    const tenant = /login\.microsoftonline\.com\/([^/]+)/i.exec(auth.oidcIssuer)?.[1] ?? '';
    if (!tenant || !auth.oidcClientId || !auth.oidcClientSecret) {
      throw new DirectoryError(
        '설정 > 외부 연동 설정 > 로그인 방식(Microsoft 365)에 테넌트 ID·클라이언트 ID·클라이언트 암호를 먼저 저장하세요.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return { tenant, clientId: auth.oidcClientId, clientSecret: auth.oidcClientSecret };
  }

  private async appToken(forceRefresh: boolean): Promise<string> {
    const { tenant, clientId, clientSecret } = this.credentials();
    const key = `${tenant}|${clientId}|${clientSecret}`;
    if (!forceRefresh && this.token && this.token.key === key && Date.now() < this.token.until) {
      return this.token.value;
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: `${GRAPH_BASE}/.default`,
    });
    const res = await this.fetch(`${LOGIN_BASE}/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
    if (!res.ok || typeof json.access_token !== 'string') {
      const code = text(json.error);
      this.logger.warn(`Microsoft 토큰 발급 실패: HTTP ${res.status} ${code}`);
      if (code === 'invalid_client' || code === 'unauthorized_client') {
        throw new DirectoryError('클라이언트 ID 또는 클라이언트 암호가 맞지 않습니다(암호가 만료됐을 수도 있습니다). 로그인 방식 설정을 확인하세요.');
      }
      if (code === 'invalid_request' || res.status === 400) {
        throw new DirectoryError('테넌트 ID 가 맞지 않거나 앱 등록을 찾을 수 없습니다. 로그인 방식 설정을 확인하세요.');
      }
      throw new DirectoryError('Microsoft 인증 서버에서 토큰을 받지 못했습니다. 잠시 후 다시 시도하세요.');
    }
    const lifetime = Number(json.expires_in) > 0 ? Number(json.expires_in) : 3600;
    this.token = { key, value: json.access_token, until: Date.now() + Math.max(0, lifetime - 120) * 1000 };
    return json.access_token;
  }

  private async graph<T>(path: string): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.appToken(attempt > 0);
      const res = await this.fetch(`${GRAPH_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
      });
      if (res.ok) return (await res.json()) as T;
      // 권한을 막 추가한 직후라면 예전 토큰일 수 있다 — 새 토큰으로 한 번만 다시 시도한다.
      if ((res.status === 401 || res.status === 403) && attempt === 0) continue;
      this.logger.warn(`Microsoft Graph 호출 실패: HTTP ${res.status}`);
      if (res.status === 401 || res.status === 403) {
        throw new DirectoryError(
          '회사 사용자 검색 권한이 없습니다. Entra 관리 센터 > 앱 등록 > (화환 앱) > API 사용 권한 > 권한 추가 > Microsoft Graph > 애플리케이션 권한 > User.Read.All 을 추가하고 [관리자 동의 부여]를 누르세요.',
          HttpStatus.FORBIDDEN,
        );
      }
      if (res.status === 404) throw new DirectoryError('회사 계정을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
      throw new DirectoryError('Microsoft Graph 호출에 실패했습니다. 잠시 후 다시 시도하세요.');
    }
    throw new DirectoryError('Microsoft Graph 호출에 실패했습니다.');
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      // 네트워크 예외 문자열에는 요청 주소가 섞일 수 있어 그대로 내보내지 않는다.
      throw new DirectoryError('Microsoft 서버에 연결하지 못했습니다. NAS 의 인터넷·DNS 연결을 확인하세요.');
    }
  }
}

function toPerson(user: GraphUser | null | undefined): DirectoryPerson | null {
  if (!user || typeof user !== 'object') return null;
  const oid = text(user.id);
  const upn = text(user.userPrincipalName).toLowerCase();
  const email = (text(user.mail) || upn).toLowerCase();
  if (!oid || !email.includes('@')) return null;
  return {
    oid,
    name: text(user.displayName) || email,
    email,
    department: text(user.department),
    jobTitle: text(user.jobTitle),
    phone: text(user.mobilePhone),
    enabled: user.accountEnabled !== false,
    registeredAs: null,
  };
}

// 사번: Entra 의 사번(employeeId)이 쓸 수 있는 형식이면 그대로, 아니면 메일 앞부분(jinkyu.kim → jinkyu_kim).
function employeeNoFor(user: GraphUser, email: string): string {
  const employeeId = text(user.employeeId);
  if (EMPLOYEE_NO.test(employeeId)) return employeeId;
  const local = email.split('@')[0].replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return (local || 'user').slice(0, 30);
}
