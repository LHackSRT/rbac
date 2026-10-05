import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { P } from '../authorization/catalog';
import { Auth, RequireAnyPermission, RequirePermissions } from '../authorization/decorators';
import type { AuthContext } from '../common/request-context';
import {
  CreateParameterDto,
  CreateSampleDto,
  CreateSamplingPointDto,
  EnterResultsDto,
  ListParametersQuery,
  ListSamplesQuery,
  ListSamplingPointsQuery,
  RejectSampleDto,
  ReportQuery,
  UpdateParameterDto,
  UpdateSampleDto,
  UpdateSamplingPointDto,
} from './dto/lab.dto';
import { ParametersService } from './parameters.service';
import { ReportsService } from './reports.service';
import { SamplesService } from './samples.service';
import { SamplingPointsService } from './sampling-points.service';

@ApiTags('lab: sampling points')
@ApiBearerAuth()
@Controller('sampling-points')
export class SamplingPointsController {
  constructor(private readonly points: SamplingPointsService) {}

  @Get()
  @RequirePermissions(P.SAMPLING_POINT_READ)
  list(@Query() query: ListSamplingPointsQuery) {
    return this.points.list(query.includeInactive);
  }

  @Post()
  @RequirePermissions(P.SAMPLING_POINT_MANAGE)
  create(@Auth() auth: AuthContext, @Body() dto: CreateSamplingPointDto) {
    return this.points.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions(P.SAMPLING_POINT_MANAGE)
  update(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSamplingPointDto) {
    return this.points.update(auth, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(P.SAMPLING_POINT_MANAGE)
  remove(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.points.remove(auth, id);
  }
}

@ApiTags('lab: parameters')
@ApiBearerAuth()
@Controller('parameters')
export class ParametersController {
  constructor(private readonly parameters: ParametersService) {}

  @Get()
  @RequirePermissions(P.PARAMETER_READ)
  list(@Query() query: ListParametersQuery) {
    return this.parameters.list(query.includeInactive);
  }

  @Post()
  @RequirePermissions(P.PARAMETER_MANAGE)
  create(@Auth() auth: AuthContext, @Body() dto: CreateParameterDto) {
    return this.parameters.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions(P.PARAMETER_MANAGE)
  update(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateParameterDto) {
    return this.parameters.update(auth, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(P.PARAMETER_MANAGE)
  remove(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.parameters.remove(auth, id);
  }
}

@ApiTags('lab: samples')
@ApiBearerAuth()
@Controller('samples')
export class SamplesController {
  constructor(private readonly samples: SamplesService) {}

  @Get()
  @RequirePermissions(P.SAMPLE_READ)
  list(@Auth() auth: AuthContext, @Query() query: ListSamplesQuery) {
    return this.samples.list(auth, query);
  }

  @Get(':id')
  @RequirePermissions(P.SAMPLE_READ)
  get(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.samples.get(auth, id);
  }

  @Post()
  @RequirePermissions(P.SAMPLE_CREATE)
  create(@Auth() auth: AuthContext, @Body() dto: CreateSampleDto) {
    return this.samples.create(auth, dto);
  }

  @Patch(':id')
  @RequireAnyPermission(P.SAMPLE_UPDATE_OWN, P.SAMPLE_UPDATE_ANY)
  update(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSampleDto) {
    return this.samples.update(auth, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(P.SAMPLE_DELETE)
  remove(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.samples.remove(auth, id);
  }

  @Put(':id/results')
  @RequirePermissions(P.RESULT_ENTER)
  enterResults(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EnterResultsDto) {
    return this.samples.enterResults(auth, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions(P.RESULT_ENTER)
  submit(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.samples.submit(auth, id);
  }

  @Post(':id/validate')
  @HttpCode(200)
  @RequirePermissions(P.RESULT_VALIDATE)
  validate(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.samples.validate(auth, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(P.RESULT_VALIDATE)
  reject(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectSampleDto) {
    return this.samples.reject(auth, id, dto.reason);
  }
}

@ApiTags('lab: reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions(P.SAMPLE_READ)
  dashboard(@Auth() auth: AuthContext) {
    return this.reports.dashboard(auth);
  }

  @Get('reports/results')
  @RequirePermissions(P.RESULT_READ)
  results(@Query() query: ReportQuery) {
    return this.reports.page(query);
  }

  @Get('reports/results/export')
  @RequirePermissions(P.REPORT_EXPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="resultats-analyses.csv"')
  export(@Auth() auth: AuthContext, @Query() query: ReportQuery) {
    return this.reports.csv(auth, query);
  }
}
