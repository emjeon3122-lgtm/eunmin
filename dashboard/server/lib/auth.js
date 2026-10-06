// 로그인: 세션 쿠키, 임시 관리자 로그인(local), 회사 계정 SSO(OIDC, Microsoft Entra ID 등)
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const random = (n = 32) => b64url(crypto.randomBytes(n));

// ---- 비밀번호 (scrypt) -------------------------------------------------------
// 저장 형식: scrypt$N$r$p$salt$hash (tools/hash-password.js 로 만든다)
function hashPassword(password, { N = 16384, r = 8, p = 1 } = {}) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, { N, r, p });
  return ['scrypt', N, r, p, b64url(salt), b64url(hash)].join('$');
}
// 비동기 scrypt: 계산하는 동안 다른 요청을 막지 않는다.
async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await new Promise((resolve, reject) => crypto.scrypt(String(password), Buffer.from(salt, 'base64url'), expected.length,
    { N: Number(N), r: Number(r), p: Number(p) }, (err, key) => (err ? reject(err) : resolve(key))));
  return crypto.timingSafeEqual(actual, expected);
}

// ---- 쿠키·세션 -------------------------------------------------------------
function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookie(name, value, { maxAge, secure, sameSite = 'Lax', path = '/' } = {}) {
  return [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'HttpOnly', `SameSite=${sameSite}`,
    secure ? 'Secure' : null, maxAge != null ? `Max-Age=${maxAge}` : null].filter(Boolean).join('; ');
}

