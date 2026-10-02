# 사내 경조사 화환 자동 발송 앱 — 2단계: 핵심 API 엔드포인트 명세

> 1단계에서 확정된 전제를 기준으로 설계했습니다: 관리자 사전 승인 없음(즉시 꽃집 전달) / 규칙 기반 사전승인 증빙 필수 / 꽃집 연동은 카카오 친구톡 / 관리자는 사후 취소만 가능

---

## 1. 공통 규칙

- **인증**: 회사 SSO 로그인 후 발급되는 Bearer JWT를 모든 요청의 `Authorization` 헤더에 포함합니다. (`Authorization: Bearer {token}`)
- **권한**: `employee`(일반 임직원)와 `admin`(총무/HR) 두 역할로 구분합니다. `/api/admin/*` 경로는 `admin` 역할만 접근 가능합니다.
- **응답 포맷**: 성공 시 `{ data: ... }`, 실패 시 `{ error: { code, message } }` 형태로 통일합니다.
- **페이지네이션**: 목록 조회는 `page`, `size` 쿼리 파라미터를 쓰고, 응답에 `{ data: [...], meta: { total, page, size } }`를 포함합니다.
- **웹훅 엔드포인트**(`/api/webhooks/*`)는 JWT 대신 별도의 서명 검증(HMAC) 또는 CPaaS가 제공하는 IP 화이트리스트로 인증합니다.

---

## 2. 엔드포인트 전체 목록

| 구분 | Method | Path | 권한 | 설명 |
|---|---|---|---|---|
| 인증 | POST | `/api/auth/sso/callback` | 공개 | SSO 인가 코드 교환 → JWT 발급 |
| 인증 | GET | `/api/auth/me` | employee | 현재 로그인 사용자 정보 |
| 신청 | POST | `/api/wreath-requests` | employee | 화환 신청서 제출 (즉시 꽃집 전달 트리거) |
| 신청 | GET | `/api/wreath-requests` | employee | 내 신청 목록 조회 |
| 신청 | GET | `/api/wreath-requests/{id}` | employee | 신청 상세 조회 (상태 포함) |
| 신청 | POST | `/api/wreath-requests/{id}/cancel` | employee | 신청자 자진 취소 (꽃집 전달 전 `status=submitted`일 때만 허용) |
| 꽃집 상태 | GET | `/api/vendor-status/{token}` | 토큰 검증 (로그인 불필요) | 꽃집이 접속하는 원터치 링크 — 주문 요약과 지금 누를 수 있는 다음 액션 반환 |
| 꽃집 상태 | POST | `/api/vendor-status/{token}/accept` | 토큰 검증 | 꽃집의 "접수 확인" 클릭 → `status=accepted` |
| 꽃집 상태 | POST | `/api/vendor-status/{token}/complete` | 토큰 검증 | 꽃집의 배송완료 사진 업로드 + "완료" 클릭 → `status=completed` |
| 첨부 | POST | `/api/attachments` | employee | 사전승인 증빙 파일 업로드 → attachment_id 발급 |
| 정책 조회 | GET | `/api/approval-rules/check` | employee | 입력한 유형/금액 기준 사전승인 필요 여부 미리 확인 |
| 참고 데이터 | GET | `/api/products` | employee | 꽃집 상품 목록 |
| 참고 데이터 | GET | `/api/ribbon-templates` | employee | 경조사어(리본 문구) 템플릿 목록 |
| 관리자 | GET | `/api/admin/wreath-requests` | admin | 전체 신청 조회 (필터/검색) |
| 관리자 | POST | `/api/admin/wreath-requests/{id}/cancel` | admin | 신청 사후 취소 |
| 관리자 | PATCH | `/api/admin/wreath-requests/{id}/delivery-status` | admin | 꽃집이 링크를 안 눌렀을 때의 수동 대체 처리 (전화 확인 후 accepted/completed로 변경) |
| 관리자 | GET | `/api/admin/export` | admin | 이력/정산 데이터 **엑셀(xlsx) 추출 (필수)** |
| 관리자 | GET/PUT | `/api/admin/vendors/{id}` | admin | 꽃집 연동 정보 조회/수정 |
| 관리자 | GET/PUT | `/api/admin/approval-rules` | admin | 사전승인 판정 규칙(임계값) 조회/수정 |
| 웹훅 | POST | `/api/webhooks/kakao-transmission` | 서명 검증 | 친구톡 대행사의 발송 결과 콜백 수신 |

---

## 3. 핵심 엔드포인트 상세

### 3-1. `POST /api/wreath-requests` — 신청서 제출

