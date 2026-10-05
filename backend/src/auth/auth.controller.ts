import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { Auth, Public } from '../authorization/decorators';
import { config, REFRESH_COOKIE } from '../config';
import { AuthContext, clientIp } from '../common/request-context';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { IssuedTokens } from './token.service';

const COOKIE_PATH = '/api/auth';

function cookieOptions(expires?: Date): CookieOptions {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: COOKIE_PATH, expires };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /** Returns a short-lived access token; the refresh token is set as an httpOnly cookie. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.login(dto.email, dto.password, clientIp(request));
    return this.sendTokens(response, tokens);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    try {
      const tokens = await this.auth.refresh(request.cookies?.[REFRESH_COOKIE]);
      return this.sendTokens(response, tokens);
    } catch (error) {
      response.clearCookie(REFRESH_COOKIE, cookieOptions());
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[REFRESH_COOKIE], clientIp(request));
    response.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  /** Current user with roles, privileges and effective permissions (with explanations). */
  @ApiBearerAuth()
  @Get('me')
  me(@Auth() auth: AuthContext) {
    return this.users.profile(auth.user.id);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(204)
  changePassword(@Auth() auth: AuthContext, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(auth, dto.currentPassword, dto.newPassword);
  }

  @Public()
  @Get('demo-accounts')
  demoAccounts() {
    return this.auth.demoAccounts();
  }

  private sendTokens(response: Response, tokens: IssuedTokens) {
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(tokens.refreshExpiresAt));
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }
}
