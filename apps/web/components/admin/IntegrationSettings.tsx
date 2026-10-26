"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import type { IntegrationSection, IntegrationSettingsView, SecretView } from "@/lib/types";

// 관리자 > 설정 > 외부 연동 — Microsoft 365 로그인 / 알림톡(Solapi) / 청첩장 AI(Claude).
// 값은 서버의 암호화 파일에 저장되고 저장 즉시 적용된다. 비밀값은 한 번 저장하면 다시 보이지 않고,
// 입력란을 비워 두면 그대로 유지, [지우기]를 체크하면 삭제된다.

type FieldType = "text" | "secret" | "select" | "checkbox";

interface Option {
  value: string;
  label: string;
}

interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  help?: string;
  options?: Option[];
  // 특정 모드일 때만 보여 준다(예: Microsoft 365 를 골랐을 때만 OIDC 항목).
  showWhen?: { key: string; equals: string };
  // 값이 비어 있을 때 화면에서 미리 채워 주는 기본값(예: 접속 주소로 만든 리디렉션 URI).
  defaultValue?: () => string;
}

interface SectionSpec {
  section: IntegrationSection;
  title: string;
  description: string;
  // 설정값을 어디서 받아오는지 순서대로 안내(배포 센터 SSO 화면과 같은 형식).
  steps?: string[];
  // 접힌 상태에서 제목 옆에 보여 줄 "지금 적용 중" 상태.
  status: (view: IntegrationSettingsView) => string;
  fields: FieldSpec[];
  test?: { path: string; label: string; describe: (result: Record<string, unknown>) => string };
}

