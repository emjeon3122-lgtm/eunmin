import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// 엑셀 열 → 필드. 열 순서는 자유이고, 머리글은 공백·괄호 내용을 무시하고 비교한다
// ("파트너 여부(Y/N)" == "파트너여부").
const COLUMNS = [
  { key: 'employeeNo', header: '사번', aliases: ['사번', '사원번호'] },
  { key: 'name', header: '이름', aliases: ['이름', '성명'] },
  { key: 'department', header: '부서', aliases: ['부서', '소속'] },
  { key: 'email', header: '회사 이메일', aliases: ['회사이메일', '이메일', '메일', 'email'] },
  { key: 'phone', header: '휴대폰', aliases: ['휴대폰', '휴대폰번호', '연락처', '전화번호'] },
  { key: 'isPartner', header: '파트너 여부(Y/N)', aliases: ['파트너여부', '파트너'] },
  { key: 'isAdmin', header: '관리자 여부(Y/N)', aliases: ['관리자여부', '관리자'] },
] as const;
type ColumnKey = (typeof COLUMNS)[number]['key'];

const REQUIRED: ColumnKey[] = ['employeeNo', 'name', 'department', 'email'];
const MAX_ROWS = 3000;
const TRUE_WORDS = new Set(['y', 'yes', 'o', '예', 'true', '1']);
const FALSE_WORDS = new Set(['n', 'no', 'x', '아니오', 'false', '0']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYEE_NO = /^[A-Za-z0-9_-]{1,30}$/;
const PHONE = /^[0-9+\- ]{9,20}$/;

interface RosterRow {
  rowNumber: number;
  employeeNo: string;
  name: string;
  department: string;
  email: string;
  phone: string | null;
  isPartner: boolean;
  isAdmin: boolean | undefined; // 빈 칸이면 기존 권한 유지
}

export interface ImportResult {
  applied: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: { row: number; message: string }[];
}

const normalizeHeader = (s: string) => s.replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase();

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user
      .findMany({ orderBy: { employeeNo: 'asc' } })
      .then((users) =>
        users.map((u) => ({
          employeeNo: u.employeeNo,
          name: u.name,
          department: u.department,
          email: u.email,
          phone: u.phone,
          isPartner: u.isPartner,
          role: u.role,
          // 한 번이라도 Microsoft 365로 로그인해 계정이 연결됐는지
          loginLinked: u.ssoSubjectId.startsWith('oidc:'),
        })),
      );
  }

  // 현재 명단을 업로드 양식 그대로 내려준다 — 고쳐서 다시 올리면 된다(명단이 비어 있으면 빈 양식).
  async exportWorkbook(): Promise<Buffer> {
    const users = await this.prisma.user.findMany({ orderBy: { employeeNo: 'asc' } });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('직원 명단');
    sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.key === 'email' ? 28 : 16 }));
    // 사번·휴대폰이 숫자로 바뀌어 앞자리 0이 사라지지 않게 텍스트 서식으로 둔다.
    sheet.getColumn('employeeNo').numFmt = '@';
    sheet.getColumn('phone').numFmt = '@';
    sheet.getRow(1).font = { bold: true };
    for (const u of users) {
      sheet.addRow({
        employeeNo: u.employeeNo,
        name: u.name,
        department: u.department,
        email: u.email,
        phone: u.phone ?? '',
        isPartner: u.isPartner ? 'Y' : 'N',
        isAdmin: u.role === 'admin' ? 'Y' : 'N',
      });
    }
    const guide = workbook.addWorksheet('작성 방법');
    [
      '• 첫 번째 시트("직원 명단")만 읽습니다. 1행은 머리글이므로 지우지 마세요.',
      '• 사번·이름·부서·회사 이메일은 필수입니다. 회사 이메일은 Microsoft 365(Outlook) 로그인 주소와 같아야 합니다.',
      '• 파트너 여부: Y면 신청 시 파트너 승인 증빙 없이 바로 신청됩니다. 빈 칸은 N으로 봅니다.',
      '• 관리자 여부: Y면 관리자 화면을 쓸 수 있습니다. 빈 칸이면 기존 권한을 그대로 둡니다.',
      '• 같은 사번이 이미 있으면 내용을 수정하고, 없으면 새로 추가합니다. 엑셀에 없는 직원은 삭제되지 않습니다.',
      '• 오류가 한 줄이라도 있으면 아무것도 반영되지 않습니다. 오류를 고쳐 다시 올려주세요.',
    ].forEach((line) => guide.addRow([line]));
    guide.getColumn(1).width = 110;
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // dryRun이면 바뀔 내용만 계산해 돌려준다. 실제 반영은 오류가 하나도 없을 때만, 한 번에 한다.
  async import(file: Buffer, dryRun: boolean, actingUserId: string): Promise<ImportResult> {
    const { rows, errors } = await this.parse(file);
    const existing = await this.prisma.user.findMany();
    const byEmployeeNo = new Map(existing.map((u) => [u.employeeNo, u]));
    const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]));

    const creates: Prisma.UserCreateInput[] = [];
    const updates: { id: string; data: Prisma.UserUpdateInput }[] = [];
    let unchanged = 0;

    for (const row of rows) {
      const current = byEmployeeNo.get(row.employeeNo);
      const emailOwner = byEmail.get(row.email);
      if (emailOwner && emailOwner.employeeNo !== row.employeeNo) {
        errors.push({ row: row.rowNumber, message: `회사 이메일 ${row.email}은(는) 이미 사번 ${emailOwner.employeeNo}이(가) 쓰고 있습니다.` });
        continue;
      }
      const role = row.isAdmin === undefined ? current?.role ?? 'employee' : row.isAdmin ? 'admin' : 'employee';
      if (current?.id === actingUserId && current.role === 'admin' && role !== 'admin') {
        errors.push({ row: row.rowNumber, message: '본인의 관리자 권한은 명단 업로드로 해제할 수 없습니다.' });
        continue;
      }
      const data = {
        name: row.name,
        department: row.department,
        email: row.email,
        phone: row.phone,
        isPartner: row.isPartner,
        role,
      };
      if (!current) {
        // 로그인 연결 전이라 Microsoft 계정 고유값이 없다 — 첫 로그인 때 회사 이메일로 연결된다.
        creates.push({ ...data, employeeNo: row.employeeNo, ssoSubjectId: `pending:${randomUUID()}` });
      } else if (isChanged(current, data)) {
        updates.push({ id: current.id, data });
      } else {
        unchanged++;
      }
    }

    errors.sort((a, b) => a.row - b.row);
    const result: ImportResult = {
      applied: false,
      total: rows.length,
      created: creates.length,
      updated: updates.length,
      unchanged,
      errors,
    };
    if (dryRun || errors.length > 0 || (creates.length === 0 && updates.length === 0)) {
      return result;
    }

    await this.prisma.$transaction([
      ...updates.map((u) => this.prisma.user.update({ where: { id: u.id }, data: u.data })),
      ...creates.map((data) => this.prisma.user.create({ data })),
    ]);
    return { ...result, applied: true };
  }

  private async parse(file: Buffer): Promise<{ rows: RosterRow[]; errors: { row: number; message: string }[] }> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    } catch {
      throw new BadRequestException('엑셀(.xlsx) 파일을 읽을 수 없습니다. 내려받은 양식에 작성해 주세요.');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('엑셀에 시트가 없습니다.');

    const columnOf = new Map<ColumnKey, number>();
    sheet.getRow(1).eachCell((cell, col) => {
      const header = normalizeHeader(cell.text ?? '');
      const match = COLUMNS.find((c) => c.aliases.some((a) => normalizeHeader(a) === header));
      if (match && !columnOf.has(match.key)) columnOf.set(match.key, col);
    });
    const missing = REQUIRED.filter((k) => !columnOf.has(k));
    if (missing.length > 0) {
      const names = missing.map((k) => COLUMNS.find((c) => c.key === k)!.header).join(', ');
      throw new BadRequestException(`첫 줄 머리글에서 다음 열을 찾지 못했습니다: ${names}`);
    }
    if (sheet.rowCount - 1 > MAX_ROWS) {
      throw new BadRequestException(`한 번에 ${MAX_ROWS}명까지 올릴 수 있습니다.`);
    }

    const rows: RosterRow[] = [];
    const errors: { row: number; message: string }[] = [];
    const seenEmployeeNo = new Map<string, number>();
    const seenEmail = new Map<string, number>();

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const get = (k: ColumnKey) => {
        const col = columnOf.get(k);
        return col ? (row.getCell(col).text ?? '').trim() : '';
      };
      const raw = Object.fromEntries(COLUMNS.map((c) => [c.key, get(c.key)])) as Record<ColumnKey, string>;
      if (Object.values(raw).every((v) => v === '')) continue; // 빈 줄은 건너뛴다

      const problems: string[] = [];
      for (const k of REQUIRED) {
        if (!raw[k]) problems.push(`${COLUMNS.find((c) => c.key === k)!.header}이(가) 비어 있습니다`);
      }
      const email = raw.email.toLowerCase();
      if (raw.employeeNo && !EMPLOYEE_NO.test(raw.employeeNo)) problems.push('사번은 영문·숫자·-·_ 30자 이내여야 합니다');
      if (raw.name.length > 50 || raw.department.length > 50) problems.push('이름·부서는 50자 이내여야 합니다');
      if (email && !EMAIL.test(email)) problems.push(`회사 이메일 형식이 아닙니다(${raw.email})`);
      if (raw.phone && !PHONE.test(raw.phone)) problems.push(`휴대폰 번호 형식이 아닙니다(${raw.phone})`);
      const isPartner = parseFlag(raw.isPartner);
      const isAdmin = parseFlag(raw.isAdmin);
      if (isPartner === null) problems.push(`파트너 여부는 Y 또는 N으로 적어주세요(${raw.isPartner})`);
      if (isAdmin === null) problems.push(`관리자 여부는 Y 또는 N으로 적어주세요(${raw.isAdmin})`);

      const dupNo = raw.employeeNo && seenEmployeeNo.get(raw.employeeNo);
      if (dupNo) problems.push(`사번 ${raw.employeeNo}이(가) ${dupNo}행과 중복됩니다`);
      const dupEmail = email && seenEmail.get(email);
      if (dupEmail) problems.push(`회사 이메일이 ${dupEmail}행과 중복됩니다`);
      if (raw.employeeNo) seenEmployeeNo.set(raw.employeeNo, r);
      if (email) seenEmail.set(email, r);

      if (problems.length > 0) {
        errors.push({ row: r, message: problems.join(', ') });
        continue;
      }
      rows.push({
        rowNumber: r,
        employeeNo: raw.employeeNo,
        name: raw.name,
        department: raw.department,
        email,
        phone: raw.phone || null,
        isPartner: isPartner ?? false,
        isAdmin: isAdmin ?? undefined,
      });
    }
    return { rows, errors };
  }
}

// 빈 칸은 undefined(값 없음), 알아볼 수 없는 값은 null(오류).
function parseFlag(value: string): boolean | undefined | null {
  if (value === '') return undefined;
  const v = value.trim().toLowerCase();
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  return null;
}

function isChanged(
  current: User,
  next: { name: string; department: string; email: string; phone: string | null; isPartner: boolean; role: string },
) {
  return (
    current.name !== next.name ||
    current.department !== next.department ||
    current.email.toLowerCase() !== next.email ||
    (current.phone ?? null) !== next.phone ||
    current.isPartner !== next.isPartner ||
    current.role !== next.role
  );
}
