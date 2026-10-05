import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppError, ErrorCode } from '../common/errors';

export const PASSWORD_POLICY =
  'At least 8 characters, including one lowercase letter, one uppercase letter and one digit';

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  assertStrong(password: string) {
    const strong =
      password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
    if (!strong) {
      throw AppError.badRequest(ErrorCode.WEAK_PASSWORD, 'Password does not meet the policy', {
        policy: PASSWORD_POLICY,
      });
    }
  }
}
