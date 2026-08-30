import Image from "next/image";
import type { OccasionType, OrchidType } from "@/lib/types";

const OCCASION_IMAGE: Partial<Record<OccasionType, { src: string; alt: string }>> = {
  wedding: { src: "/occasion-references/wedding.png", alt: "축하화환 (결혼) 예시" },
  funeral: { src: "/occasion-references/funeral.jpg", alt: "근조화환 (부고) 예시" },
};

const ORCHID_IMAGE: Record<OrchidType, { src: string; alt: string }> = {
  oriental: { src: "/occasion-references/orchid-oriental.jpg", alt: "동양란 예시" },
  western: { src: "/occasion-references/orchid-western.jpg", alt: "서양란 예시" },
};

export function OccasionReferenceImage({
  occasionType,
  orchidType,
}: {
  occasionType: OccasionType;
  orchidType?: OrchidType;
}) {
  const image =
    occasionType === "opening" || occasionType === "promotion"
      ? orchidType
        ? ORCHID_IMAGE[orchidType]
        : null
      : OCCASION_IMAGE[occasionType] ?? null;

  if (!image) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[220px]">
        <Image src={image.src} alt={image.alt} fill className="object-contain" sizes="220px" />
      </div>
      <p className="border-t border-gray-200 bg-white py-1.5 text-center text-xs text-gray-500">
        참고 이미지 — 실제 상품과 다를 수 있습니다
      </p>
    </div>
  );
}
