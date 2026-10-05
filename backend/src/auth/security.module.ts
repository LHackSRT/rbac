import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/** Credential primitives shared by the auth and users modules. */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [PasswordService, TokenService],
  exports: [PasswordService, TokenService, JwtModule],
})
export class SecurityModule {}
