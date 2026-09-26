const STEP_LABELS = ["파트너 검증", "경조사 선택", "비용코드", "주문 정보", "확인"];

export function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex items-center justify-between text-xs sm:text-sm">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const state = stepNum === step ? "current" : stepNum < step ? "done" : "todo";
        return (
          <li key={label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full font-medium ${
                  state === "done"
                    ? "bg-brand-600 text-white"
                    : state === "current"
                      ? "border-2 border-brand-600 text-brand-700"
                      : "border border-gray-300 text-gray-400"
                }`}
              >
                {state === "done" ? "✓" : stepNum}
              </span>
              <span className={state === "todo" ? "text-gray-400" : "text-gray-700"}>{label}</span>
            </div>
            {stepNum < STEP_LABELS.length && (
              <div className={`mx-1 h-px flex-1 ${state === "done" ? "bg-brand-600" : "bg-gray-200"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
