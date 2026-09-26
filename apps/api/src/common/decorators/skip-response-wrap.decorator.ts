import { SetMetadata } from '@nestjs/common';
import { SKIP_RESPONSE_WRAP } from '../interceptors/response.interceptor';

// Use on handlers that write the response themselves (e.g. binary xlsx stream).
export const SkipResponseWrap = () => SetMetadata(SKIP_RESPONSE_WRAP, true);
