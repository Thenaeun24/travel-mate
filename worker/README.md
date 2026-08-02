# travel-mate 링크 리졸버 (Cloudflare Worker)

구글맵 짧은 링크(`maps.app.goo.gl` 등)는 좌표가 숨겨진 리다이렉트 링크라,
브라우저에서는 CORS 때문에 직접 펼칠 수 없다. 이 Worker 가 서버 쪽에서
리다이렉트를 따라가 최종(긴) URL 을 돌려준다.

설정 파일(`wrangler.toml`)은 레포 **루트**에 있고, 이 파일이 `worker/resolver.js`
를 가리킨다.

## 배포 방법 1 — 컴퓨터 (wrangler CLI)

레포 루트에서:

```bash
npx wrangler login   # 처음 한 번만
npx wrangler deploy
```

배포가 끝나면 아래 같은 주소가 출력된다:

```
https://travel-mate-resolver.<계정이름>.workers.dev
```

## 배포 방법 2 — 휴대폰 (GitHub 연결, 타이핑 없음)

코드를 손으로 입력할 필요 없이, Cloudflare 대시보드에서 이 GitHub 레포를
연결하면 루트의 `wrangler.toml` 을 읽어 자동 배포한다.

1. Cloudflare 대시보드 → **Workers & Pages** → **Create**
2. **Import a repository**(GitHub 연결) → `Thenaeun24/travel-mate` 선택
3. 브랜치 `main`, 배포 명령은 기본값 `npx wrangler deploy` 그대로 → 저장/배포
4. 나온 `...workers.dev` 주소를 앱 환경변수에 연결

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
