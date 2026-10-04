/** @type {import('next').NextConfig} */

// 운영(Docker)에서는 Tunnel이 web 컨테이너 하나만 바라보고, /api 요청은 여기서
// 같은 컨테이너 네트워크의 api 서비스로 넘긴다. 이 값은 빌드 시점에 고정된다.
// 로컬 개발은 NEXT_PUBLIC_API_BASE_URL로 API에 직접 붙으므로 이 경로를 타지 않는다.
const apiInternalUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    // 청첩장 자동 채우기(AI 분석)와 모바일 사진 업로드가 기본 30초를 넘길 수 있다.
    proxyTimeout: 120_000,
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiInternalUrl}/api/:path*` },
    ];
  },
};

module.exports = nextConfig;
