import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

// Composite decorator for every /api/admin/* route: authenticate, then require role=admin.
export const AdminGuard = () =>
  applyDecorators(Roles(Role.admin), UseGuards(JwtAuthGuard, RolesGuard));