const SECTIONS: SectionSpec[] = [
  {
    section: "auth",
    title: "로그인 방식 (Microsoft 365)",
    description:
      "직원 로그인 방식입니다. Microsoft 365 를 고르면 Entra 앱 등록 값이 필요하고, 직원 명단에 회사 이메일이 등록된 사람만 들어옵니다. 저장하기 전에 직원 명단에 본인 회사 이메일을 관리자로 넣어 두세요.",
    status: (v) => EFFECTIVE_LABELS.loginMethod[v.effective.loginMethod],
    steps: [
      "Entra 관리 센터(entra.microsoft.com) > 앱 등록에서 화환 앱용 앱을 새로 만들고(이 조직 디렉터리의 계정만), 리디렉션 URI(웹)로 아래 '리디렉션 URI' 값을 추가합니다.",
      "개요 화면의 디렉터리(테넌트) ID 와 애플리케이션(클라이언트) ID 를 아래에 넣습니다. 직원 명단에서 회사 계정 검색을 쓰려면 API 사용 권한 > Microsoft Graph > 애플리케이션 권한 User.Read.All 을 추가하고 [관리자 동의 부여]를 누르세요.",
      "인증서 및 비밀에서 클라이언트 암호를 만들고 '값'을 아래에 넣어 저장합니다(만료일을 기록해 두세요). 저장 후 [Microsoft 연결 확인]으로 확인합니다.",
    ],
    fields: [
      {
        key: "mode",
        label: "로그인 방식",
        type: "select",
        options: [
          { value: "mock", label: "임시 사번 로그인 (연동 전)" },
          { value: "oidc", label: "Microsoft 365 로그인" },
        ],
      },
      {
        key: "allowDevLogin",
        label: "운영 서버에서도 사번만으로 로그인 허용 (시험용 — 시험이 끝나면 끄세요)",
        type: "checkbox",
        showWhen: { key: "mode", equals: "mock" },
      },
      {
        key: "oidcIssuer",
        label: "테넌트 ID (디렉터리 ID)",
        type: "text",
        placeholder: "예: 12345678-abcd-1234-abcd-123456789abc",
        help: "ID 만 넣으면 https://login.microsoftonline.com/<ID>/v2.0 발급자 주소로 저장됩니다(전체 주소를 넣어도 됩니다).",
        showWhen: { key: "mode", equals: "oidc" },
      },
      {
        key: "oidcClientId",
        label: "클라이언트 ID (애플리케이션 ID)",
        type: "text",
        showWhen: { key: "mode", equals: "oidc" },
      },
      {
        key: "oidcClientSecret",
        label: "클라이언트 암호 (값)",
        type: "secret",
        help: "Entra 앱 등록 > 인증서 및 비밀에서 발급한 '값'(비밀 ID 가 아님).",
        showWhen: { key: "mode", equals: "oidc" },
      },
      {
        key: "oidcRedirectUri",
        label: "리디렉션 URI",
        type: "text",
        placeholder: "https://<접속 주소>/api/auth/oidc/callback",
        help: "이 앱의 접속 주소로 자동으로 채워집니다. Entra 앱 등록의 웹 리디렉션 URI 와 글자 하나까지 같아야 합니다.",
        showWhen: { key: "mode", equals: "oidc" },
        defaultValue: () => (typeof window === "undefined" ? "" : `${window.location.origin}/api/auth/oidc/callback`),
      },
    ],
    test: {
      path: "oidc",
      label: "Microsoft 연결 확인",
      describe: (r) => `발급자 확인됨: ${String(r.issuer ?? "")}`,
    },
  },
  {
    section: "vendor",
    title: "꽃집 알림톡 발송 (Solapi)",
    description:
      "신청이 접수되면 꽃집에 카카오 알림톡을 보내는 대행사 설정입니다. '기록만 남김'이면 실제 발송 없이 로그만 남깁니다.",
    status: (v) => EFFECTIVE_LABELS.vendorAdapter[v.effective.vendorAdapter],
    fields: [
      {
        key: "adapter",
        label: "발송 방식",
        type: "select",
        options: [
          { value: "mock", label: "기록만 남김 (실제 발송 안 함)" },
          { value: "kakao", label: "Solapi 알림톡으로 실제 발송" },
        ],
      },
      { key: "apiKey", label: "API Key", type: "secret", help: "솔라피 콘솔 > 개발/연동 > API Key 관리 (이 앱 전용 키 권장)" },
      { key: "apiSecret", label: "API Secret", type: "secret" },
      { key: "senderKey", label: "발신프로필 키 (pfId)", type: "text", help: "카카오톡 채널 연동 아이디" },
      { key: "senderPhone", label: "발신번호", type: "text", placeholder: "예: 0212345678", help: "알림톡 실패 시 문자 대체발송에 쓰는 등록 번호" },
      { key: "templateId", label: "알림톡 템플릿 ID", type: "text", help: "검수 완료된 템플릿" },
      { key: "apiBaseUrl", label: "API 주소", type: "text", placeholder: "https://api.solapi.com" },
      {
        key: "webhookSecret",
        label: "발송 결과 웹훅 비밀값",
        type: "secret",
        help: "32자 이상 임의 문자열. 솔라피 콘솔 웹훅에 https://<접속 주소>/api/webhooks/solapi/<이 값> 을 등록합니다. 비워 두면 결과를 받지 않습니다.",
      },
    ],
    test: {
      path: "solapi",
      label: "Solapi 연결 확인",
      describe: (r) => (typeof r.balance === "number" ? `연결됨 (잔액 ${r.balance.toLocaleString()}원)` : "연결됨"),
    },
  },
  {
    section: "invitationParser",
    title: "청첩장·부고장 AI 자동 채우기 (Claude)",
    description:
      "직원이 올린 청첩장 링크·사진에서 배송 정보를 읽어 주는 기능입니다. 켜면 청첩장 내용(개인정보)이 Anthropic 으로 전송되므로 사내 검토 후에 켜세요.",
    status: (v) => EFFECTIVE_LABELS.invitationParser[v.effective.invitationParser],
    fields: [
      {
        key: "mode",
        label: "사용 여부",
        type: "select",
        options: [
          { value: "mock", label: "끄기 (외부 전송 없음)" },
          { value: "claude", label: "Claude 로 자동 채우기" },
        ],
      },
      { key: "anthropicApiKey", label: "Anthropic API 키", type: "secret", help: "Anthropic 콘솔에서 발급. 사용량만큼 과금됩니다." },
      { key: "model", label: "모델", type: "text", placeholder: "claude-opus-5-5" },
    ],
    test: {
      path: "anthropic",
      label: "Anthropic 연결 확인",
      describe: (r) => `연결됨: ${String(r.displayName ?? r.model ?? "")}`,
    },
  },
];

