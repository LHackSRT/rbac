import { Global, Module } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { AuthzController } from './authz.controller';

@Global()
@Module({
  controllers: [AuthzController],
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
