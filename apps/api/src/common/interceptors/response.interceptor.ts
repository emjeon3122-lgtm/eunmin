import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const SKIP_RESPONSE_WRAP = 'skipResponseWrap';

// Wraps every successful handler return in { data: ... } per doc 02 section 1,
// except routes explicitly opted out (xlsx export streams a binary body itself).
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const skip: boolean = Reflect.getMetadata(SKIP_RESPONSE_WRAP, handler) ?? false;
    if (skip) {
      return next.handle();
    }
    return next.handle().pipe(
      map((result) => {
        if (result && typeof result === 'object' && 'data' in result) {
          return result;
        }
        return { data: result };
      }),
    );
  }
}
