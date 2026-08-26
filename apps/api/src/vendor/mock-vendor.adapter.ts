import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VendorAdapter, VendorMessagePayload } from './vendor-adapter.interface';

// Used when VENDOR_ADAPTER=mock (no CPaaS contract signed yet, see docs/01 section 3-2).
// Logs the message instead of calling a real API and always "succeeds".
@Injectable()
export class MockVendorAdapter implements VendorAdapter {
  private readonly logger = new Logger(MockVendorAdapter.name);

  async send(payload: VendorMessagePayload): Promise<{ providerMessageId: string }> {
    this.logger.log(
      `[MOCK 친구톡 발송] requestId=${payload.requestId} to=${payload.recipientPhone} ` +
        `링크=${payload.statusLinkUrl} 리본="${payload.ribbonMessage} / ${payload.ribbonSenderText}"`,
    );
    return { providerMessageId: `mock-${randomUUID()}` };
  }
}