가장 핵심적인 엔드포인트입니다. 요청을 받으면 서버가 다음을 한 트랜잭션 안에서 처리합니다.

1. `approval_rules`를 조회해 `occasion_type` + `declared_amount` 기준으로 `requires_pre_approval` 여부를 판정
2. `requires_pre_approval = true`인데 `attachment_id`가 없으면 즉시 `422`로 거부 (꽃집으로 아예 전달되지 않음)
3. 통과하면 `wreath_requests` row를 `status=submitted`로 생성하고, 같은 트랜잭션 커밋 후 **비동기로** Vendor Adapter(카카오 친구톡)를 호출
4. Vendor Adapter 호출 결과에 따라 `status`를 `submitted_to_vendor`로, 실패 시 관리자 긴급 알림을 발생시키고 상태는 `submitted`로 유지 (재시도 대상)

**Request**

```json
POST /api/wreath-requests
{
  "requestType": "self",              // self | colleague | vendor_partner
  "occasionType": "wedding",           // wedding | funeral | opening | etc
  "recipientName": "홍길동",
  "recipientPhone": "010-1234-5678",
  "venueName": "OO웨딩홀",
  "deliveryAddress": "서울시 강남구 ... 3층 그랜드홀",
  "deliveryDetail": "3층 그랜드홀",
  "desiredArrivalAt": "2026-09-05T09:00:00+09:00",
  "productId": "uuid",
  "declaredAmount": 150000,
  "ribbonMessage": "祝 結婚",
  "ribbonSenderText": "경영지원팀 김철수",
  "memo": "화환은 홀 입구 쪽으로 배치 부탁드립니다.",
  "attachmentId": null                 // requires_pre_approval=true인 경우 필수
}
```

**Response — 성공 (201)**

```json
{
  "data": {
    "id": "uuid",
    "status": "submitted",
    "requiresPreApproval": false,
    "createdAt": "2026-08-26T10:00:00+09:00"
  }
}
```

**Response — 증빙 누락 (422)**

```json
{
  "error": {
    "code": "PRE_APPROVAL_ATTACHMENT_REQUIRED",
    "message": "결혼(300,000원 이상) 유형은 본부장 사전승인 증빙 첨부가 필요합니다."
  }
}
```

### 3-2. `GET /api/approval-rules/check` — 사전승인 필요 여부 미리 확인

신청 폼에서 사용자가 경조사 유형과 예상 금액을 입력하는 즉시(제출 전에) 증빙 첨부 UI를 보여줄지 판단하기 위한 조회용 엔드포인트입니다. 실제 최종 판정은 3-1의 제출 시점에 서버가 다시 수행합니다(폼 입력값을 신뢰하지 않고 서버가 항상 재검증).

```
GET /api/approval-rules/check?occasionType=wedding&declaredAmount=500000

Response 200
{ "data": { "requiresPreApproval": true, "matchedRule": { "occasionType": "wedding", "minAmount": 300000 } } }
```

### 3-3. `POST /api/attachments` — 증빙 파일 업로드

`multipart/form-data`로 파일을 업로드하고 `attachment_id`를 돌려받습니다. 이 id를 3-1의 `attachmentId` 필드에 넣어 제출합니다. 아직 `request_id`에 연결되지 않은 상태로 존재하다가, 신청서 제출 시점에 서버가 매핑합니다.

```
POST /api/attachments (multipart/form-data, field: file)

Response 201
{ "data": { "attachmentId": "uuid", "fileName": "본부장승인_20260826.pdf" } }
```

### 3-4. `GET /api/wreath-requests/{id}` — 상세 조회 (상태 추적)

신청자가 "신청 완료 → 꽃집 접수 → 배송완료" 상태를 확인하는 화면에서 사용합니다. `accepted`와 `completed` 사이에 시스템이 아는 별도 상태는 없으므로, 프론트엔드는 `accepted`인데 아직 `completed`가 아니면 "배송 준비/진행 중"으로 자연스럽게 보여줍니다.

```json
{
  "data": {
    "id": "uuid",
    "status": "submitted_to_vendor",
    "occasionType": "wedding",
    "desiredArrivalAt": "2026-09-05T09:00:00+09:00",
    "vendorTransmission": { "status": "sent", "attemptedAt": "2026-08-26T10:00:05+09:00" },
    "acceptedAt": null,
    "completedAt": null,
    "completionPhotoUrl": null,
    "cancelledReason": null,
    "createdAt": "2026-08-26T10:00:00+09:00"
  }
}
```

