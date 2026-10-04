import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { Readable } from 'stream';
import * as zlib from 'zlib';

// 직원이 입력한 외부 주소(청첩장 링크 등)를 서버가 대신 열어볼 때 쓰는 안전한 fetch.
//
// 서버는 NAS 안에서 돌기 때문에, 그냥 fetch하면 "http://192.168.0.1" 같은 주소로
// 회사 내부망 장비(NAS 관리 화면, 공유기, 같은 Docker 망의 다른 컨테이너 등)에
// 접속하는 통로가 된다(SSRF). 그래서 공인 인터넷 주소에만 접속하도록 막는다.
//
// - 주소 검사는 실제로 연결하는 순간의 DNS 결과로 한다(검사 뒤 DNS 값을 바꿔치기하는
//   DNS rebinding 우회를 막기 위해 http 모듈의 lookup 단계에서 거른다).
// - 리다이렉트도 한 단계씩 같은 검사를 거친다.
// - http/https, 기본 포트(80/443)만 허용하고, 응답 크기·시간을 제한한다.

export class BlockedUrlError extends Error {}

// 공인 인터넷이 아닌 주소 대역(사설망·루프백·링크로컬·예약 대역 등).
// IPv4가 숨어 있는 IPv6(::ffff:10.0.0.1 등)는 BlockList가 IPv4 규칙으로 함께 검사한다.
const BLOCKED_RANGES: Array<[string, number, 'ipv4' | 'ipv6']> = [
  ['0.0.0.0', 8, 'ipv4'], // "이 네트워크"
  ['10.0.0.0', 8, 'ipv4'], // 사설망
  ['100.64.0.0', 10, 'ipv4'], // 통신사 공유 주소(CGNAT)
  ['127.0.0.0', 8, 'ipv4'], // 루프백
  ['169.254.0.0', 16, 'ipv4'], // 링크로컬(클라우드 메타데이터 포함)
  ['172.16.0.0', 12, 'ipv4'], // 사설망(Docker 기본 망 포함)
  ['192.0.0.0', 24, 'ipv4'], // IETF 예약
  ['192.0.2.0', 24, 'ipv4'], // 문서용
  ['192.88.99.0', 24, 'ipv4'], // 6to4 중계(폐지)
  ['192.168.0.0', 16, 'ipv4'], // 사설망
  ['198.18.0.0', 15, 'ipv4'], // 벤치마크용
  ['198.51.100.0', 24, 'ipv4'], // 문서용
  ['203.0.113.0', 24, 'ipv4'], // 문서용
  ['224.0.0.0', 4, 'ipv4'], // 멀티캐스트
  ['240.0.0.0', 4, 'ipv4'], // 예약(브로드캐스트 포함)
  ['::', 128, 'ipv6'], // 미지정
  ['::1', 128, 'ipv6'], // 루프백
  ['64:ff9b::', 96, 'ipv6'], // NAT64(내부 IPv4로 우회 가능)
  ['64:ff9b:1::', 48, 'ipv6'], // 로컬 NAT64
  ['100::', 64, 'ipv6'], // 폐기용
  ['2001::', 23, 'ipv6'], // IETF 예약(Teredo 포함)
  ['2001:db8::', 32, 'ipv6'], // 문서용
  ['2002::', 16, 'ipv6'], // 6to4(내부 IPv4로 우회 가능)
  ['fc00::', 7, 'ipv6'], // 사설망(ULA)
  ['fe80::', 10, 'ipv6'], // 링크로컬
  ['fec0::', 10, 'ipv6'], // 사이트로컬(폐지)
  ['ff00::', 8, 'ipv6'], // 멀티캐스트
];

const BLOCK_LIST = new net.BlockList();
for (const [address, prefix, family] of BLOCKED_RANGES) {
  BLOCK_LIST.addSubnet(address, prefix, family);
}

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return false;
  return !BLOCK_LIST.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

// 연결 직전에 호출되는 DNS 조회. 조회된 주소 중 하나라도 내부 주소면 연결 자체를 거부한다.
const publicOnlyLookup = ((
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) {
      return callback(new BlockedUrlError(`내부망 주소로는 접속할 수 없습니다: ${hostname}`), '');
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}) as net.LookupFunction;

