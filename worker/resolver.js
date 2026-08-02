// travel-mate 링크 리졸버 (Cloudflare Worker)
//
// 구글맵 짧은 링크(maps.app.goo.gl 등)는 좌표가 숨겨진 리다이렉트 링크라
// 브라우저에서는 CORS 때문에 펼칠 수 없다. 이 Worker 가 서버 쪽에서
// 리다이렉트를 따라가 최종(긴) URL 을 돌려준다.
//
// 사용법:  GET https://<worker-주소>/?u=<짧은링크를 encodeURIComponent 한 값>
// 응답:    { "finalUrl": "https://www.google.com/maps/place/.../@lat,lng..." }
//
// 배포:    cd worker && npx wrangler deploy

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const target = new URL(request.url).searchParams.get('u');
    if (!target) {
      return json({ error: 'missing "u" query param' }, 400);
    }
    // 안전장치: http(s) 링크만 허용
    if (!/^https?:\/\//i.test(target)) {
      return json({ error: 'invalid url' }, 400);
    }

    try {
      // 리다이렉트를 수동으로 따라가며 최종 URL 을 찾는다.
      // (본문 다운로드 없이 Location 헤더만 읽어 가볍고 빠르다.)
      // 실제 모바일 브라우저처럼 보이게 해서 구글의 봇 감지(/sorry 캡차)를 최대한 피한다.
      const browserHeaders = {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
          '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      };
      let current = target;
      let finalUrl = target;
      for (let i = 0; i < 5; i++) {
        const res = await fetch(current, {
          redirect: 'manual',
          headers: browserHeaders,
        });
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
          finalUrl = new URL(loc, current).toString();
          current = finalUrl;
          continue;
        }
        finalUrl = res.url || finalUrl;
        break;
      }
      return json({ finalUrl });
    } catch (err) {
      return json({ error: String(err) }, 502);
    }
  },
};