### 3-5. `GET /api/vendor-status/{token}` · `POST .../accept` · `POST .../complete` — 꽃집 원터치 상태 처리

로그인 없이, 친구톡 메시지 속 링크 하나로 꽃집이 직접 상태를 갱신하는 엔드포인트 묶음입니다. `token`은 `wreath_requests.vendor_status_token`과 매칭되며, 이 값 자체가 "이 링크는 몇 번 주문 건에 대한 것이다"를 증명하는 역할을 합니다 — 그래서 배송완료 사진을 여기서 올리면 어떤 주문 사진인지 매칭할 필요가 아예 없어집니다.

```
GET /api/vendor-status/{token}

Response 200 (status=submitted_to_vendor인 경우)
{
  "data": {
    "occasionType": "wedding",
    "venueName": "OO웨딩홀",
    "desiredArrivalAt": "2026-09-05T09:00:00+09:00",
    "ribbonMessage": "祝 結婚",
    "status": "submitted_to_vendor",
    "nextAction": "accept"        // 지금 누를 수 있는 버튼: 접수 확인
  }
}
```

```
POST /api/vendor-status/{token}/accept

Response 200
{ "data": { "status": "accepted", "nextAction": "complete" } }   // 다음엔 완료 버튼만 노출
```

```
POST /api/vendor-status/{token}/complete (multipart/form-data, field: photo)

Response 200
{ "data": { "status": "completed", "completedAt": "2026-09-05T11:20:00+09:00" } }
```

서버는 항상 `status`에 맞는 `nextAction`만 반환하므로, 이미 `accepted`인 건에 다시 `/accept`를 호출하거나 `completed`인 건에 `/complete`를 호출하면 `409 INVALID_STATUS_TRANSITION`으로 막습니다. `completed` 처리 후에는 토큰을 만료시켜(재사용 방지) 이후 접속 시 "이미 완료된 주문입니다"라는 읽기 전용 화면만 보여줍니다.

### 3-6. `POST /api/wreath-requests/{id}/cancel` — 신청자 자진 취소

직원이 잘못 제출했거나 마음이 바뀐 경우 스스로 취소할 수 있는 엔드포인트입니다. **`status`가 `submitted`일 때만 허용**하고, 이미 `submitted_to_vendor`로 넘어가 꽃집에 전달된 이후에는 취소할 수 없습니다 — 꽃집에 이미 전달된 주문을 직원이 취소하면 실제 화환 준비와 시스템 상태가 어긋나 혼선이 생길 수 있기 때문입니다. 이 시점 이후에는 총무/HR(관리자)에게 요청해 3-8의 관리자 사후 취소로만 처리합니다.

```
POST /api/wreath-requests/{id}/cancel (본인 신청만 가능)

Response 200 — status=submitted였던 경우
{ "data": { "id": "uuid", "status": "cancelled", "cancelledAt": "2026-08-26T10:00:03+09:00" } }

Response 409 — status가 submitted_to_vendor 이상으로 넘어간 경우
{ "error": { "code": "INVALID_STATUS_TRANSITION", "message": "이미 꽃집에 전달된 신청은 직접 취소할 수 없습니다. 관리자에게 문의해주세요." } }
```

> 실무적으로 `submitted → submitted_to_vendor` 전환은 Vendor Adapter 호출 성공과 거의 동시에 일어나므로, 취소 가능한 시간은 보통 몇 초~수 분 이내로 매우 짧습니다. 프론트엔드에서는 "제출 후 즉시 취소" 버튼 정도로 안내하는 게 자연스럽습니다.

### 3-7. `PATCH /api/admin/wreath-requests/{id}/delivery-status` — 관리자 수동 대체 처리

꽃집이 원터치 링크를 누르지 않는 경우(예: 링크를 못 봤거나 스마트폰 사용이 어려운 경우)를 위한 안전망입니다. 총무/HR이 전화로 확인한 뒤, 사진 없이도 강제로 `accepted`나 `completed`로 바꿀 수 있습니다. 다만 이 경로로 완료 처리하면 배송완료 사진 없이 완료되므로, 화면에는 "사진 없음(관리자 수동 처리)"로 별도 표기합니다.

```json
PATCH /api/admin/wreath-requests/{id}/delivery-status
{ "status": "completed", "note": "꽃집 전화 확인 후 수동 완료 처리 (사진 미확보)" }

Response 200
{ "data": { "id": "uuid", "status": "completed", "completedAt": "2026-08-26T15:00:00+09:00" } }
```

### 3-8. `POST /api/admin/wreath-requests/{id}/cancel` — 관리자 사후 취소

