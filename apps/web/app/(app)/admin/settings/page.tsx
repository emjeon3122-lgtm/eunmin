"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut, ApiError } from "@/lib/api";
import { OCCASION_TYPE_LABELS } from "@/lib/labels";
import type { ApprovalRule, OccasionType, Product, Vendor } from "@/lib/types";

const CHANNEL_TYPE_OPTIONS: Vendor["channelType"][] = ["kakao_friendtalk", "kakao_alimtalk", "api", "email"];
const FALLBACK_CHANNEL_OPTIONS: Vendor["fallbackChannel"][] = ["manual_admin_alert", "sms", "none"];
const RULE_OCCASION_OPTIONS: (OccasionType | "all")[] = ["all", "wedding", "funeral", "opening", "etc"];

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <h1 className="text-lg font-semibold text-gray-900">설정</h1>
      <VendorSettings />
      <ApprovalRuleSettings />
    </div>
  );
}

function VendorSettings() {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // No vendor-list endpoint exists yet (doc 02 only defines
    // GET/PUT /api/admin/vendors/{id}); since there is currently a single
    // contracted vendor (doc 01 §2-1), we resolve its id via the vendor on
    // an active product.
    apiGet<{ data: Product[] }>("/products")
      .then((res) => {
        const vendorId = res.data[0]?.vendorId;
        if (!vendorId) throw new ApiError("NOT_FOUND", "등록된 상품이 없어 꽃집 정보를 찾을 수 없습니다.", 404);
        return apiGet<{ data: Vendor }>(`/admin/vendors/${vendorId}`);
      })
      .then((res) => setVendor(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "꽃집 정보를 불러오지 못했습니다."));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await apiPut<{ data: Vendor }>(`/admin/vendors/${vendor.id}`, vendor);
      setVendor(res.data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">꽃집 연동 정보</h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!vendor && !error && <p className="mt-2 text-sm text-gray-500">불러오는 중...</p>}

      {vendor && (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="vendorName">꽃집명</label>
            <input
              id="vendorName"
              value={vendor.name}
              onChange={(e) => setVendor({ ...vendor, name: e.target.value })}
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor="contactPhone">연락처</label>
            <input
              id="contactPhone"
              value={vendor.contactPhone}
              onChange={(e) => setVendor({ ...vendor, contactPhone: e.target.value })}
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor="channelType">연동 채널</label>
            <select
              id="channelType"
              value={vendor.channelType}
              onChange={(e) => setVendor({ ...vendor, channelType: e.target.value as Vendor["channelType"] })}
              className="w-full"
            >
              {CHANNEL_TYPE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="kakaoChannelId">카카오 채널 ID</label>
            <input
              id="kakaoChannelId"
              value={vendor.kakaoChannelId ?? ""}
              onChange={(e) => setVendor({ ...vendor, kakaoChannelId: e.target.value })}
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor="fallbackChannel">발송 실패 시 대체 방식</label>
            <select
              id="fallbackChannel"
              value={vendor.fallbackChannel}
              onChange={(e) => setVendor({ ...vendor, fallbackChannel: e.target.value as Vendor["fallbackChannel"] })}
              className="w-full"
            >
              {FALLBACK_CHANNEL_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-4 pt-6">
            <label className="flex items-center gap-2 text-sm font-normal text-gray-700">
              <input
                type="checkbox"
                checked={vendor.isChannelFriendConfirmed}
                onChange={(e) => setVendor({ ...vendor, isChannelFriendConfirmed: e.target.checked })}
                className="h-4 w-4"
              />
              채널 친구 추가 확인됨
            </label>
            <label className="flex items-center gap-2 text-sm font-normal text-gray-700">
              <input
                type="checkbox"
                checked={vendor.isActive}
                onChange={(e) => setVendor({ ...vendor, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              사용 중
            </label>
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            {saved && <span className="text-sm text-green-700">저장되었습니다.</span>}
          </div>
        </form>
      )}
    </section>
  );
}

function ApprovalRuleSettings() {
  const [rules, setRules] = useState<ApprovalRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet<{ data: ApprovalRule[] }>("/admin/approval-rules")
      .then((res) => setRules(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "사전승인 규칙을 불러오지 못했습니다."));
  }, []);

  function updateRule(id: string, patch: Partial<ApprovalRule>) {
    setRules((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) : prev));
  }

  async function handleSave() {
    if (!rules) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await apiPut<{ data: ApprovalRule[] }>("/admin/approval-rules", { rules });
      setRules(res.data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">사전승인 판정 규칙</h2>
      <p className="mt-1 text-xs text-gray-500">경조사 유형별로 본부장 사전승인 증빙이 필요해지는 최소 금액입니다.</p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!rules && !error && <p className="mt-2 text-sm text-gray-500">불러오는 중...</p>}

      {rules && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-gray-500">
                <tr>
                  <th className="py-2 font-medium">유형</th>
                  <th className="py-2 font-medium">최소 금액(원)</th>
                  <th className="py-2 font-medium">사용</th>
                  <th className="py-2 font-medium">설명</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="py-2 pr-3">
                      <select
                        value={rule.occasionType}
                        onChange={(e) => updateRule(rule.id, { occasionType: e.target.value as OccasionType | "all" })}
                      >
                        {RULE_OCCASION_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o === "all" ? "전체" : OCCASION_TYPE_LABELS[o]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={rule.minAmount}
                        onChange={(e) => updateRule(rule.id, { minAmount: Number(e.target.value) })}
                        className="w-32"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={rule.isActive}
                        onChange={(e) => updateRule(rule.id, { isActive: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={rule.description ?? ""}
                        onChange={(e) => updateRule(rule.id, { description: e.target.value })}
                        className="w-full"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            {saved && <span className="text-sm text-green-700">저장되었습니다.</span>}
          </div>
        </>
      )}
    </section>
  );
}
