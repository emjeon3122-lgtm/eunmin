import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApprovalRulesService } from './approval-rules.service';
import { CheckApprovalRuleDto } from './dto/check-approval-rule.dto';

@Controller('approval-rules')
@UseGuards(JwtAuthGuard)
export class ApprovalRulesController {
  constructor(private readonly approvalRulesService: ApprovalRulesService) {}

  // GET /api/approval-rules/check?occasionType=wedding&declaredAmount=500000
  // Preview only — the authoritative check is re-run server-side inside
  // POST /api/wreath-requests (client input is never trusted for the real gate).
  @Get('check')
  check(@Query() query: CheckApprovalRuleDto) {
    return this.approvalRulesService.check(query.occasionType, query.declaredAmount);
  }
}
