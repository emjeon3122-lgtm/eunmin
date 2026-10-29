import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('ribbon-templates')
@UseGuards(JwtAuthGuard)
export class RibbonTemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.ribbonTemplate.findMany({
      where: { isActive: true },
      orderBy: { occasionType: 'asc' },
    });
  }
}
