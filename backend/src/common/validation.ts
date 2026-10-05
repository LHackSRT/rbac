import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppError, ErrorCode } from './errors';

function flatten(errors: ValidationError[], parent = ''): { field: string; errors: string[] }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, errors: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, 'Invalid request', flatten(errors)),
  });
}
