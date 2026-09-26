import { HttpException, HttpStatus } from '@nestjs/common';

// Carries { code, message } straight through to the { error: {...} } envelope.
export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ code, message }, status);
  }
}

export class PreApprovalAttachmentRequiredException extends ApiException {
  constructor(message: string) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'PRE_APPROVAL_ATTACHMENT_REQUIRED', message);
  }
}

export class InvalidStatusTransitionException extends ApiException {
  constructor(message: string) {
    super(HttpStatus.CONFLICT, 'INVALID_STATUS_TRANSITION', message);
  }
}

export class NotFoundApiException extends ApiException {
  constructor(message = '요청한 리소스를 찾을 수 없습니다.') {
    super(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);
  }
}

export class ForbiddenApiException extends ApiException {
  constructor(message = '이 작업을 수행할 권한이 없습니다.') {
    super(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
  }
}

export class UnauthorizedApiException extends ApiException {
  constructor(message = '인증이 필요합니다.') {
    super(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
  }
}
