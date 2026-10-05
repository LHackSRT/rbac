import { Module } from '@nestjs/common';
import { ParametersController, ReportsController, SamplesController, SamplingPointsController } from './lab.controllers';
import { ParametersService } from './parameters.service';
import { ReportsService } from './reports.service';
import { SamplesService } from './samples.service';
import { SamplingPointsService } from './sampling-points.service';

@Module({
  controllers: [SamplingPointsController, ParametersController, SamplesController, ReportsController],
  providers: [SamplingPointsService, ParametersService, SamplesService, ReportsService],
})
export class LabModule {}
