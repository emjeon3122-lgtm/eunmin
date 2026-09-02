// DB status is only ever submitted/submitted_to_vendor/accepted/completed
// (draft/cancelled aside), but the screen shows 4 display steps:
// "신청 완료 → 꽃집 접수 → 배송 중 → 완료". submitted/submitted_to_vendor
// collapse into step 1, and accepted (which has no separate DB state for
// "in transit") is shown filled through step 3 ("배송 중") — see
// docs/03-frontend-wireframe.md §3-4, kept faithful to the sample on purpose.
const STEPS = [
  { key: "submitted", label: "신청 완료" },
  { key: "accepted", label: "꽃집 접수" },
  { key: "accepted_in_progress", label: "배송 중" }, // display-only step; same DB status as "accepted"
  { key: "completed", label: "완료" },
] as const;

function toDisplayStep(status: string) {
  if (status === "submitted" || status === "submitted_to_vendor") return "submitted";
  if (status === "completed") return "completed";
  if (status === "accepted") return "accepted"; // 접수 직후에는 2번째 단계에만 점이 찍힘
  return status;
}

export function StatusTracker({ status }: { status: string }) {
  if (status === "cancelled") {
    return <p className="font-medium text-red-600">이 신청은 취소되었습니다.</p>;
  }
  const displayStep = toDisplayStep(status);
  // "배송 중" 칸은 accepted가 어느 정도 시간이 지나도 completed가 아니면 채워지는 것으로 보여주기 위한
  // 화면 전용 처리이며, 실제로는 accepted와 동일한 상태다.
  const currentIndex =
    displayStep === "accepted"
      ? 2 // 접수 완료 후에는 "배송 중"까지 채워진 것으로 보여준다
      : STEPS.findIndex((s) => s.key === displayStep);

  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center">
          <div
            className={`h-3 w-3 rounded-full ${i <= currentIndex ? "bg-blue-600" : "bg-gray-300"}`}
          />
          <span className="ml-1.5 mr-3 text-sm text-gray-700">{step.label}</span>
          {i < STEPS.length - 1 && <div className="mr-3 h-px w-8 bg-gray-300" />}
        </div>
      ))}
    </div>
  );
}