승인 게이트가 없어진 대신 관리자가 문제를 발견했을 때 개입하는 유일한 통로입니다. `completed` 상태에는 취소할 수 없습니다(이미 배송 완료).

```json
POST /api/admin/wreath-requests/{id}/cancel
{ "reason": "증빙 서류 확인 결과 결재선이 맞지 않아 취소 처리" }

Response 200
{ "data": { "id": "uuid", "status": "cancelled", "cancelledAt": "2026-08-26T11:00:00+09:00" } }
```

이 처리 결과는 `notifications` 테이블을 통해 신청자에게도 자동 통보됩니다.

### 3-9. `POST /api/webhooks/kakao-transmission` — 친구톡 발송 결과 콜백

CPaaS 대행사가 친구톡 발송 성공/실패 결과를 비동기로 알려주는 콜백입니다. `provider_message_id`로 `order_transmissions` 레코드를 찾아 갱신하고, 실패인 경우 관리자에게 긴급 알림을 생성합니다.

```json
POST /api/webhooks/kakao-transmission
{
  "providerMessageId": "cpaas-msg-abc123",
  "status": "failed",
  "reason": "CHANNEL_BLOCKED",
  "occurredAt": "2026-08-26T10:00:10+09:00"
}
```

서버 처리: `order_transmissions.status = failed` 업데이트 → `wreath_requests.status`는 `submitted`로 유지(꽃집에 실제로 전달되지 않았으므로) → 관리자에게 `manual_admin_alert` 알림 생성.

### 3-10. `GET /api/admin/export` — 이력/정산 데이터 엑셀 추출 (필수)

관리자 화면에서 반드시 엑셀(.xlsx) 파일로 내려받을 수 있어야 합니다. CSV가 아니라 엑셀이 필수인 이유는 보통 정산 시 병합/서식(부서별 합계 등)이 들어간 형태로 바로 쓰기 때문으로 이해했습니다 — 이 부분은 4단계 백엔드 구현 시 ExcelJS(Node) 또는 openpyxl(Python) 같은 라이브러리로 실제 서식을 갖춘 .xlsx를 생성하도록 반영하겠습니다.

```
GET /api/admin/export?format=xlsx&from=2026-08-01&to=2026-08-31&groupBy=department

Response 200
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="화환발송이력_202608.xlsx"
(바이너리 파일 스트림)
```

기본적으로 다음 컬럼을 포함할 계획입니다: 신청일, 신청자, 부서, 경조사 유형, 대상, 수령인, 배송지, 상품/금액, 사전승인 여부, 상태, 완료일. `groupBy` 파라미터로 부서별/거래처별 집계 시트를 추가로 구성할 수 있습니다. 정확히 어떤 필드를 부서별·거래처별로 집계해야 하는지는 실제 정산 담당자 요구사항에 맞춰 조정이 필요합니다.

---

## 4. 에러 코드 (주요)

| HTTP | code | 상황 |
|---|---|---|
| 401 | `UNAUTHORIZED` | 토큰 없음/만료 |
| 403 | `FORBIDDEN` | 권한 부족 (예: 일반 직원이 `/api/admin/*` 호출) |
| 404 | `NOT_FOUND` | 존재하지 않는 신청/첨부 |
| 422 | `PRE_APPROVAL_ATTACHMENT_REQUIRED` | 사전승인 증빙 누락 |
| 409 | `INVALID_STATUS_TRANSITION` | 예: 이미 `completed`인 신청을 취소 시도 |

---

## 5. 확인 필요 사항

1. **웹훅 재시도/중복 처리**: CPaaS가 같은 콜백을 중복 전송할 가능성에 대비해 `provider_message_id` 기준 idempotency 처리가 필요합니다. (개발팀이 구현 시 챙길 기술적 사항으로, 결정이 필요한 부분은 아닙니다)
2. **정산 집계의 세부 항목**: 엑셀 추출은 확정되었으니, `groupBy=department`/`groupBy=vendor` 시트에 정확히 어떤 항목(예: 부서별 총 발송 건수만인지, 금액 합계까지인지)을 넣을지는 실제 정산 담당자와 맞춰 4단계 이후 구체화하면 됩니다.
3. **`vendor-status` 토큰 만료/보안 정책**: 토큰 길이, `completed` 이후 만료 처리, 만료된 링크에 접속했을 때의 화면 문구 등 세부 정책은 4단계에서 구체적인 생성·검증 로직과 함께 정리합니다.

---

*다음 단계: 3단계 — 프론트엔드 핵심 UI/UX 와이어프레임 구조 및 폼 컴포넌트 예시 코드*
