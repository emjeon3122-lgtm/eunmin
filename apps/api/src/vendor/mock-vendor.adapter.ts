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
      `[MOCK 알림톡 발송] requestId=${payload.requestId} to(꽃집)=${payload.vendorPhone} ` +
        `수령인=${payload.recipientName}(${payload.recipientPhone}) 주문자=${payload.ordererPhone} ` +
        `배송지="${payload.deliveryAddress} ${payload.deliveryDetail ?? ''}" ` +
        `도착희망=${payload.desiredArrivalAt} 리본="${payload.ribbonMessage} / ${payload.ribbonSenderText}" ` +
        `기타요청="${payload.memo ?? ''}" 링크=${payload.statusLinkUrl}`,
    );
    return { providerMessageId: `mock-${randomUUID()}` };
  }
}
