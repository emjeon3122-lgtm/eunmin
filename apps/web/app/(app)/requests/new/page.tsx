"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import { StepIndicator } from "@/components/wizard/StepIndicator";
import { OccasionReferenceImage } from "@/components/wizard/OccasionReferenceImage";
import { InvitationParserBox } from "@/components/wizard/InvitationParserBox";
import {
  CONTRACT_TYPE_LABELS,
  OCCASION_TYPE_LABELS,
  ORCHID_TYPE_LABELS,
  REQUEST_TYPE_LABELS,
  WEDDING_SIDE_LABELS,
  formatDateTime,
} from "@/lib/labels";
import {
  COST_CODE_DEFAULTS,
  DEFAULT_RIBBON_SENDER,
  OPENING_RIBBON_OPTIONS,
  RIBBON_MESSAGE_DEFAULTS,
  SEND_REASON_PLACEHOLDER,
  costCodeDefaultFor,
} from "@/lib/wizard-defaults";
import type { ParsedInvitationFields, Product, User } from "@/lib/types";

const schema = z
  .object({
    requestType: z.enum(["self", "existing_client", "prospective_client"], {
      required_error: "발송 대상을 선택해주세요.",
    }),
    occasionType: z.enum(["wedding", "funeral", "opening", "promotion", "etc"], {
      required_error: "경조사 유형을 선택해주세요.",
    }),
    orchidType: z.enum(["oriental", "western"]).optional(),
    weddingSide: z.enum(["groom", "bride"]).optional(),
    productId: z.string().min(1, "상품을 선택해주세요."),
    declaredAmount: z.coerce.number().positive("금액을 입력해주세요."),

    clientName: z.string().optional(),
    contractType: z
      .enum(["external_audit", "voluntary_audit", "tax", "bookkeeping", "internal_accounting", "other_advisory"])
      .optional(),
    serviceName: z.string().optional(),
    sendReason: z.string().optional(),
    costCode: z.string().optional(),

    recipientName: z.string().min(1, "수령인 이름을 입력해주세요."),
    recipientPhone: z.string().min(9, "연락처를 입력해주세요. (예: 010-1234-5678)"),
    venueName: z.string().min(1, "장소명을 입력해주세요."),
    deliveryAddress: z.string().min(1, "배송 주소를 입력해주세요."),
    deliveryDetail: z.string().min(1, "상세 주소를 입력해주세요."),
    desiredArrivalAt: z.string().min(1, "도착 희망 일시를 선택해주세요."),
    ribbonMessage: z.string().min(1, "경조사어를 입력해주세요."),
    ribbonSenderText: z.string().min(1, "보내는 이를 입력해주세요."),
    ordererPhone: z.string().min(9, "주문자 휴대폰 번호를 입력해주세요."),
    memo: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if ((values.occasionType === "opening" || values.occasionType === "promotion") && !values.orchidType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["orchidType"], message: "동양란/서양란을 선택해주세요." });
    }
    if (values.occasionType === "wedding" && !values.weddingSide) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["weddingSide"], message: "신랑측/신부측을 선택해주세요." });
    }
    if (values.requestType === "existing_client") {
      if (!values.clientName) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clientName"], message: "고객사명을 입력해주세요." });
      if (!values.contractType) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["contractType"], message: "계약구분을 선택해주세요." });
      if (!values.serviceName) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceName"], message: "용역명을 입력해주세요." });
    } else {
      if (!values.sendReason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sendReason"], message: "발송 사유를 입력해주세요." });
      if (!values.costCode) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["costCode"], message: "비용 코드를 입력해주세요." });
    }
  });

type FormValues = z.infer<typeof schema>;

const STEP_FIELDS: Record<number, (keyof FormValues)[]> = {
  2: ["requestType", "occasionType", "orchidType", "productId", "declaredAmount"],
  3: ["clientName", "contractType", "serviceName", "sendReason", "costCode"],
  4: [
    "recipientName",
    "recipientPhone",
    "venueName",
    "deliveryAddress",
    "deliveryDetail",
    "desiredArrivalAt",
    "ribbonMessage",
    "ribbonSenderText",
    "weddingSide",
    "ordererPhone",
  ],
};