const EFFECTIVE_LABELS = {
  loginMethod: { oidc: "Microsoft 365 로그인", dev: "임시 사번 로그인", none: "로그인 불가(사번 로그인 꺼짐)" },
  vendorAdapter: { mock: "기록만 남김", kakao: "Solapi 실제 발송" },
  invitationParser: { mock: "꺼짐", claude: "Claude 사용" },
} as const;

export function IntegrationSettings() {
  const [view, setView] = useState<IntegrationSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: IntegrationSettingsView }>("/admin/integration-settings")
      .then((res) => setView(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "연동 설정을 불러오지 못했습니다."));
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">외부 연동 설정</h2>
        <p className="mt-1 text-xs text-gray-500">
          관리자만 볼 수 있으며, 저장하면 서버 재시작 없이 바로 적용됩니다. 값은 코드나 DB 가 아니라 서버의
          암호화된 설정 파일에 저장되고, 비밀값(암호·API 키)은 저장 후 다시 표시되지 않습니다.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!view && !error && <p className="text-sm text-gray-500">불러오는 중...</p>}

      {view && (
        <>
          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-700">
            <span className="font-medium text-gray-900">현재 적용 중</span>
            <span className="mx-2 text-gray-300">|</span>
            로그인: {EFFECTIVE_LABELS.loginMethod[view.effective.loginMethod]}
            {view.effective.localLogin && ` + 임시 관리자(${view.auth.localAdmin.id})`}
            <span className="mx-2 text-gray-300">|</span>
            알림톡: {EFFECTIVE_LABELS.vendorAdapter[view.effective.vendorAdapter]}
            <span className="mx-2 text-gray-300">|</span>
            청첩장 AI: {EFFECTIVE_LABELS.invitationParser[view.effective.invitationParser]}
            <div className="mt-1 text-gray-500">
              {view.meta.fromFile
                ? `마지막 저장: ${formatDate(view.meta.savedAt)} (${view.meta.savedBy ?? "-"})`
                : "아직 저장한 적이 없어 서버 환경설정(.env) 값으로 동작 중입니다."}
            </div>
          </div>

          {SECTIONS.map((spec) => (
            // 평소에는 접어 두고 필요할 때만 편다. 접힌 상태에서도 제목 옆에 적용 중인 방식이 보인다.
            <details key={spec.section} className="group rounded-lg border border-gray-200 bg-white">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="mr-2 inline-block text-gray-400 transition-transform group-open:rotate-90">▶</span>
                  {spec.title}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-normal text-gray-600">{spec.status(view)}</span>
              </summary>
              <div className="border-t border-gray-100">
                <SectionCard spec={spec} view={view} onSaved={setView} />
              </div>
            </details>
          ))}
        </>
      )}
    </section>
  );
}

type SecretState = { value: string; clear: boolean };

