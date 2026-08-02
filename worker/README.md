# travel-mate 링크 리졸버 (Cloudflare Worker)

구글맵 짧은 링크(`maps.app.goo.gl` 등)는 좌표가 숨겨진 리다이렉트 링크라,
브라우저에서는 CORS 때문에 직접 펼칠 수 없다. 이 Worker 가 서버 쪽에서
리다이렉트를 따라가 최종(긴) URL 을 돌려준다.

## 배포

이미 Cloudflare 계정과 `wrangler` 로그인이 돼 있다면:

```bash
cd worker
npx wrangler deploy
```

처음이라면 로그인부터:

```bash
npx wrangler login
```

배포가 끝나면 아래 같은 주소가 출력된다:

```
https://travel-mate-resolver.<계정이름>.workers.dev
```

## 앱에 연결

프로젝트 루트의 `.env` 에 위 주소를 넣고 다시 빌드/배포한다:

```
VITE_LINK_RESOLVER_URL=https://travel-mate-resolver.<계정이름>.workers.dev
```

- 이 값이 있으면 앱은 짧은 링크를 이 Worker 로 펼친다(1순위).
- 비워두거나 Worker 가 실패하면 공용 프록시(allorigins)로 자동 폴백한다.

## 동작 확인

```
https://travel-mate-resolver.<계정이름>.workers.dev/?u=https%3A%2F%2Fmaps.app.goo.gl%2F<짧은코드>
```

→ `{ "finalUrl": "https://www.google.com/maps/place/.../@lat,lng..." }`

## 무료 한도

Cloudflare Workers 무료 플랜: 하루 100,000 요청. 개인용으로는 충분하다.
