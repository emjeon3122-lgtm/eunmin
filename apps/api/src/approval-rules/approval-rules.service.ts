import { Injectable } from '@nestjs/common';
import { ApprovalRule } from '@prisma/client';
import { OccasionType } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface ApprovalCheckResult {
  requiresPreApproval: boolean;
  matchedRule: { occasionType: string; minAmount: number } | null;
}

@Injectable()
export class ApprovalRulesService {
  constructor(private readonly prisma: PrismaService) {}

  // docs/02-api-spec.md section 3-2: an active rule matching this occasionType
  // (or occasionType='all') whose minAmount <= declaredAmount triggers pre-approval.
  // When several match, the highest minAmount <= declaredAmount is authoritative —
  // it is the strictest rule the amount actually satisfies.
  async check(occasionType: OccasionType, declaredAmount: number): Promise<ApprovalCheckResult> {
    const rules = await this.prisma.approvalRule.findMany({
      where: {
        isActive: true,
        OR: [{ occasionType }, { occasionType: 'all' }],
        minAmount: { lte: declaredAmount },
      },
      orderBy: { minAmount: 'desc' },
    });

    const matched: ApprovalRule | undefined = rules[0];
    if (!matched) {
      return { requiresPreApproval: false, matchedRule: null };
    }
    return {
      requiresPreApproval: true,
      matchedRule: { occasionType: matched.occasionType, minAmount: matched.minAmount },
    };
  }
}