// 세션은 SESSION_SECRET 으로 암호화한 쿠키에 담는다(AES-256-GCM). 서버를 다시 켜도 로그인이 유지된다.
// 로그아웃한 세션은 만료 전까지 폐기 목록으로 막는다. revokedFile 을 주면 서버를 다시 켜도 목록이 유지된다.
function createSessions(ttlHours, secret, { revokedFile = '' } = {}) {
  if (!secret || String(secret).length < 32) throw new Error('SESSION_SECRET 은 32자 이상이어야 합니다 (예: openssl rand -base64 48).');
  const key = crypto.createHash('sha256').update(String(secret)).digest();
  const ttl = ttlHours * 3600 * 1000;
  const revoked = new Map(); // 토큰 해시 → 만료 시각
  const hashOf = (t) => crypto.createHash('sha256').update(t).digest('base64url');
  const prune = () => { const now = Date.now(); for (const [k, exp] of revoked) if (exp < now) revoked.delete(k); };
  if (revokedFile) {
    try { for (const [k, exp] of JSON.parse(fs.readFileSync(revokedFile, 'utf8'))) if (typeof k === 'string' && typeof exp === 'number') revoked.set(k, exp); } catch { /* 처음 켤 때는 파일이 없다 */ }
    prune();
  }
  const persist = () => {
    if (!revokedFile) return;
    const tmp = `${revokedFile}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...revoked]), { mode: 0o600 }); fs.renameSync(tmp, revokedFile);
  };
  setInterval(prune, 10 * 60 * 1000).unref();
  return {
    create(email, name, roles = []) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(JSON.stringify({ e: email, n: name, r: roles, x: Date.now() + ttl }), 'utf8'), c.final()]);
      return b64url(Buffer.concat([iv, body, c.getAuthTag()]));
    },
    get(token) {
      if (!token || typeof token !== 'string' || token.length > 4096 || revoked.has(hashOf(token))) return null;
      try {
        const raw = Buffer.from(token, 'base64url');
        const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
        d.setAuthTag(raw.subarray(raw.length - 16));
        const s = JSON.parse(Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString('utf8'));
        if (typeof s.x !== 'number' || s.x < Date.now()) return null;
        return { email: s.e, name: s.n, roles: Array.isArray(s.r) ? s.r : [], exp: s.x };
      } catch {
        return null; // 위조·손상된 쿠키
      }
    },
    destroy(token) { const s = this.get(token); if (s) { prune(); revoked.set(hashOf(token), s.exp); persist(); } },
    maxAgeSeconds: Math.floor(ttl / 1000),
  };
}

// 로그인 실패가 반복되면 잠시 막는다(무차별 대입 방지).
// - 주소별: 같은 주소에서 max 번 실패하면 windowMs 동안 막음
// - 전체: 주소를 바꿔 가며 시도해도 windowMs 안에 globalMax 번 실패하면 모두 막음
// - 기록하는 주소 수는 maxKeys 까지(넘으면 오래된 것부터 지움) — 메모리가 끝없이 늘지 않게
function createLimiter({ max = 10, globalMax = 100, windowMs = 15 * 60 * 1000, maxKeys = 10000 } = {}) {
  const hits = new Map();
  let global = { count: 0, first: Date.now() };
  const fresh = (h) => Date.now() - h.first < windowMs;
  return {
    blocked(key) {
      if (fresh(global) && global.count >= globalMax) return true;
      const h = hits.get(key); return !!h && h.count >= max && fresh(h);
    },
    fail(key) {
      if (!fresh(global)) global = { count: 0, first: Date.now() };
      global.count++;
      const h = hits.get(key);
      if (!h || !fresh(h)) { hits.delete(key); hits.set(key, { count: 1, first: Date.now() }); } else h.count++;
      while (hits.size > maxKeys) hits.delete(hits.keys().next().value);
    },
    reset(key) { hits.delete(key); },
  };
}

// ---- OIDC (Authorization Code + PKCE) ---------------------------------------
const MAX_PENDING_LOGINS = 5000;
function createOidc({ issuer, clientId, clientSecret, redirectUri, tenantId, allowedDomains = [], fetchImpl = fetch }) {
  let discovery = null; let discoveredAt = 0;
  let jwks = null;
  const pending = new Map(); // state → { nonce, verifier, exp }

  async function getJson(url, init) {
    const res = await fetchImpl(url, init);
    if (!res.ok) throw new Error(`OIDC 요청 실패 (${res.status})`);
    return res.json();
  }
  async function meta() {
    if (!discovery || Date.now() - discoveredAt > 3600 * 1000) {
      discovery = await getJson(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
      discoveredAt = Date.now(); jwks = null;
    }
    return discovery;
  }
  async function keyFor(kid) {
    const m = await meta();
    if (!jwks || !jwks.keys.some((k) => k.kid === kid)) jwks = await getJson(m.jwks_uri);
    const jwk = jwks.keys.find((k) => k.kid === kid && k.kty === 'RSA');
    if (!jwk) throw new Error('서명 키를 찾을 수 없습니다.');
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }

  async function verifyIdToken(idToken, nonce) {
    const [h, p, sig] = String(idToken).split('.');
    if (!h || !p || !sig) throw new Error('ID 토큰 형식 오류');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    if (header.alg !== 'RS256') throw new Error('허용하지 않는 서명 방식');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), await keyFor(header.kid), Buffer.from(sig, 'base64url'));
    if (!ok) throw new Error('ID 토큰 서명 오류');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    const m = await meta();
    if (claims.iss !== m.issuer) throw new Error('발급자 불일치');
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(clientId)) throw new Error('대상 불일치');
    if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new Error('만료된 토큰');
    if (typeof claims.nbf === 'number' && claims.nbf > now + 60) throw new Error('아직 유효하지 않은 토큰');
    if (claims.nonce !== nonce) throw new Error('nonce 불일치');
    if (tenantId && claims.tid !== tenantId) throw new Error('다른 조직의 계정입니다.');
    return claims;
  }

  return {
    async startUrl() {
      const m = await meta();
      const state = random(); const nonce = random(); const verifier = random(48);
      const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
      for (const [k, v] of pending) if (v.exp < Date.now()) pending.delete(k);
      // 로그인 화면만 계속 여는 요청으로 메모리가 늘지 않게 진행 중인 로그인 수를 제한(오래된 것부터 지움)
      while (pending.size >= MAX_PENDING_LOGINS) pending.delete(pending.keys().next().value);
      pending.set(state, { nonce, verifier, exp: Date.now() + 10 * 60 * 1000 });
      const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'openid profile email',
        state, nonce, code_challenge: challenge, code_challenge_method: 'S256', response_mode: 'query' });
      return { url: `${m.authorization_endpoint}?${q}`, state };
    },
    async finish(code, state) {
      const p = pending.get(state);
      pending.delete(state);
      if (!p || p.exp < Date.now()) throw new Error('로그인 요청이 만료되었습니다. 다시 시도해 주세요.');
      const m = await meta();
      const tokens = await getJson(m.token_endpoint, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId,
          client_secret: clientSecret, code_verifier: p.verifier }),
      });
      const claims = await verifyIdToken(tokens.id_token, p.nonce);
      const email = String(claims.email || claims.preferred_username || claims.upn || '').toLowerCase();
      if (!email) throw new Error('계정 이메일을 확인할 수 없습니다.');
      if (allowedDomains.length && !allowedDomains.includes(email.split('@').pop())) throw new Error('허용된 회사 계정이 아닙니다.');
      const roles = Array.isArray(claims.roles) ? claims.roles.map(String) : [];
      return { email, name: String(claims.name || email), roles };
    },
  };
}

module.exports = { hashPassword, verifyPassword, parseCookies, cookie, createSessions, createLimiter, createOidc, random };
