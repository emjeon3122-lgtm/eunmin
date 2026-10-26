import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { AppConfig } from '../config/configuration';
import { ApiException } from '../common/exceptions/api.exception';
import { HttpStatus } from '@nestjs/common';
import {
  IntegrationSettings,
  IntegrationSettingsPatch,
  IntegrationSettingsView,
  SECRET_FIELDS,
  SecretView,
  SectionKey,
} from './integration-settings.types';

// 관리자가 화면에서 입력한 연동 설정(API 키·클라이언트 암호 등)의 저장소.
//
// - 코드나 DB 가 아니라 **파일 하나**에 저장한다: <SETTINGS_FILE> (기본 /data/settings/integrations.enc,
//   로컬은 ./settings/integrations.enc). 운영 자료 폴더에 있어 업데이트·되돌리기에도 보존된다.
// - 파일은 AES-256-GCM 으로 암호화한다. 키는 SETTINGS_ENCRYPTION_KEY(64자 hex)가 있으면 그것을,
//   없으면 JWT_SECRET 에서 파생한다 — 그래서 JWT_SECRET 을 바꾸면 이 파일도 읽을 수 없게 된다
//   (그 경우 파일을 옆에 보관하고 .env 값으로 동작한다).
// - .env 의 값은 기본값이다. 저장한 적이 없으면 .env 그대로, 저장하면 파일 값이 우선한다.
// - 저장은 재시작 없이 바로 적용된다: 로그인·알림톡·청첩장 AI 가 매번 get() 으로 현재 값을 읽는다.
const FILE_VERSION = 1;
const MIN_WEBHOOK_SECRET = 32;

interface StoredPayload {
  settings: IntegrationSettings;
  savedAt: string;
  savedBy: string;
}

interface EncryptedFile {
  v: number;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
}

export class IntegrationSettingsError extends ApiException {
  constructor(message: string) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_INTEGRATION_SETTINGS', message);
  }
}

