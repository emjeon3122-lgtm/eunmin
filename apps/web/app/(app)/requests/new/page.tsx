"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useApprovalRuleCheck } from "@/hooks/useApprovalRuleCheck";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import { OCCASION_TYPE_LABELS, REQUEST_TYPE_LABELS } from "@/lib/labels";
import type { Product, RibbonTemplate } from "@/lib/types";

const schema = z.object({
  requestType: z.enum(["self", "client"], {
    required_error: "신청 유형을 선택해주세요.",
  }),
  occasionType: z.enum(["wedding", "funeral", "opening", "etc"], {
    required_error: "경조사 유형을 선택해주세요.",
  }),
  recipientName: z.string().min(1, "수령인 이름을 입력해주세요."),
  recipientPhone: z.string().min(9, "연락처를 입력해주세요. (예: 010-1234-5678)"),
  venueName: z.string().min(1, "장소명을 입력해주세요."),
  deliveryAddress: z.string().min(1, "배송 주소를 입력해주세요."),
  deliveryDetail: z.string().optional(),
  desiredArrivalAt: z.string().min(1, "도착 희망 일시를 선택해주세요."),
  productId: z.string().min(1, "상품을 선택해주세요."),
  declaredAmount: z.coerce.number().positive("금액을 입력해주세요."),
  ribbonMessage: z.string().min(1, "리본 문구를 입력해주세요."),
  ribbonSenderText: z.string().min(1, "보내는 이를 입력해주세요."),
  memo: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewWreathRequestPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { requestType: "self", occasionType: "wedding" },
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [ribbonTemplates, setRibbonTemplates] = useState<RibbonTemplate[]>([]);
  const [ribbonMode, setRibbonMode] = useState<"template" | "custom">("template");
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<{ data: Product[] }>("/products"),
      apiGet<{ data: RibbonTemplate[] }>("/ribbon-templates"),
    ])
      .then(([productsRes, templatesRes]) => {
        setProducts(productsRes.data);
        setRibbonTemplates(templatesRes.data);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "기초 데이터를 불러오지 못했습니다."));
  }, []);

  const occasionType = watch("occasionType");
  const declaredAmount = watch("declaredAmount");
  const { requiresPreApproval, matchedRule } = useApprovalRuleCheck(occasionType, declaredAmount);

  const filteredTemplates = useMemo(
    () => ribbonTemplates.filter((t) => t.occasionType === occasionType && t.isActive),
    [ribbonTemplates, occasionType]
  );

  const canSubmit = !requiresPreApproval || !!attachmentId;

  function handleProductChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const productId = e.target.value;
    setValue("productId", productId, { shouldValidate: true });
    const product = products.find((p) => p.id === productId);
    if (product) {
      setValue("declaredAmount", product.price, { shouldValidate: true });
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(null);

    if (requiresPreApproval && !attachmentId) {
      setSubmitError("본부장 사전승인 증빙 첨부가 필요합니다.");
      return;
    }

    // datetime-local gives "YYYY-MM-DDTHH:mm" with no timezone; this app is
    // KST-only, so we attach the +09:00 offset the API expects.
    const desiredArrivalAt = `${values.desiredArrivalAt}:00+09:00`;

    try {
      const res = await apiPost<{
        data: { id: string; status: string; requiresPreApproval: boolean; createdAt: string };
      }>("/wreath-requests", {
        requestType: values.requestType,
        occasionType: values.occasionType,
        recipientName: values.recipientName,
        recipientPhone: values.recipientPhone,
        venueName: values.venueName,
        deliveryAddress: values.deliveryAddress,
        deliveryDetail: values.deliveryDetail || undefined,
        desiredArrivalAt,
        productId: values.productId,
        declaredAmount: values.declaredAmount,
        ribbonMessage: values.ribbonMessage,
        ribbonSenderText: values.ribbonSenderText,
        memo: values.memo || undefined,
        attachmentId,
      });
      router.push(`/requests/${res.data.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PRE_APPROVAL_ATTACHMENT_REQUIRED") {
        setSubmitError(err.message);
        return;
      }
      setSubmitError(err instanceof ApiError ? err.message : "신청서 제출 중 오류가 발생했습니다.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold text-gray-900">화환 신청서 작성</h1>

      {loadError && <p className="mt-2 text-sm text-red-600">{loadError}</p>}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-8">
        {/* A. 신청 유형 */}
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">A. 신청 유형</h2>
          <div className="flex flex-wrap gap-4">
            {(Object.keys(REQUEST_TYPE_LABELS) as Array<keyof typeof REQUEST_TYPE_LABELS>).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm font-normal text-gray-700">
                <input type="radio" value={key} {...register("requestType")} className="h-4 w-4" />
                {REQUEST_TYPE_LABELS[key]}
              </label>
            ))}
          </div>

          <div>
            <label htmlFor="occasionType">경조사 유형</label>
            <select id="occasionType" {...register("occasionType")} className="w-full sm:w-64">
              {(Object.keys(OCCASION_TYPE_LABELS) as Array<keyof typeof OCCASION_TYPE_LABELS>).map((key) => (
                <option key={key} value={key}>
                  {OCCASION_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* B. 수령/배송 정보 */}
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">B. 수령/배송 정보</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="recipientName">수령인 이름</label>
              <input id="recipientName" {...register("recipientName")} className="w-full" />
              {errors.recipientName && <p className="mt-1 text-xs text-red-600">{errors.recipientName.message}</p>}
            </div>
            <div>
              <label htmlFor="recipientPhone">연락처</label>
              <input id="recipientPhone" placeholder="010-1234-5678" {...register("recipientPhone")} className="w-full" />
              {errors.recipientPhone && <p className="mt-1 text-xs text-red-600">{errors.recipientPhone.message}</p>}
            </div>
          </div>
          <div>
            <label htmlFor="venueName">장소명 (예식장/장례식장)</label>
            <input id="venueName" {...register("venueName")} className="w-full" />
            {errors.venueName && <p className="mt-1 text-xs text-red-600">{errors.venueName.message}</p>}
          </div>
          <div>
            <label htmlFor="deliveryAddress">배송 주소</label>
            <input id="deliveryAddress" {...register("deliveryAddress")} className="w-full" />
            {errors.deliveryAddress && <p className="mt-1 text-xs text-red-600">{errors.deliveryAddress.message}</p>}
          </div>
          <div>
            <label htmlFor="deliveryDetail">상세 주소 (선택)</label>
            <input id="deliveryDetail" placeholder="예: 3층 그랜드홀" {...register("deliveryDetail")} className="w-full" />
          </div>
          <div>
            <label htmlFor="desiredArrivalAt">도착 희망 일시</label>
            <input
              id="desiredArrivalAt"
              type="datetime-local"
              {...register("desiredArrivalAt")}
              className="w-full sm:w-64"
            />
            {errors.desiredArrivalAt && <p className="mt-1 text-xs text-red-600">{errors.desiredArrivalAt.message}</p>}
          </div>
        </section>

        {/* C. 상품 및 금액 */}
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">C. 상품 및 금액</h2>
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
            <input
              id="declaredAmount"
              type="number"
              min={0}
              step={1000}
              {...register("declaredAmount")}
              className="w-full sm:w-48"
            />
            <p className="mt-1 text-xs text-gray-400">상품 선택 시 자동으로 채워지며, 필요 시 직접 수정할 수 있습니다.</p>
            {errors.declaredAmount && <p className="mt-1 text-xs text-red-600">{errors.declaredAmount.message}</p>}
          </div>

          {requiresPreApproval && (
            <>
              {matchedRule && (
                <p className="text-xs text-amber-700">
                  기준: {OCCASION_TYPE_LABELS[occasionType as keyof typeof OCCASION_TYPE_LABELS] ?? matchedRule.occasionType}{" "}
                  {matchedRule.minAmount.toLocaleString("ko-KR")}원 이상
                </p>
              )}
              <AttachmentUploader onUploaded={(id) => setAttachmentId(id)} />
            </>
          )}
        </section>

        {/* D. 리본 문구 */}
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">D. 리본 문구</h2>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 font-normal text-gray-700">
              <input
                type="radio"
                checked={ribbonMode === "template"}
                onChange={() => setRibbonMode("template")}
                className="h-4 w-4"
              />
              템플릿 선택
            </label>
            <label className="flex items-center gap-2 font-normal text-gray-700">
              <input
                type="radio"
                checked={ribbonMode === "custom"}
                onChange={() => setRibbonMode("custom")}
                className="h-4 w-4"
              />
              직접 입력
            </label>
          </div>

          {ribbonMode === "template" ? (
            <div>
              <label htmlFor="ribbonTemplate">경조사어</label>
              <select
                id="ribbonTemplate"
                onChange={(e) => setValue("ribbonMessage", e.target.value, { shouldValidate: true })}
                defaultValue=""
                className="w-full sm:w-64"
              >
                <option value="" disabled>
                  문구를 선택해주세요
                </option>
                {filteredTemplates.map((t) => (
                  <option key={t.id} value={t.phraseKo}>
                    {t.phraseKo}
                    {t.phraseHanja ? ` (${t.phraseHanja})` : ""}
                  </option>
                ))}
              </select>
              <input type="hidden" {...register("ribbonMessage")} />
            </div>
          ) : (
            <div>
              <label htmlFor="ribbonMessage">경조사어 직접 입력</label>
              <input id="ribbonMessage" {...register("ribbonMessage")} className="w-full sm:w-64" />
            </div>
          )}
          {errors.ribbonMessage && <p className="text-xs text-red-600">{errors.ribbonMessage.message}</p>}

          <div>
            <label htmlFor="ribbonSenderText">보내는 이</label>
            <input id="ribbonSenderText" placeholder="예: 경영지원팀 김철수" {...register("ribbonSenderText")} className="w-full sm:w-80" />
            {errors.ribbonSenderText && <p className="mt-1 text-xs text-red-600">{errors.ribbonSenderText.message}</p>}
          </div>
        </section>

        {/* E. 기타 요청사항 */}
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">E. 기타 요청사항</h2>
          <textarea
            {...register("memo")}
            rows={3}
            placeholder="예: 화환은 홀 입구 쪽으로 배치 부탁드립니다."
            className="w-full"
          />
        </section>

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <div className="flex justify-end gap-3 pb-8">
          <Link
            href="/requests"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "제출 중..." : "제출하기"}
          </button>
        </div>
        {requiresPreApproval && !attachmentId && (
          <p className="-mt-6 text-right text-xs text-amber-700">사전승인 증빙을 첨부해야 제출할 수 있습니다.</p>
        )}
      </form>
    </div>
  );
}
