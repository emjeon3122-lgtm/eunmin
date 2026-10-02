import { Body, Controller, Get, Put } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalRulesUpdateDto } from './dto/approval-rules-update.dto';

@Controller('admin/approval-rules')
@AdminGuard()
export class AdminApprovalRulesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.approvalRule.findMany({ orderBy: [{ occasionType: 'asc' }, { minAmount: 'asc' }] });
  }

  // PUT /api/admin/approval-rules — batch update (see dto docstring for the
  // best-effort interpretation of this path having no {id}).
  @Put()
  async update(@Body() dto: ApprovalRulesUpdateDto) {
    await this.prisma.$transaction(
      dto.rules.map((rule) =>
        this.prisma.approvalRule.update({
          where: { id: rule.id },
          data: {
            ...(rule.minAmount !== undefined ? { minAmount: rule.minAmount } : {}),
            ...(rule.isActive !== undefined ? { isActive: rule.isActive } : {}),
            ...(rule.description !== undefined ? { description: rule.description } : {}),
          },
        }),
      ),
    );
    return this.prisma.approvalRule.findMany({ orderBy: [{ occasionType: 'asc' }, { minAmount: 'asc' }] });
  }
}