function SectionCard({
  spec,
  view,
  onSaved,
}: {
  spec: SectionSpec;
  view: IntegrationSettingsView;
  onSaved: (next: IntegrationSettingsView) => void;
}) {
  const current = view[spec.section] as unknown as Record<string, string | boolean | SecretView>;
  const [values, setValues] = useState<Record<string, string | boolean>>(() => plainValues(spec, current));
  const [secrets, setSecrets] = useState<Record<string, SecretState>>(() => emptySecrets(spec));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // 다른 카드가 저장돼 view 가 바뀌어도 이 카드의 입력 중인 값은 유지하고, 비밀값 상태만 새로 반영한다.
  useEffect(() => {
    setSecrets(emptySecrets(spec));
  }, [spec, view]);

  function visible(field: FieldSpec) {
    return !field.showWhen || String(values[field.showWhen.key]) === field.showWhen.equals;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const patch: Record<string, unknown> = { ...values };
      for (const [key, state] of Object.entries(secrets)) {
        if (state.value) patch[key] = state.value;
        else if (state.clear) patch[key] = null;
      }
      const res = await apiPut<{ data: IntegrationSettingsView }>("/admin/integration-settings", {
        [spec.section]: patch,
      });
      onSaved(res.data);
      setValues(plainValues(spec, res.data[spec.section] as unknown as Record<string, string | boolean | SecretView>));
      setMessage({ kind: "ok", text: "저장되었습니다. 바로 적용됩니다." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "저장에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!spec.test) return;
    setTesting(true);
    setMessage(null);
    try {
      const res = await apiPost<{ data: { ok: true; result: Record<string, unknown> } }>(
        `/admin/integration-settings/test/${spec.test.path}`
      );
      setMessage({ kind: "ok", text: spec.test.describe(res.data.result) });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "연결 확인에 실패했습니다." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="p-5">
      <p className="text-xs text-gray-500">{spec.description}</p>
      {spec.steps && String(values.mode ?? "") !== "mock" && (
        <ol className="mt-3 list-decimal space-y-1 rounded-md border-l-4 border-brand-100 bg-gray-50 py-3 pl-8 pr-4 text-xs text-gray-700">
          {spec.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {spec.fields.filter(visible).map((field) => {
          const id = `${spec.section}-${field.key}`;
          if (field.type === "checkbox") {
            return (
              <label key={field.key} className="flex items-center gap-2 text-sm font-normal text-gray-700 sm:col-span-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={Boolean(values[field.key])}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.checked })}
                  className="h-4 w-4"
                />
                {field.label}
              </label>
            );
          }
          if (field.type === "select") {
            return (
              <div key={field.key} className="sm:col-span-2">
                <label htmlFor={id}>{field.label}</label>
                <select
                  id={id}
                  value={String(values[field.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  className="w-full"
                >
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }
          if (field.type === "secret") {
            const saved = current[field.key] as SecretView;
            const state = secrets[field.key] ?? { value: "", clear: false };
            return (
              <div key={field.key}>
                <label htmlFor={id}>{field.label}</label>
                <input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  value={state.value}
                  disabled={state.clear}
                  onChange={(e) => setSecrets({ ...secrets, [field.key]: { ...state, value: e.target.value } })}
                  placeholder={saved.set ? `저장됨 (${saved.hint}) — 바꾸려면 입력` : "입력"}
                  className="w-full"
                />
                {saved.set && (
                  <label className="mt-1 flex items-center gap-2 text-xs font-normal text-gray-500">
                    <input
                      type="checkbox"
                      checked={state.clear}
                      onChange={(e) => setSecrets({ ...secrets, [field.key]: { value: "", clear: e.target.checked } })}
                      className="h-3.5 w-3.5"
                    />
                    저장된 값 지우기
                  </label>
                )}
                {field.help && <p className="mt-1 text-xs text-gray-400">{field.help}</p>}
              </div>
            );
          }
          return (
            <div key={field.key}>
              <label htmlFor={id}>{field.label}</label>
              <input
                id={id}
                type="text"
                value={String(values[field.key] ?? "")}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                placeholder={field.placeholder}
                className="w-full"
              />
              {field.help && <p className="mt-1 text-xs text-gray-400">{field.help}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {spec.test && (
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || saving}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="저장된 값으로 확인합니다. 바꾼 값은 먼저 저장하세요."
          >
            {testing ? "확인 중..." : spec.test.label}
          </button>
        )}
        {message && (
          <span className={`text-sm ${message.kind === "ok" ? "text-green-700" : "text-red-600"}`}>{message.text}</span>
        )}
      </div>
    </form>
  );
}

function plainValues(spec: SectionSpec, current: Record<string, string | boolean | SecretView>) {
  const out: Record<string, string | boolean> = {};
  for (const field of spec.fields) {
    if (field.type === "secret") continue;
    const value = current[field.key];
    let plain: string | boolean = typeof value === "boolean" ? value : String(value ?? "");
    if (plain === "" && field.defaultValue) plain = field.defaultValue();
    out[field.key] = plain;
  }
  return out;
}

function emptySecrets(spec: SectionSpec): Record<string, SecretState> {
  const out: Record<string, SecretState> = {};
  for (const field of spec.fields) {
    if (field.type === "secret") out[field.key] = { value: "", clear: false };
  }
  return out;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("ko-KR");
}
