// 로그인 관련 단위 확인(가짜 IdP, 네트워크 없음): node tests/auth.cjs
'use strict';
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { parseCookies, createLimiter, createOidc } = require('../lib/auth');

(async () => {
  // 깨진 쿠키(다른 서비스가 심은 '%')가 있어도 나머지 쿠키는 읽힌다
  assert.deepEqual(parseCookies('other=%; sid=abc; x=%E0%A4%A'), { sid: 'abc' });

  // 횟수 제한: 확인 전에 세므로 동시에 보내도 max 번까지만 통과
  const lim = createLimiter({ max: 3, globalMax: 100 });
  let passed = 0;
  for (let i = 0; i < 20; i++) if (!lim.blocked('ip')) { lim.fail('ip'); passed++; }
  assert.equal(passed, 3, '동시 시도도 횟수 제한');

  // 가짜 IdP: 토큰 요청 때 nonceFor 에 지정한 nonce·claims 로 ID 토큰을 만든다
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const ISS = 'https://idp.test'; let claims = {}; let nonce = '';
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sign = (c) => { const h = b64({ alg: 'RS256', kid: 'k1' }); const p = b64(c); return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`; };
  const fetchImpl = async (url) => {
    const ok = (o) => ({ ok: true, json: async () => o });
    if (url.endsWith('/.well-known/openid-configuration')) return ok({ issuer: ISS, authorization_endpoint: `${ISS}/auth`, token_endpoint: `${ISS}/token`, jwks_uri: `${ISS}/jwks` });
    if (url.endsWith('/jwks')) return ok({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1' }] });
    if (url.endsWith('/token')) return ok({ id_token: sign({ iss: ISS, aud: 'c1', exp: Math.floor(Date.now() / 1000) + 300, nonce, tid: 't1', ...claims }) });
    throw new Error(`unexpected ${url}`);
  };
  const oidc = createOidc({ issuer: ISS, clientId: 'c1', clientSecret: 's', redirectUri: 'https://app/cb', tenantId: 't1', allowedDomains: ['bdo.kr'], secret: 'x'.repeat(40), fetchImpl });
  const start = async () => { const r = await oidc.startUrl(); const q = new URL(r.url).searchParams; return { state: q.get('state'), nonce: q.get('nonce'), cookie: r.cookie }; };
  const finish = (s, c = {}) => { claims = c; nonce = s.nonce; return oidc.finish('code', s.state, s.cookie); };

  // 로그인 화면을 대량으로 열어도 진행 중인 로그인은 그대로 끝난다(서버에 로그인 상태를 쌓지 않음)
  const victim = await start();
  for (let i = 0; i < 6000; i++) await oidc.startUrl();
  const who = await finish(victim, { email: 'Kim@BDO.kr', roles: ['Admin'] });
  assert.deepEqual([who.email, who.roles], ['kim@bdo.kr', ['Admin']]);
  await assert.rejects(finish(victim, { email: 'kim@bdo.kr' }), /이미 사용한/, '같은 로그인 응답은 한 번만');

  const s = await start();
  await assert.rejects(oidc.finish('code', s.state, s.cookie.slice(0, -2) + 'AA'), /만료/, '변조한 로그인 쿠키 거부');
  await assert.rejects(oidc.finish('code', (await start()).state, s.cookie), /만료/, '다른 로그인의 state 거부');
  for (const email of ['x@evil.com@bdo.kr', 'x@bdo.kr.evil.com', 'x@sub.bdo.kr', '@bdo.kr', 'x y@bdo.kr']) {
    await assert.rejects(finish(await start(), { email }), /이메일|회사 계정/, `거부: ${email}`);
  }
  console.log('PASS');
})().catch((e) => { console.error(e); process.exit(1); });
