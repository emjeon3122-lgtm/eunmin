# 사내 경조사 화환 자동 발송 앱 — 4단계: 꽃집 연동 백엔드 로직 샘플 코드

> 1~3단계 전제 반영: 꽃집 전달은 카카오 친구톡(원터치 링크 버튼 포함) / 링크에서 꽃집이 직접 접수·완료(사진첨부) 처리 / 관리자는 링크 미클릭 시에만 수동 대체 처리 / NestJS 스타일 예시(FastAPI를 쓰더라도 구조는 동일)

> 아래 코드는 구조를 보여주기 위한 예시입니다. `KakaoFriendTalkAdapter`의 실제 요청/응답 필드명은 **선정한 CPaaS 대행사(비즈엠/Solapi/NHN Cloud 등)의 공식 API 문서**에 맞춰 반드시 교체해야 합니다 — 여기서는 존재하지 않는 임의의 엔드포인트/필드명을 예시로만 사용했습니다.

---

## 1. 전체 구성

```
신청 생성(status=submitted)
  └─ vendorStatusToken 발급
  └─ (비동기) send-to-vendor 작업 큐 등록
       └─ KakaoFriendTalkAdapter.send() → CPaaS API 호출 (원터치 링크 버튼 포함)
            ├─ 성공 → status=submitted_to_vendor
            └─ 실패 → 관리자 긴급 알림, status는 submitted 유지(재시도 대상)
  └─ CPaaS 발송결과 웹훅 → order_transmissions 갱신 (비동기 확정)

꽃집이 원터치 링크(/vendor/status/{token}) 접속
  ├─ POST .../accept   → status=accepted
  └─ POST .../complete (사진 업로드) → status=completed, 토큰 만료

꽃집이 링크를 누르지 않는 경우
  └─ 관리자가 PATCH /admin/wreath-requests/{id}/delivery-status 로 수동 대체 처리
```

---

## 2. Vendor Adapter — 카카오 친구톡 발송

### 2-1. 인터페이스 (교체 가능하게 분리)

```ts
// vendor/vendor-adapter.interface.ts
export interface VendorMessagePayload {
  requestId: string;
  recipientPhone: string;       // vendor.contactPhone (꽃집 사장님 번호)
  occasionType: string;
  venueName: string;
  deliveryAddress: string;
  desiredArrivalAt: string;
  ribbonMessage: string;
  ribbonSenderText: string;
  statusLinkUrl: string;        // https://app.bdo.kr/vendor/status/{token}
}

export interface VendorAdapter {
  send(payload: VendorMessagePayload): Promise<{ providerMessageId: string }>;
}

export class VendorTransmissionError extends Error {}
```

### 2-2. 카카오 친구톡 구현체 (예시)

