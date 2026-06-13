# 🔐 새 앱에 구글 로그인 붙이는 레시피 (복붙용)

새 앱을 만들 때, 이 travel-mate와 똑같은 "허락된 구글 계정만 접근" 로그인을
붙이고 싶을 때 쓰는 명령입니다.

> ⚠️ 새 앱에서 Claude Code를 새로 열면 그 세션은 **이 저장소도, 지난 대화도 모릅니다.**
> 오직 "그 앱 폴더의 파일 + 내가 입력한 명령"만 봐요. 그래서 필요한 값을 아래 명령에
> **직접 박아넣었습니다.** 알아서 찾으라고 시키면 못 합니다.

---

## 1) 새 앱에서 Claude Code를 열고, 아래를 통째로 복사해서 붙여넣으세요

빈칸은 **배포 주소 1개**뿐입니다.

```
이 앱에 "허락된 구글 계정만 접근" 로그인을 붙여줘. 나는 코딩 초보야. 아래 값은 그대로 써.

[그대로 쓸 값들]
- Firebase 프로젝트: fire-station-6c2b2
- 웹 OAuth 클라이언트 ID: 264965329371-ivfa61qcv81619t8vr42hpvcb0bg5mv5.apps.googleusercontent.com
- 관리자 이메일: cuucuu877@gmail.com
- 허용 명단 노드: allowedEmails (다른 앱과 공유, 값은 반드시 true 형식 = .val() === true)
- 이 앱 배포 주소: ____________   ← 여기만 내가 채움 (예: https://○○○.pages.dev)
- 이 앱이 쓰는 DB 노드 이름: 코드의 ref(db,'...')에서 찾아줘. 없으면 나한테 한 번 물어봐.

[기술 제약 — 반드시]
- 로그인은 Google Identity Services(accounts.google.com/gsi/client)로 ID 토큰을 받아
  signInWithCredential()로 처리. signInWithPopup/Redirect는 회사 방화벽 때문에 금지.
- 관리자는 명단이 비어도 항상 접근 + 명단 관리 권한.
- 허용 명단은 allowedEmails에 true로 저장(객체 저장 금지).
- 로그인/권한 확인 전에는 데이터 화면과 Firebase 접근이 마운트되지 않게 게이트로 막을 것.
- 헤더에 로그아웃 + 관리자 전용 "사용자 관리" 창 넣을 것.

[보안 규칙 — 중요]
- 내가 잠시 후 지금 콘솔에 있는 현재 규칙 전체를 붙여줄게. 그걸 그대로 보존하고
  이 앱 노드만 잠그도록 "병합"해서, 복붙용 최종 JSON 전체를 만들어줘.
  다른 앱 노드(household, data, geumo 등)는 절대 바꾸지 마.
- 혹시 내가 현재 규칙을 안 줬으면, 먼저 "현재 Realtime Database 규칙을 복사해서 붙여달라"고
  나한테 요청해. 추측해서 덮어쓰지 마.

[끝나고]
- 빌드 확인하고 커밋·푸시해줘.
- 내가 콘솔에서 할 일(구글 로그인 켜기 / 승인된 JavaScript 원본에 주소 추가 / 규칙 붙여넣기)을
  AUTH_SETUP.md로 저장하고, 그 내용 전체를 채팅 화면에도 펼쳐서 보여줘.
  특히 붙여넣을 최종 규칙 JSON과 추가할 주소는 복사 가능하게 화면에 출력해.
```

---

## 2) 그다음 순서 (초보용)

1. 위 명령 붙여넣고 **배포 주소 1칸**만 채워서 보내기
2. 에이전트가 **"현재 규칙을 붙여달라"** 하면 → Firebase 콘솔
   (Realtime Database → 규칙 탭) 내용을 복사해서 채팅에 붙여주기
3. 에이전트가 화면에 띄워준 **설정 3가지**를 콘솔에서 하기:
   - **Firebase** → Authentication → Google 로그인 켜고 저장
   - **Google Cloud 콘솔** → OAuth 클라이언트의 "승인된 JavaScript 원본"에 새 앱 주소 추가
     (https://console.cloud.google.com/apis/credentials?project=fire-station-6c2b2)
   - **Firebase** → Realtime Database → 규칙 탭에 최종 JSON 붙여넣고 게시
4. 새 앱 주소로 접속 → 관리자 계정으로 로그인 → 👥 사용자에서 사람 추가

---

## 3) 꼭 기억할 점

- **허용 명단(allowedEmails)은 모든 앱이 공유**합니다. 한 곳에서 추가하면
  그 사람은 명단을 쓰는 모든 앱(가계부·여행 등)에 접근할 수 있어요.
- 명단 값은 반드시 **`true`** 형식이어야 해요. (다른 앱 규칙이 `.val() === true`로 검사)
- 회사 PC 방화벽 때문에 **반드시 GIS + signInWithCredential 방식**이어야 합니다.
  (firebaseapp.com 팝업/리다이렉트는 막혀서 안 됨)
- 같은 Firebase 프로젝트면 **클라이언트 ID는 위에 적힌 것과 같습니다.**
  Google Cloud 콘솔에서 그 클라이언트에 **새 주소만 추가**하면 돼요.

---

## 참고: 이 travel-mate 앱의 구현 위치

새 앱에서 막히면 이 파일들을 똑같이 따라 만들면 됩니다.

- `src/auth/authConfig.js` — 클라이언트 ID·관리자 이메일·이메일 키 변환
- `src/auth/AuthContext.jsx` — GIS 로드 + 로그인 + 권한 확인
- `src/components/LoginGate.jsx` — 로그인 전 데이터 차단 화면
- `src/components/UserAdmin.jsx` — 관리자 전용 사용자 관리 창
- `src/firebase.js` — `getAuth` 추가
- `src/App.jsx` — `<AuthProvider><LoginGate>…</LoginGate></AuthProvider>` 로 감싸기
- `database.rules.json` — 이 앱 노드만 잠그고 나머지 보존