export default function NewWreathRequestPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      requestType: "self",
      occasionType: "wedding",
      ribbonMessage: RIBBON_MESSAGE_DEFAULTS.wedding,
      ribbonSenderText: DEFAULT_RIBBON_SENDER,
      costCode: COST_CODE_DEFAULTS.self,
    },
  });

  const [user, setUser] = useState<User | null>(null);
  const [step, setStep] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [proofAttachmentId, setProofAttachmentId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiGet<{ data: User }>("/auth/me"), apiGet<{ data: Product[] }>("/products")])
      .then(([meRes, productsRes]) => {
        setUser(meRes.data);
        setProducts(productsRes.data);
        if (meRes.data.isPartner) setStep(2);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "기초 데이터를 불러오지 못했습니다."));
  }, []);

  const requestType = watch("requestType");
  const occasionType = watch("occasionType");
  const orchidType = watch("orchidType");

  function handleOccasionChange(next: FormValues["occasionType"]) {
    setValue("occasionType", next, { shouldValidate: true });
    setValue("ribbonMessage", RIBBON_MESSAGE_DEFAULTS[next], { shouldValidate: true });
    if (next !== "opening" && next !== "promotion") setValue("orchidType", undefined);
    if (next !== "wedding") setValue("weddingSide", undefined);
  }

  function handleRequestTypeChange(next: FormValues["requestType"]) {
    setValue("requestType", next, { shouldValidate: true });
    if (next === "existing_client") {
      // Case A는 발송사유/비용코드를 쓰지 않으므로 이전 케이스에서 남은 값을 지운다.
      setValue("sendReason", undefined);
      setValue("costCode", undefined);
    } else {
      // Case B/C는 고객사 정보를 쓰지 않으므로 이전 케이스(Case A)에서 남은 값을 지운다.
      setValue("clientName", undefined);
      setValue("contractType", undefined);
      setValue("serviceName", undefined);
      setValue("costCode", costCodeDefaultFor(next));
    }
  }

  function handleProductChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const productId = e.target.value;
    setValue("productId", productId, { shouldValidate: true });
    const product = products.find((p) => p.id === productId);
    if (product) setValue("declaredAmount", product.price, { shouldValidate: true });
  }

  function handleParsed(fields: ParsedInvitationFields) {
    if (fields.recipientName) setValue("recipientName", fields.recipientName, { shouldValidate: true });
    if (fields.venueName) setValue("venueName", fields.venueName, { shouldValidate: true });
    if (fields.deliveryAddress) setValue("deliveryAddress", fields.deliveryAddress, { shouldValidate: true });
    if (fields.desiredArrivalAt) setValue("desiredArrivalAt", fields.desiredArrivalAt.slice(0, 16), { shouldValidate: true });
  }

  async function goNext() {
    const fields = STEP_FIELDS[step];
    const valid = fields ? await trigger(fields) : true;
    if (valid) setStep((s) => s + 1);
  }

  function goBack() {
    setStep((s) => Math.max(user?.isPartner ? 2 : 1, s - 1));
  }

  function handleCancel() {
    reset();
    router.push("/requests");
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    if (!user?.isPartner && !proofAttachmentId) {
      setSubmitError("파트너 승인 증빙을 첨부해 주세요.");
      setStep(1);
      return;
    }

    const desiredArrivalAt = `${values.desiredArrivalAt}:00+09:00`;

    try {
      const res = await apiPost<{ data: { id: string } }>("/wreath-requests", {
        requestType: values.requestType,
        occasionType: values.occasionType,
        orchidType: values.orchidType,
        weddingSide: values.weddingSide,
        recipientName: values.recipientName,
        recipientPhone: values.recipientPhone,
        ordererPhone: values.ordererPhone,
        venueName: values.venueName,
        deliveryAddress: values.deliveryAddress,
        deliveryDetail: values.deliveryDetail,
        desiredArrivalAt,
        productId: values.productId,
        declaredAmount: values.declaredAmount,
        ribbonMessage: values.ribbonMessage,
        ribbonSenderText: values.ribbonSenderText,
        clientName: values.clientName,
        contractType: values.contractType,
        serviceName: values.serviceName,
        sendReason: values.sendReason,
        costCode: values.costCode,
        memo: values.memo || undefined,
        attachmentId: proofAttachmentId,
      });
      router.push(`/requests/${res.data.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PRE_APPROVAL_ATTACHMENT_REQUIRED") {
        setSubmitError(err.message);
        setStep(1);
        return;
      }
      setSubmitError(err instanceof ApiError ? err.message : "신청서 제출 중 오류가 발생했습니다.");
    }
  }

  const values = getValues();
  const canProceedStep1 = !!user && (user.isPartner || !!proofAttachmentId);

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!user) return <p className="text-sm text-gray-500">불러오는 중...</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold text-gray-900">화환 신청서 작성</h1>
      <StepIndicator step={step} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Section 1. 파트너 검증 */}
        {step === 1 && (
          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">1. 파트너 검증</h2>
            {user.isPartner ? (
              <p className="text-sm text-green-700">파트너 계정입니다. 증빙 없이 바로 신청할 수 있습니다.</p>
            ) : (
              <AttachmentUploader onUploaded={(id) => setProofAttachmentId(id)} />
            )}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                다음
              </button>
            </div>
          </section>
        )}

        {/* Section 2. 상품 및 경조사 선택 */}
        {step === 2 && (
          <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">2. 상품 및 경조사 선택</h2>

            <div>
              <label>발송 대상</label>
              <div className="mt-1 flex flex-wrap gap-4 text-sm font-normal text-gray-700">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={requestType !== "self"}
                    onChange={() => handleRequestTypeChange("existing_client")}
                    className="h-4 w-4"
                  />
                  고객사
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={requestType === "self"}
                    onChange={() => handleRequestTypeChange("self")}
                    className="h-4 w-4"
                  />
                  임직원(본인)
                </label>
              </div>
              {requestType !== "self" && (
                <div className="mt-2 flex flex-wrap gap-4 pl-6 text-sm font-normal text-gray-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={requestType === "existing_client"}
                      onChange={() => handleRequestTypeChange("existing_client")}
                      className="h-4 w-4"
                    />
                    현재 고객
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={requestType === "prospective_client"}
                      onChange={() => handleRequestTypeChange("prospective_client")}
                      className="h-4 w-4"
                    />
                    잠재 고객
                  </label>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="occasionType">경조사 유형</label>
              <select
                id="occasionType"
                value={occasionType}
                onChange={(e) => handleOccasionChange(e.target.value as FormValues["occasionType"])}
                className="w-full sm:w-64"
              >
                {(Object.keys(OCCASION_TYPE_LABELS) as Array<keyof typeof OCCASION_TYPE_LABELS>).map((key) => (
                  <option key={key} value={key}>
                    {OCCASION_TYPE_LABELS[key]}
                  </option>
                ))}
              </select>

              {(occasionType === "opening" || occasionType === "promotion") && (
                <div className="mt-2 flex gap-4 text-sm font-normal text-gray-700">
                  {(Object.keys(ORCHID_TYPE_LABELS) as Array<keyof typeof ORCHID_TYPE_LABELS>).map((key) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={orchidType === key}
                        onChange={() => setValue("orchidType", key, { shouldValidate: true })}
                        className="h-4 w-4"
                      />
                      {ORCHID_TYPE_LABELS[key]}
                    </label>
                  ))}
                </div>
              )}
              {errors.orchidType && <p className="mt-1 text-xs text-red-600">{errors.orchidType.message}</p>}

              {occasionType === "etc" && (
                <p className="mt-2 text-xs text-amber-700">
                  주문 정보 입력 시, 기타요청사항에 원하는 상품을 기재해주세요.
                </p>
              )}

              <OccasionReferenceImage occasionType={occasionType} orchidType={orchidType} />
            </div>

            <div>
              <label htmlFor="productId">상품 선택</label>
              <select id="productId" onChange={handleProductChange} defaultValue="" className="w-full sm:w-80">
                <option value="" disabled>
                  상품을 선택해주세요
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.price.toLocaleString("ko-KR")}원)
                  </option>
                ))}
              </select>
              <input type="hidden" {...register("productId")} />
              {errors.productId && <p className="mt-1 text-xs text-red-600">{errors.productId.message}</p>}
            </div>
            <div>
              <label htmlFor="declaredAmount">금액 (원)</label>
              <input id="declaredAmount" type="number" min={0} step={1000} {...register("declaredAmount")} className="w-full sm:w-48" />
              {errors.declaredAmount && <p className="mt-1 text-xs text-red-600">{errors.declaredAmount.message}</p>}
            </div>

            <div className="flex justify-between pt-2">
              <button type="button" onClick={goBack} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                이전
              </button>
              <button type="button" onClick={goNext} className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700">
                다음
              </button>
            </div>
          </section>
        )}

        {/* Section 3. 비용코드 및 발송 사유 */}
        {step === 3 && (
          <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">3. 비용코드 및 발송 사유</h2>
            {requestType === "existing_client" ? (
              <>
                <div>
                  <label htmlFor="clientName">고객사명</label>
                  <input id="clientName" {...register("clientName")} className="w-full" />
                  {errors.clientName && <p className="mt-1 text-xs text-red-600">{errors.clientName.message}</p>}
                </div>
                <div>
                  <label htmlFor="contractType">계약구분</label>
                  <select id="contractType" {...register("contractType")} defaultValue="" className="w-full sm:w-72">
                    <option value="" disabled>
                      계약구분을 선택해주세요
                    </option>
                    {(Object.keys(CONTRACT_TYPE_LABELS) as Array<keyof typeof CONTRACT_TYPE_LABELS>).map((key) => (
                      <option key={key} value={key}>
                        {CONTRACT_TYPE_LABELS[key]}
                      </option>
                    ))}
                  </select>
                  {errors.contractType && <p className="mt-1 text-xs text-red-600">{errors.contractType.message}</p>}
                </div>
                <div>
                  <label htmlFor="serviceName">용역명</label>
                  <input id="serviceName" {...register("serviceName")} className="w-full" />
                  {errors.serviceName && <p className="mt-1 text-xs text-red-600">{errors.serviceName.message}</p>}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="sendReason">발송 사유</label>
                  <input
                    id="sendReason"
                    placeholder={SEND_REASON_PLACEHOLDER[requestType === "self" ? "self" : "prospective_client"]}
                    {...register("sendReason")}
                    className="w-full"
                  />
                  {errors.sendReason && <p className="mt-1 text-xs text-red-600">{errors.sendReason.message}</p>}
                </div>
                <div>
                  <label htmlFor="costCode">비용 코드</label>
                  <input
                    id="costCode"
                    defaultValue={COST_CODE_DEFAULTS[requestType === "self" ? "self" : "prospective_client"]}
                    {...register("costCode")}
                    className="w-full sm:w-64"
                  />
                  {errors.costCode && <p className="mt-1 text-xs text-red-600">{errors.costCode.message}</p>}
                </div>
              </>
            )}
            <div className="flex justify-between pt-2">
              <button type="button" onClick={goBack} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                이전
              </button>
              <button type="button" onClick={goNext} className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700">
                다음
              </button>
            </div>
          </section>
        )}

        {/* Section 4. 주문 정보 입력 & 자동 채우기 */}
        {step === 4 && (
          <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">4. 주문 정보 입력</h2>
            <InvitationParserBox onParsed={handleParsed} />
            <p className="rounded-md bg-red-50 p-3 text-xs font-medium text-red-700">
              ⚠ 배송정보 오입력 시, 책임지지 않습니다. 신중하게 입력해주세요.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="recipientName">수령인 이름</label>
                <input id="recipientName" {...register("recipientName")} className="w-full" />
                {errors.recipientName && <p className="mt-1 text-xs text-red-600">{errors.recipientName.message}</p>}
              </div>
              <div>
                <label htmlFor="recipientPhone">수령인 연락처</label>
                <input id="recipientPhone" placeholder="010-1234-5678" {...register("recipientPhone")} className="w-full" />
                {errors.recipientPhone && <p className="mt-1 text-xs text-red-600">{errors.recipientPhone.message}</p>}
              </div>
            </div>
            <div>
              <label htmlFor="venueName">장소명 (예식장/장례식장 등)</label>
              <input id="venueName" {...register("venueName")} className="w-full" />
              {errors.venueName && <p className="mt-1 text-xs text-red-600">{errors.venueName.message}</p>}
            </div>
            <div>
              <label htmlFor="deliveryAddress">배송주소</label>
              <input id="deliveryAddress" {...register("deliveryAddress")} className="w-full" />
              {errors.deliveryAddress && <p className="mt-1 text-xs text-red-600">{errors.deliveryAddress.message}</p>}
            </div>
            <div>
              <label htmlFor="deliveryDetail">상세주소</label>
              <input id="deliveryDetail" placeholder="예: 3층 그랜드홀" {...register("deliveryDetail")} className="w-full" />
              {errors.deliveryDetail && <p className="mt-1 text-xs text-red-600">{errors.deliveryDetail.message}</p>}
            </div>
            <div>
              <label htmlFor="desiredArrivalAt">도착희망일시</label>
              <input id="desiredArrivalAt" type="datetime-local" {...register("desiredArrivalAt")} className="w-full sm:w-64" />
              {errors.desiredArrivalAt && <p className="mt-1 text-xs text-red-600">{errors.desiredArrivalAt.message}</p>}
            </div>

            {occasionType === "wedding" && (
              <div>
                <label>신랑측 / 신부측</label>
                <div className="mt-1 flex gap-4 text-sm font-normal text-gray-700">
                  {(Object.keys(WEDDING_SIDE_LABELS) as Array<keyof typeof WEDDING_SIDE_LABELS>).map((key) => (
                    <label key={key} className="flex items-center gap-2">
                      <input type="radio" value={key} {...register("weddingSide")} className="h-4 w-4" />
                      {WEDDING_SIDE_LABELS[key]}
                    </label>
                  ))}
                </div>
                {errors.weddingSide && <p className="mt-1 text-xs text-red-600">{errors.weddingSide.message}</p>}
              </div>
            )}

            <div>
              <label>리본명</label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ribbonMessage" className="text-xs text-gray-500">
                    좌측 (경조사어)
                  </label>
                  <input id="ribbonMessage" {...register("ribbonMessage")} className="w-full" />
                  {occasionType === "opening" && (
                    <div className="mt-1 flex gap-3 text-xs text-gray-500">
                      {OPENING_RIBBON_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setValue("ribbonMessage", opt, { shouldValidate: true })}
                          className="underline"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {errors.ribbonMessage && <p className="mt-1 text-xs text-red-600">{errors.ribbonMessage.message}</p>}
                </div>
                <div>
                  <label htmlFor="ribbonSenderText" className="text-xs text-gray-500">
                    우측 (보내는 이)
                  </label>
                  <input id="ribbonSenderText" {...register("ribbonSenderText")} className="w-full" />
                  {errors.ribbonSenderText && <p className="mt-1 text-xs text-red-600">{errors.ribbonSenderText.message}</p>}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="ordererPhone">주문자 휴대폰 번호</label>
              <input id="ordererPhone" placeholder="010-1234-5678" {...register("ordererPhone")} className="w-full sm:w-64" />
              {errors.ordererPhone && <p className="mt-1 text-xs text-red-600">{errors.ordererPhone.message}</p>}
            </div>
            <div>
              <label htmlFor="memo">기타요청사항 (선택)</label>
              <textarea id="memo" rows={3} {...register("memo")} className="w-full" />
            </div>

            <div className="flex justify-between pt-2">
              <button type="button" onClick={goBack} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                이전
              </button>
              <button type="button" onClick={goNext} className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700">
                다음
              </button>
            </div>
          </section>
        )}

        {/* Section 5. 신청 확정 & 요약 */}
        {step === 5 && (
          <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">5. 신청 확정 & 요약</h2>
            <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">
              이대로 신청하시겠습니까? 주문 접수 시, 취소가 불가하오니 신중한 신청 부탁드립니다.
            </p>
            <dl className="divide-y divide-gray-100 rounded-md border border-gray-200 text-sm">
              <SummaryRow label="발송 대상" value={REQUEST_TYPE_LABELS[values.requestType]} />
              <SummaryRow
                label="경조사 유형"
                value={
                  OCCASION_TYPE_LABELS[values.occasionType] +
                  (values.orchidType ? ` / ${ORCHID_TYPE_LABELS[values.orchidType]}` : "") +
                  (values.weddingSide ? ` / ${WEDDING_SIDE_LABELS[values.weddingSide]}` : "")
                }
              />
              {values.requestType === "existing_client" ? (
                <>
                  <SummaryRow label="고객사명" value={values.clientName} />
                  <SummaryRow label="계약구분" value={values.contractType ? CONTRACT_TYPE_LABELS[values.contractType] : ""} />
                  <SummaryRow label="용역명" value={values.serviceName} />
                </>
              ) : (
                <>
                  <SummaryRow label="발송 사유" value={values.sendReason} />
                  <SummaryRow label="비용 코드" value={values.costCode} />
                </>
              )}
              <SummaryRow label="수령인" value={`${values.recipientName} / ${values.recipientPhone}`} />
              <SummaryRow label="장소" value={values.venueName} />
              <SummaryRow label="배송지" value={`${values.deliveryAddress} ${values.deliveryDetail}`} />
              <SummaryRow label="도착 희망" value={values.desiredArrivalAt ? formatDateTime(`${values.desiredArrivalAt}:00`) : ""} />
              <SummaryRow label="리본" value={`${values.ribbonMessage} / ${values.ribbonSenderText}`} />
              <SummaryRow label="상품/금액" value={`${values.declaredAmount?.toLocaleString("ko-KR")}원`} />
              <SummaryRow label="주문자 연락처" value={values.ordererPhone} />
              {values.memo && <SummaryRow label="기타요청사항" value={values.memo} />}
              {!user.isPartner && (
                <SummaryRow label="파트너 승인 증빙" value={proofAttachmentId ? "첨부됨 ✓" : "미첨부"} />
              )}
            </dl>

            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={goBack} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  이전
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "제출 중..." : "신청"}
                </button>
              </div>
            </div>
          </section>
        )}
      </form>

      {step === 1 && (
        <p className="mt-4 text-center text-xs text-gray-400">
          <Link href="/requests" className="underline">
            목록으로 돌아가기
          </Link>
        </p>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-2.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="col-span-2 text-gray-900">{value || "-"}</dd>
    </div>
  );
}
