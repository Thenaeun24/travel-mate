# 로그인 인증 설정 가이드 (왕초보용)

여행앱에 "허용된 구글 계정만 접근" 로그인을 붙였습니다.
**코드는 다 작업했고**, 아래 3가지는 웹사이트(콘솔)에서 직접 한 번만 켜주면 됩니다.
순서대로 따라 하세요. 다 하는 데 5~10분이면 됩니다.

---

## ✅ 1단계 — Firebase에서 구글 로그인 켜기

1. https://console.firebase.google.com 접속 → 프로젝트 **`fire-station-6c2b2`** 선택
2. 왼쪽 메뉴 **빌드(Build) → Authentication** 클릭 → 처음이면 **시작하기** 버튼
3. 위쪽 **Sign-in method** 탭 → 목록에서 **Google** 클릭
4. 오른쪽 위 **사용 설정(Enable)** 토글을 켜고, 지원 이메일을 고른 뒤 **저장**

> 이걸 켜야 구글 계정으로 Firebase에 로그인할 수 있습니다.

---

## ✅ 2단계 — 승인된 사이트 주소 등록 (제일 중요)

구글이 "이 사이트에서만 로그인 버튼을 허용"하도록 주소를 등록해야 합니다.
이게 빠지면 로그인 버튼이 안 뜨거나 에러가 납니다.

1. https://console.cloud.google.com/apis/credentials 접속
   (오른쪽 위 프로젝트가 **fire-station-6c2b2**인지 확인)
2. **OAuth 2.0 클라이언트 ID** 목록에서 우리가 쓰는 웹 클라이언트를 클릭
   (ID가 `264965329371-ivfa61qcv81619t8vr42hpvcb0bg5mv5...`로 시작하는 것)
3. **승인된 JavaScript 원본(Authorized JavaScript origins)** 항목에서 **+ URI 추가**로
   아래 두 개를 정확히 입력하고 **저장**:

   ```
   https://travel-mate-epg.pages.dev
   http://localhost:5173
   ```

   주의사항:
   - 주소 **끝에 슬래시(/)나 /schedule 같은 경로를 붙이지 마세요.** (원본은 도메인까지만)
   - `https://travel-mate-epg.pages.dev` → 실제 접속 주소 (필수)
   - `http://localhost:5173` → 내 PC에서 테스트할 때 (선택, 있어도 무방)

> 저장 후 적용까지 보통 몇 분, 길게는 몇십 분 걸릴 수 있어요. 로그인 버튼이 안 뜨면
> 잠깐 기다렸다가 새로고침해 보세요.

---

## ✅ 3단계 — 데이터베이스 보안 규칙 적용

지금 쓰고 계신 **기존 규칙을 그대로 보존**하고, 열려 있던 `travel-mate-app` 칸만
잠그도록 합쳤습니다. (가계부 앱이 쓰는 `household`, 공유 명단 `allowedEmails`,
`data`, `geumo`는 **기존과 100% 동일**, 손대지 않았습니다.)

1. Firebase 콘솔 → **빌드 → Realtime Database** → 위쪽 **규칙(Rules)** 탭
2. 저장소의 **`database.rules.json`** 파일 내용을 **전체 복사**해서 규칙 칸에 통째로 붙여넣기
3. **게시(Publish)** 클릭

이 규칙이 하는 일:
- `travel-mate-app` (여행 데이터): **`true`→잠금으로 변경.** 로그인 + (관리자 또는 허용 명단)만 읽기/쓰기
- `household`, `allowedEmails`, `data`, `geumo`: **기존 그대로 유지** (변경 없음)

> ⚠️ **`allowedEmails`는 가계부(household) 앱과 함께 쓰는 공유 명단입니다.**
> 즉 여기에 사람을 추가하면 **가계부 앱과 여행 앱 둘 다** 접근이 허용됩니다.
> 명단 값은 반드시 `true` 형식이어야 하며(가계부 규칙이 `.val() === true`로 검사),
> 앱의 👥 사용자 기능도 `true`로 저장하도록 맞춰놨습니다.

### 규칙이 제대로 됐는지 테스트 (콘솔의 Rules Playground)
규칙 탭의 **시뮬레이터(Playground)**에서:
- 위치 `/travel-mate-app`, 인증 안 함(unauthenticated) → **읽기 거부(denied)** 떠야 정상 ✅
- 위치 `/household`, 인증 안 함 → **읽기 거부(denied)** (기존과 동일) ✅
- 위치 `/data`, 인증 안 함 → **읽기 허용(allowed)** (기존과 동일) ✅

---

## 🔑 사람 추가/삭제하는 법 (코드 수정 불필요)

1. 관리자 계정(**cuucuu877@gmail.com**)으로 앱에 로그인
2. 화면 오른쪽 위 **👥 사용자** 버튼 클릭
3. 허용할 사람의 구글 이메일을 입력하고 **추가** → 그 사람은 바로 로그인 가능
4. **삭제**를 누르면 접근 차단

> 관리자 본인은 명단에 없어도 항상 접근됩니다. (명단이 비어 있어도 잠기지 않게 안전장치)
> 명단은 가계부(household) 앱과 공유되므로, 추가/삭제 시 두 앱 모두에 반영됩니다.

---

## ❓ 자주 나는 문제

- **로그인 버튼이 안 떠요** → 2단계 주소 등록이 아직 반영 안 됐을 수 있어요. 몇 분 뒤 새로고침.
- **로그인은 됐는데 "접근 권한이 없습니다"** → 관리자가 그 이메일을 👥 사용자에서 추가해야 해요.
- **다른 앱이 갑자기 안 돼요** → 3단계 규칙을 `database.rules.json` 내용 그대로(전체) 붙여넣었는지 확인.
  기존 `household`/`data`/`geumo`/`allowedEmails` 블록이 빠지면 그 앱들이 막힙니다.
- **회사 PC에서 로그인 안 돼요** → 이 방식(GIS + signInWithCredential)은 firebaseapp.com을
  안 쓰므로 방화벽을 통과합니다. 그래도 안 되면 `accounts.google.com`,
  `identitytoolkit.googleapis.com` 접속이 막혔는지 확인하세요.