@Injectable()
export class IntegrationSettingsService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationSettingsService.name);
  private readonly filePath: string;
  private readonly key: Buffer;
  private readonly isProduction: boolean;
  private readonly envDefaults: IntegrationSettings;
  private current: IntegrationSettings;
  private meta: IntegrationSettingsView['meta'];
  private readonly listeners = new Set<(settings: IntegrationSettings) => void>();

  constructor(configService: ConfigService) {
    const app = configService.get<AppConfig>('app')!;
    this.isProduction = app.isProduction;
    this.filePath = app.settingsFile;
    this.key = deriveKey(app.settingsEncryptionKey, app.jwtSecret);
    this.envDefaults = {
      auth: {
        mode: app.authMode,
        allowDevLogin: app.allowDevLogin,
        oidcIssuer: app.oidc.issuer,
        oidcClientId: app.oidc.clientId,
        oidcClientSecret: app.oidc.clientSecret,
        oidcRedirectUri: app.oidc.redirectUri,
        localAdminId: '',
        localAdminPasswordHash: '',
      },
      vendor: {
        adapter: app.vendorAdapter,
        apiKey: app.kakao.apiKey,
        apiSecret: app.kakao.apiSecret,
        senderKey: app.kakao.senderKey,
        senderPhone: app.kakao.senderPhone,
        apiBaseUrl: app.kakao.apiBaseUrl,
        templateId: app.kakao.templateId,
        webhookSecret: app.kakao.webhookSecret,
      },
      invitationParser: {
        mode: app.invitationParser,
        anthropicApiKey: app.anthropic.apiKey,
        model: app.anthropic.model,
      },
    };
    this.current = clone(this.envDefaults);
    this.meta = { file: this.filePath, fromFile: false, savedAt: null, savedBy: null };
  }

  onModuleInit() {
    this.load();
  }

  // 현재 적용 중인 설정(비밀값 포함). 서버 안에서만 쓰고 화면으로는 view() 를 내보낸다.
  get(): IntegrationSettings {
    return this.current;
  }

  // 설정이 바뀌면 캐시(OIDC 클라이언트 등)를 비우도록 알린다.
  onChange(listener: (settings: IntegrationSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  devLoginEnabled(): boolean {
    const auth = this.current.auth;
    return auth.mode === 'mock' && (!this.isProduction || auth.allowDevLogin);
  }

  loginMethod(): IntegrationSettingsView['effective']['loginMethod'] {
    if (this.current.auth.mode === 'oidc') return 'oidc';
    return this.devLoginEnabled() ? 'dev' : 'none';
  }

  // 청첩장 AI 는 켜져 있어도 키가 없으면 Mock 으로 동작한다(요청마다 인증 오류가 나는 것보다 낫다).
  effectiveInvitationParser(): IntegrationSettings['invitationParser']['mode'] {
    const p = this.current.invitationParser;
    return p.mode === 'claude' && p.anthropicApiKey ? 'claude' : 'mock';
  }

  // 임시 관리자(비밀번호 로그인)가 설정돼 있는지. 모드와 무관하게, 지우기 전까지 열려 있다.
  localLoginEnabled(): boolean {
    const auth = this.current.auth;
    return Boolean(auth.localAdminId && auth.localAdminPasswordHash);
  }

  localAdmin(): { id: string; passwordHash: string } | null {
    const auth = this.current.auth;
    return this.localLoginEnabled() ? { id: auth.localAdminId, passwordHash: auth.localAdminPasswordHash } : null;
  }

  // 임시 관리자 계정 저장/삭제 — 일반 update() 는 이 두 항목을 받지 않는다(DTO 에 없음).
  async setLocalAdmin(id: string, passwordHash: string, actor: string): Promise<IntegrationSettingsView> {
    return this.write({ ...clone(this.current), auth: { ...this.current.auth, localAdminId: id, localAdminPasswordHash: passwordHash } }, actor, ['auth.localAdmin']);
  }

  async clearLocalAdmin(actor: string): Promise<IntegrationSettingsView> {
    return this.write({ ...clone(this.current), auth: { ...this.current.auth, localAdminId: '', localAdminPasswordHash: '' } }, actor, ['auth.localAdmin(삭제)']);
  }

  view(): IntegrationSettingsView {
    const s = this.current;
    const { localAdminId, localAdminPasswordHash, ...auth } = s.auth;
    return {
      auth: {
        ...auth,
        oidcClientSecret: mask(s.auth.oidcClientSecret),
        localAdmin: { id: localAdminId, set: Boolean(localAdminId && localAdminPasswordHash) },
      },
      vendor: {
        ...s.vendor,
        apiKey: mask(s.vendor.apiKey),
        apiSecret: mask(s.vendor.apiSecret),
        webhookSecret: mask(s.vendor.webhookSecret),
      },
      invitationParser: { ...s.invitationParser, anthropicApiKey: mask(s.invitationParser.anthropicApiKey) },
      effective: {
        loginMethod: this.loginMethod(),
        localLogin: this.localLoginEnabled(),
        vendorAdapter: s.vendor.adapter,
        invitationParser: this.effectiveInvitationParser(),
      },
      meta: { ...this.meta },
    };
  }

  // 관리자 저장. 섹션별로 보낸 항목만 바꾸고, 합친 결과를 검증한 뒤 파일에 쓰고 즉시 적용한다.
  async update(patch: IntegrationSettingsPatch, actor: string): Promise<IntegrationSettingsView> {
    const next = clone(this.current);
    const changed: string[] = [];
    for (const section of Object.keys(patch) as SectionKey[]) {
      const incoming = patch[section];
      if (!incoming || typeof incoming !== 'object') continue;
      const target = next[section] as unknown as Record<string, unknown>;
      const secrets = SECRET_FIELDS[section] as readonly string[];
      for (const [field, value] of Object.entries(incoming)) {
        if (!(field in target)) continue;
        if (secrets.includes(field)) {
          // 비밀값: 생략/빈 문자열이면 유지, null 이면 지움, 그 외는 교체.
          if (value === undefined || value === '') continue;
          target[field] = value === null ? '' : String(value).trim();
        } else if (value !== undefined && value !== null) {
          target[field] = typeof value === 'string' ? value.trim() : value;
        }
        changed.push(`${section}.${field}`);
      }
    }
    if (changed.length === 0) return this.view();
    // 다른 사내 앱처럼 테넌트 ID 만 넣어도 되게 — 주소가 아니면 Microsoft 발급자 주소로 바꿔 저장한다.
    next.auth.oidcIssuer = normalizeIssuer(next.auth.oidcIssuer);
    return this.write(next, actor, changed);
  }

  private async write(next: IntegrationSettings, actor: string, changed: string[]): Promise<IntegrationSettingsView> {
    const problems = validate(next);
    if (problems.length > 0) {
      throw new IntegrationSettingsError(problems.join(' '));
    }

    const savedAt = new Date().toISOString();
    this.persist({ settings: next, savedAt, savedBy: actor });
    this.current = next;
    this.meta = { file: this.filePath, fromFile: true, savedAt, savedBy: actor };
    // 값은 절대 기록하지 않는다 — 어느 항목을 누가 바꿨는지만 남긴다.
    this.logger.log(`연동 설정 변경 (${actor}): ${changed.join(', ')}`);
    this.notify();
    return this.view();
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.current);
      } catch (err) {
        this.logger.warn(`설정 변경 알림 처리 중 오류: ${String(err)}`);
      }
    }
  }

  private load() {
    if (!existsSync(this.filePath)) {
      this.logger.log(`연동 설정 파일이 없어 .env 값으로 동작합니다 (${this.filePath})`);
      return;
    }
    try {
      const file = JSON.parse(readFileSync(this.filePath, 'utf8')) as EncryptedFile;
      const payload = this.decrypt(file);
      const merged = clone(this.envDefaults);
      for (const section of Object.keys(merged) as SectionKey[]) {
        const stored = (payload.settings as Partial<IntegrationSettings>)[section];
        if (stored && typeof stored === 'object') {
          Object.assign(merged[section], pickKnown(merged[section] as object, stored as object));
        }
      }
      const problems = validate(merged);
      if (problems.length > 0) {
        this.logger.warn(`저장된 연동 설정에 빠진 값이 있습니다: ${problems.join(' ')}`);
      }
      this.current = merged;
      this.meta = { file: this.filePath, fromFile: true, savedAt: payload.savedAt ?? null, savedBy: payload.savedBy ?? null };
      this.logger.log(`연동 설정 파일을 읽었습니다 (저장: ${payload.savedAt} ${payload.savedBy})`);
    } catch (err) {
      // JWT_SECRET 이 바뀌었거나 파일이 손상된 경우. 파일을 옆에 보관하고 .env 값으로 동작한다.
      const parked = `${this.filePath}.unreadable-${Date.now()}`;
      try {
        renameSync(this.filePath, parked);
      } catch {
        // 옮기지 못해도 동작은 계속한다.
      }
      this.logger.error(
        `연동 설정 파일을 읽지 못해 .env 값으로 동작합니다 (${parked} 로 보관). 암호화 키(JWT_SECRET/SETTINGS_ENCRYPTION_KEY)가 바뀌었는지 확인하세요: ${String(err)}`,
      );
    }
  }

  private persist(payload: StoredPayload) {
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const file = this.encrypt(payload);
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(file), { mode: 0o600 });
    renameSync(tmp, this.filePath);
  }

  private encrypt(payload: StoredPayload): EncryptedFile {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return {
      v: FILE_VERSION,
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
  }

  private decrypt(file: EncryptedFile): StoredPayload {
    if (file.v !== FILE_VERSION || file.alg !== 'aes-256-gcm') {
      throw new Error('알 수 없는 설정 파일 형식입니다.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(file.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(file.tag, 'base64'));
    const text = Buffer.concat([decipher.update(Buffer.from(file.data, 'base64')), decipher.final()]).toString('utf8');
    return JSON.parse(text) as StoredPayload;
  }
}

// 합친 설정이 그 모드로 동작할 수 있는지. 켜진 기능에 필요한 값이 빠지면 저장을 거부한다.
export function validate(s: IntegrationSettings): string[] {
  const problems: string[] = [];
  if (s.auth.mode === 'oidc') {
    const missing = [
      ['oidcIssuer', '발급자(Issuer) 주소'],
      ['oidcClientId', '클라이언트 ID'],
      ['oidcClientSecret', '클라이언트 암호'],
      ['oidcRedirectUri', '리디렉션 URI'],
    ].filter(([k]) => !s.auth[k as keyof typeof s.auth]);
    if (missing.length) problems.push(`Microsoft 365 로그인을 켜려면 ${missing.map(([, l]) => l).join(', ')}이(가) 필요합니다.`);
    if (s.auth.oidcIssuer && !/^https:\/\//.test(s.auth.oidcIssuer)) problems.push('발급자 주소는 https:// 로 시작해야 합니다.');
    if (s.auth.oidcRedirectUri && !/^https:\/\//.test(s.auth.oidcRedirectUri)) problems.push('리디렉션 URI 는 https:// 로 시작해야 합니다.');
  }
  if (s.vendor.adapter === 'kakao') {
    const missing = [
      ['apiKey', 'API Key'],
      ['apiSecret', 'API Secret'],
      ['senderKey', '발신프로필 키(pfId)'],
      ['senderPhone', '발신번호'],
      ['templateId', '알림톡 템플릿 ID'],
    ].filter(([k]) => !s.vendor[k as keyof typeof s.vendor]);
    if (missing.length) problems.push(`알림톡 실제 발송을 켜려면 ${missing.map(([, l]) => l).join(', ')}이(가) 필요합니다.`);
  }
  if (s.vendor.apiBaseUrl && !/^https?:\/\//.test(s.vendor.apiBaseUrl)) problems.push('Solapi API 주소는 http(s):// 로 시작해야 합니다.');
  if (s.vendor.webhookSecret && s.vendor.webhookSecret.length < MIN_WEBHOOK_SECRET) {
    problems.push(`웹훅 비밀값은 ${MIN_WEBHOOK_SECRET}자 이상이어야 합니다(비워 두면 웹훅 경로가 닫힙니다).`);
  }
  if (s.invitationParser.mode === 'claude' && !s.invitationParser.anthropicApiKey) {
    problems.push('청첩장 AI 자동 채우기를 켜려면 Anthropic API 키가 필요합니다.');
  }
  if (!s.invitationParser.model) problems.push('Claude 모델 이름이 비어 있습니다.');
  return problems;
}

// "12345678-...(테넌트 ID)" 또는 "login.microsoftonline.com/<ID>/v2.0" 처럼 적어도
// https://login.microsoftonline.com/<ID>/v2.0 으로 맞춘다. 이미 https:// 주소면 그대로 둔다.
export function normalizeIssuer(value: string): string {
  const v = value.trim().replace(/\/+$/, '');
  if (!v || /^https:\/\//i.test(v)) return v;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return `https://login.microsoftonline.com/${v.toLowerCase()}/v2.0`;
  }
  if (/^(http:\/\/)?login\.microsoftonline\.com\//i.test(v)) {
    const rest = v.replace(/^http:\/\//i, '');
    return `https://${rest}${/\/v2\.0$/i.test(rest) ? '' : '/v2.0'}`;
  }
  return v;
}

function deriveKey(explicitHex: string, jwtSecret: string): Buffer {
  if (explicitHex) {
    if (!/^[0-9a-fA-F]{64}$/.test(explicitHex)) {
      throw new Error('SETTINGS_ENCRYPTION_KEY 는 64자리 16진수(32바이트)여야 합니다. 예: openssl rand -hex 32');
    }
    return Buffer.from(explicitHex, 'hex');
  }
  // 로그인 토큰 서명과 용도를 분리하기 위해 같은 비밀값에서 설정 전용 키를 파생한다.
  return createHash('sha256').update(`integration-settings:${jwtSecret}`).digest();
}

function mask(value: string): SecretView {
  if (!value) return { set: false, hint: '' };
  return { set: true, hint: value.length >= 8 ? `****${value.slice(-4)}` : '****' };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// 저장 파일에 있는 항목 중 지금 코드가 아는 항목만 받아들인다(옛 버전 파일 호환).
function pickKnown<T extends object>(template: T, stored: object): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(template) as (keyof T)[]) {
    const value = (stored as Record<string, unknown>)[key as string];
    if (value !== undefined && typeof value === typeof template[key]) {
      out[key] = value as T[keyof T];
    }
  }
  return out;
}
