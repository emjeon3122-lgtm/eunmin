import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { RequestStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { occasionLabel } from '../common/occasion-label';
import { ExportQueryDto } from './dto/export-query.dto';

const REQUEST_TYPE_LABEL: Record<string, string> = {
  self: '본인',
  existing_client: '고객사(현재 고객)',
  prospective_client: '고객사(잠재 고객)',
};

const CONTRACT_TYPE_LABEL: Record<string, string> = {
  external_audit: '외부감사/공익법인감사',
  voluntary_audit: '임의감사',
  tax: '세무',
  bookkeeping: '기장',
  internal_accounting: '내부회계',
  other_advisory: '기타 자문',
};

const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: '임시저장',
  submitted: '제출됨',
  submitted_to_vendor: '꽃집전달',
  accepted: '접수됨',
  completed: '완료',
  cancelled: '취소',
};

@Injectable()
export class AdminExportService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /api/admin/export — doc 02 section 3-10. Columns are the ones the doc
  // lists; groupBy=department adds a summary sheet (count + amount sum per
  // department) — exact aggregation fields are marked TBD in the doc, so this is
  // a reasonable default that's easy to extend later.
  async buildWorkbook(query: ExportQueryDto): Promise<{ buffer: Buffer; filename: string }> {
    const where: Prisma.WreathRequestWhereInput = {};
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: endOfDay(query.to) } : {}),
      };
    }

    const requests = await this.prisma.wreathRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        requester: { select: { name: true, department: true, employeeNo: true, email: true } },
        product: { select: { name: true, price: true } },
        completionPhotos: { select: { fileUrl: true } },
      },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'wreath-api';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('발송이력');
    sheet.columns = [
      { header: '신청일', key: 'createdAt', width: 20 },
      { header: '신청자', key: 'requesterName', width: 12 },
      { header: '사번', key: 'employeeNo', width: 12 },
      { header: '부서', key: 'department', width: 14 },
      { header: '이메일', key: 'email', width: 22 },
      { header: '경조사 유형', key: 'occasionType', width: 12 },
      { header: '대상', key: 'requestType', width: 10 },
      { header: '수령인', key: 'recipientName', width: 12 },
      { header: '주문자 연락처', key: 'ordererPhone', width: 16 },
      { header: '배송지', key: 'deliveryAddress', width: 32 },
      { header: '상품/금액', key: 'product', width: 24 },
      { header: '리본 문구', key: 'ribbonMessage', width: 24 },
      { header: '고객사명', key: 'clientName', width: 16 },
      { header: '계약구분', key: 'contractType', width: 18 },
      { header: '용역명', key: 'serviceName', width: 20 },
      { header: '발송 사유', key: 'sendReason', width: 28 },
      { header: '비용 코드', key: 'costCode', width: 14 },
      { header: '사전승인 여부', key: 'requiresPreApproval', width: 14 },
      { header: '상태', key: 'status', width: 12 },
      { header: '완료일', key: 'completedAt', width: 20 },
      { header: '배송완료 사진 URL', key: 'completionPhotoUrls', width: 48 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const r of requests) {
      sheet.addRow({
        createdAt: formatDate(r.createdAt),
        requesterName: r.requester.name,
        employeeNo: r.requester.employeeNo,
        department: r.requester.department,
        email: r.requester.email,
        occasionType: occasionLabel(r.occasionType),
        requestType: REQUEST_TYPE_LABEL[r.requestType] ?? r.requestType,
        recipientName: r.recipientName,
        ordererPhone: r.ordererPhone,
        deliveryAddress: r.deliveryAddress,
        product: r.product
          ? `${r.product.name} / ${r.product.price.toLocaleString('ko-KR')}원`
          : r.declaredAmount != null
            ? `${r.declaredAmount.toLocaleString('ko-KR')}원`
            : '',
        ribbonMessage: `${r.ribbonMessage} / ${r.ribbonSenderText}`,
        clientName: r.clientName ?? '',
        contractType: r.contractType ? CONTRACT_TYPE_LABEL[r.contractType] ?? r.contractType : '',
        serviceName: r.serviceName ?? '',
        sendReason: r.sendReason ?? '',
        costCode: r.costCode ?? '',
        requiresPreApproval: r.requiresPreApproval ? 'Y' : 'N',
        status: STATUS_LABEL[r.status] ?? r.status,
        completedAt: r.completedAt ? formatDate(r.completedAt) : '',
        completionPhotoUrls: r.completionPhotos.map((p) => p.fileUrl).join(', '),
      });
    }

    if (query.groupBy === 'department') {
      const summarySheet = workbook.addWorksheet('부서별 집계');
      summarySheet.columns = [
        { header: '부서', key: 'department', width: 16 },
        { header: '신청 건수', key: 'count', width: 12 },
        { header: '금액 합계', key: 'amountSum', width: 16 },
      ];
      summarySheet.getRow(1).font = { bold: true };

      const byDept = new Map<string, { count: number; amountSum: number }>();
      for (const r of requests) {
        const dept = r.requester.department;
        const acc = byDept.get(dept) ?? { count: 0, amountSum: 0 };
        acc.count += 1;
        acc.amountSum += r.declaredAmount ?? 0;
        byDept.set(dept, acc);
      }
      for (const [department, agg] of byDept.entries()) {
        summarySheet.addRow({ department, count: agg.count, amountSum: agg.amountSum });
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = `화환발송이력_${filenameSuffix(query.from)}.xlsx`;
    return { buffer, filename };
  }
}

function formatDate(d: Date): string {
  return d.toISOString();
}

function endOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

function filenameSuffix(from?: string): string {
  const base = from ? new Date(from) : new Date();
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  return `${yyyy}${mm}`;
}