```ts
// vendor/kakao-friendtalk.adapter.ts
import { VendorAdapter, VendorMessagePayload, VendorTransmissionError } from "./vendor-adapter.interface";

export class KakaoFriendTalkAdapter implements VendorAdapter {
  constructor(
    private readonly apiKey: string,      // CPaaS 발급 API 키
    private readonly senderKey: string,   // 카카오 채널 발신 프로필 키
    private readonly apiBaseUrl: string,  // 대행사 API 베이스 URL
  ) {}

  async send(payload: VendorMessagePayload): Promise<{ providerMessageId: string }> {
    const res = await fetch(`${this.apiBaseUrl}/friendtalk/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        senderKey: this.senderKey,
        to: payload.recipientPhone,
        content: this.buildMessageText(payload),
        buttons: [
          { name: "주문 확인하기", type: "WL", url: payload.statusLinkUrl }, // WL = 웹링크 버튼
        ],
      }),
    });

    if (!res.ok) {
      throw new VendorTransmissionError(`전송 실패 (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    return { providerMessageId: json.messageId };
  }

  private buildMessageText(p: VendorMessagePayload): string {
    return [
      "[화환 주문 안내]",
      `유형: ${occasionLabel(p.occasionType)}`,
      `장소: ${p.venueName}`,
      `배송지: ${p.deliveryAddress}`,
      `도착 희망: ${p.desiredArrivalAt}`,
      `리본 문구: ${p.ribbonMessage} / ${p.ribbonSenderText}`,
      "",
      "아래 버튼을 눌러 접수 확인 및 배송완료 처리를 해주세요.",
    ].join("\n");
  }
}

function occasionLabel(type: string) {
  return { wedding: "결혼", funeral: "부고", opening: "개업", etc: "기타" }[type] ?? type;
}
```

---

## 3. 신청 생성 시 토큰 발급 & 발송 트리거

```ts
// wreath-requests/wreath-request.service.ts (일부)
import { randomBytes } from "crypto";

function generateVendorStatusToken(): string {
  return randomBytes(32).toString("base64url"); // 추측 불가능한 43자 URL-safe 문자열
}

export async function createWreathRequest(input: CreateWreathRequestDto, requesterId: string) {
  const rule = await approvalRuleService.check(input.occasionType, input.declaredAmount);
  if (rule.requiresPreApproval && !input.attachmentId) {
    throw new UnprocessableEntityException({
      code: "PRE_APPROVAL_ATTACHMENT_REQUIRED",
      message: `${occasionLabel(input.occasionType)} 유형은 본부장 사전승인 증빙 첨부가 필요합니다.`,
    });
  }

  const request = await db.wreathRequest.create({
    data: {
      ...input,
      requesterId,
      requiresPreApproval: rule.requiresPreApproval,
      status: "submitted",
      vendorStatusToken: generateVendorStatusToken(),
    },
  });

  // 응답을 막지 않기 위해 비동기 큐에 등록 (동기 처리해도 되지만, 대행사 API 지연에 사용자가 기다리지 않도록)
  await jobQueue.enqueue("send-to-vendor", { requestId: request.id });

  return request;
}
```

---

## 4. 발송 워커: Vendor Adapter 호출 + 전송 로그 기록

```ts
// jobs/send-to-vendor.job.ts
export async function handleSendToVendor({ requestId }: { requestId: string }) {
  const request = await db.wreathRequest.findUniqueOrThrow({ where: { id: requestId } });
  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: request.vendorId } });
  const statusLinkUrl = `${config.appBaseUrl}/vendor/status/${request.vendorStatusToken}`;

  const transmission = await db.orderTransmission.create({
    data: { requestId, channel: "kakao_friendtalk", status: "pending", payload: { statusLinkUrl } },
  });

  try {
    const { providerMessageId } = await vendorAdapter.send({
      requestId,
      recipientPhone: vendor.contactPhone,
      occasionType: request.occasionType,
      venueName: request.venueName,
      deliveryAddress: request.deliveryAddress,
      desiredArrivalAt: request.desiredArrivalAt,
      ribbonMessage: request.ribbonMessage,
      ribbonSenderText: request.ribbonSenderText,
      statusLinkUrl,
    });

    await db.orderTransmission.update({
      where: { id: transmission.id },
      data: { status: "sent", providerMessageId },
    });
    await db.wreathRequest.update({
      where: { id: requestId },
      data: { status: "submitted_to_vendor" },
    });
  } catch (err) {
    await db.orderTransmission.update({
      where: { id: transmission.id },
      data: { status: "failed", responseBody: String(err) },
    });
    await notifyAdmin({
      requestId,
      message: `[긴급] ${vendor.name}에게 친구톡 발송 실패. 직접 전화·문자로 전달해주세요.`,
    });
    // status는 submitted로 유지. 재시도 큐에 다시 넣을지, 관리자 수동 처리에만 맡길지는 6장 참고.
  }
}
```

---

## 5. 발송 결과 웹훅 (CPaaS → 우리 서버, 비동기 확정)

친구톡은 API 호출 응답이 "접수됨"일 뿐 실제 전달 성공/실패는 나중에 콜백으로 오는 경우가 많습니다. 이 콜백으로 `order_transmissions`를 최종 확정합니다.

```ts
// controllers/kakao-webhook.controller.ts
@Post("webhooks/kakao-transmission")
async handleKakaoWebhook(
  @Body() body: KakaoTransmissionCallbackDto,
  @Headers("x-signature") signature: string,
) {
  verifyHmacSignature(body, signature, config.cpaasWebhookSecret); // 위조된 요청 차단

  const transmission = await db.orderTransmission.findUnique({
    where: { providerMessageId: body.providerMessageId },
  });
  if (!transmission) return { received: true }; // 모르는 콜백은 조용히 무시(멱등)

  if (body.status === "failed") {
    await db.orderTransmission.update({
      where: { id: transmission.id },
      data: { status: "failed", responseBody: body.reason },
    });
    await notifyAdmin({
      requestId: transmission.requestId,
      message: `친구톡 발송 실패(${body.reason}) — 수동 연락이 필요합니다.`,
    });
  } else {
    await db.orderTransmission.update({ where: { id: transmission.id }, data: { status: "acked" } });
  }
  return { received: true };
}
```

---

## 6. 원터치 상태 페이지 백엔드 (꽃집용, 로그인 없음)

```ts
// vendor-status/vendor-status.controller.ts
@Controller("api/vendor-status")
export class VendorStatusController {
  @Get(":token")
  async getStatus(@Param("token") token: string) {
    const request = await this.loadByToken(token);
    return {
      data: {
        occasionType: request.occasionType,
        venueName: request.venueName,
        desiredArrivalAt: request.desiredArrivalAt,
        ribbonMessage: request.ribbonMessage,
        status: request.status,
        nextAction: this.nextActionFor(request.status),
      },
    };
  }

  @Post(":token/accept")
  async accept(@Param("token") token: string) {
    const request = await this.loadByToken(token);
    this.assertTransition(request.status, "submitted_to_vendor", "accept");

    const updated = await db.wreathRequest.update({
      where: { id: request.id },
      data: { status: "accepted", acceptedAt: new Date() },
    });
    await notifyRequester(request.requesterId, "꽃집에서 화환 주문을 접수했습니다.");
    return { data: { status: updated.status, nextAction: "complete" } };
  }

  @Post(":token/complete")
  @UseInterceptors(FileInterceptor("photo"))
  async complete(@Param("token") token: string, @UploadedFile() photo?: Express.Multer.File) {
    const request = await this.loadByToken(token);
    this.assertTransition(request.status, "accepted", "complete");
    if (!photo) throw new BadRequestException("배송완료 사진을 첨부해주세요.");

    const attachment = await db.attachment.create({
      data: {
        requestId: request.id,
        fileName: photo.originalname,
        fileUrl: await storage.upload(photo), // 로컬 디스크가 아닌 S3 등 오브젝트 스토리지 권장
        mimeType: photo.mimetype,
        type: "delivery_completion_photo",
        uploaderType: "vendor",
      },
    });

    const updated = await db.wreathRequest.update({
      where: { id: request.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        completionPhotoId: attachment.id,
        vendorStatusToken: null, // 완료 즉시 토큰 만료 → 링크 재사용/재접근 방지
      },
    });
    await notifyRequester(request.requesterId, "화환 배송이 완료되었습니다.");
    return { data: { status: updated.status, completedAt: updated.completedAt } };
  }

  private async loadByToken(token: string) {
    const request = await db.wreathRequest.findUnique({ where: { vendorStatusToken: token } });
    if (!request) throw new NotFoundException("만료되었거나 존재하지 않는 링크입니다.");
    return request;
  }

  private nextActionFor(status: string): "accept" | "complete" | null {
    if (status === "submitted_to_vendor") return "accept";
    if (status === "accepted") return "complete";
    return null; // completed, cancelled 등은 더 이상 액션 없음
  }

  private assertTransition(current: string, required: string, action: string) {
    if (current !== required) {
      throw new ConflictException({
        code: "INVALID_STATUS_TRANSITION",
        message: `이미 처리되었거나 아직 처리할 수 없는 단계입니다. (요청: ${action}, 현재 상태: ${current})`,
      });
    }
  }
}
```

`vendorStatusToken`을 완료 시 `null`로 지우기 때문에, 완료된 링크에 다시 접속하면 `loadByToken`이 404를 반환합니다. 프론트엔드(꽃집용 공개 페이지)는 이 404를 "이미 처리된 링크입니다"라는 안내 화면으로 보여주면 됩니다.

---

## 7. 관리자 수동 대체 처리 (꽃집이 링크를 안 눌렀을 때)

```ts
// controllers/admin-wreath-request.controller.ts
@Patch("admin/wreath-requests/:id/delivery-status")
@UseGuards(AdminGuard)
async manualUpdate(
  @Param("id") id: string,
  @Body() body: { status: "accepted" | "completed"; note: string },
) {
  const updated = await db.wreathRequest.update({
    where: { id },
    data: {
      status: body.status,
      ...(body.status === "accepted" ? { acceptedAt: new Date() } : {}),
      ...(body.status === "completed"
        ? { completedAt: new Date(), vendorStatusToken: null }
        : {}),
      adminOverrideNote: body.note, // "사진 없이 관리자가 수동 완료 처리" 등을 구분하기 위한 근거 기록
    },
  });
  await notifyRequester(updated.requesterId, `관리자가 상태를 '${body.status}'로 수동 변경했습니다.`);
  return { data: updated };
}
```

> `wreath_requests`에 `admin_override_note`(text, nullable) 컬럼이 1단계 스키마에 추가로 필요합니다 — 이 문서를 작성하며 발견된 항목이라 1단계 문서에도 반영해두었습니다.

---

## 8. 확인 필요 사항

1. **실제 대행사 API 스펙 반영**: 위 `KakaoFriendTalkAdapter`는 구조를 보여주기 위한 예시이며, 실제 엔드포인트·필드명은 선정한 CPaaS(비즈엠/Solapi/NHN Cloud 등)의 공식 문서를 따라야 합니다.
2. **웹훅 서명 검증 방식**: `verifyHmacSignature`는 대행사가 실제로 제공하는 서명 방식(헤더명, 알고리즘)에 맞춰 구현해야 합니다.
3. **파일 스토리지**: 사전승인 증빙과 배송완료 사진을 어디에 저장할지(S3/오브젝트 스토리지 등)와 접근 권한(비공개 버킷 + 서명된 URL 등) 정책이 필요합니다.
4. **발송 실패 재시도 정책**: 몇 번까지 자동 재시도할지, 이후에는 관리자 알림에만 의존할지 정책이 필요합니다.
5. **완료된 링크 재접속 시 UX**: 완료 후 토큰을 만료시키는 방식으로 예시를 작성했는데, 꽃집이 "이미 보낸 사진을 다시 보고 싶다"는 요구가 생기면 토큰을 유지하되 읽기 전용으로 바꾸는 방식으로 조정할 수 있습니다.

---

이것으로 처음 요청하신 5단계(아키텍처 → DB → API → 프론트엔드 → 백엔드 연동) 개발 가이드가 모두 완성되었습니다.