const ALLOWED_PORTS = new Set(['', '80', '443']);
const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  userAgent: string;
}

// 주소가 접속해도 되는 형태인지 확인한다(IP를 직접 쓴 주소는 DNS 조회가 없으므로 여기서 거른다).
export function assertFetchableUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError('주소 형식이 올바르지 않습니다.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError(`http/https 주소만 열 수 있습니다: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new BlockedUrlError('계정 정보가 들어간 주소는 열 수 없습니다.');
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new BlockedUrlError(`기본 포트(80/443)만 허용합니다: ${url.port}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isPublicAddress(host)) {
    throw new BlockedUrlError(`내부망 주소로는 접속할 수 없습니다: ${host}`);
  }
  return url;
}

// 공인 인터넷의 웹페이지를 텍스트로 받아온다. 크기 한도를 넘는 부분은 잘라낸다.
export async function fetchPublicText(raw: string, options: SafeFetchOptions): Promise<string> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  let url = assertFetchableUrl(raw);

  for (let redirects = 0; ; redirects++) {
    const res = await request(url, options, signal);
    const status = res.statusCode ?? 0;

    if (status >= 300 && status < 400 && res.headers.location) {
      res.destroy();
      if (redirects >= options.maxRedirects) throw new Error('리다이렉트가 너무 많습니다.');
      url = assertFetchableUrl(new URL(res.headers.location, url));
      continue;
    }
    if (status < 200 || status >= 300) {
      res.destroy();
      throw new Error(`HTTP ${status}`);
    }

    const contentType = (res.headers['content-type'] ?? '').toLowerCase();
    if (contentType && !ALLOWED_CONTENT_TYPES.some((t) => contentType.startsWith(t))) {
      res.destroy();
      throw new Error(`웹페이지가 아닌 응답입니다: ${contentType}`);
    }

    const body = await readLimited(decompress(res), options.maxBytes);
    return decodeText(body, contentType);
  }
}

function request(url: URL, options: SafeFetchOptions, signal: AbortSignal): Promise<http.IncomingMessage> {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(url, {
      method: 'GET',
      lookup: publicOnlyLookup,
      // 연결을 재사용하지 않는다 — 매 요청이 위 lookup 검사를 반드시 거치게 한다.
      agent: false,
      signal,
      headers: {
        'User-Agent': options.userAgent,
        Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    req.on('response', resolve);
    req.on('error', reject);
    req.end();
  });
}

function decompress(res: http.IncomingMessage): Readable {
  const encoding = (res.headers['content-encoding'] ?? '').toLowerCase().trim();
  const decoder =
    encoding === 'gzip' || encoding === 'x-gzip'
      ? zlib.createGunzip()
      : encoding === 'deflate'
        ? zlib.createInflate()
        : encoding === 'br'
          ? zlib.createBrotliDecompress()
          : null;
  if (!decoder) return res;
  res.on('error', (err) => decoder.destroy(err));
  return res.pipe(decoder);
}

// 압축을 푼 뒤 크기로 제한한다(작은 압축 파일이 거대하게 풀리는 경우 대비).
// 한도를 넘으면 거기서 읽기를 멈추고 받은 데까지만 쓴다.
async function readLimited(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const buf = chunk as Buffer;
      const remaining = maxBytes - total;
      if (buf.length >= remaining) {
        chunks.push(buf.subarray(0, remaining));
        total = maxBytes;
        break;
      }
      chunks.push(buf);
      total += buf.length;
    }
  } finally {
    stream.destroy();
  }
  return Buffer.concat(chunks, total);
}

// 헤더나 <meta>에 적힌 문자 인코딩(예: 예전 한국 사이트의 euc-kr)으로 글자를 읽는다.
function decodeText(body: Buffer, contentType: string): string {
  const declared =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(body.subarray(0, 4096).toString('latin1'))?.[1];
  try {
    return new TextDecoder(declared ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}
