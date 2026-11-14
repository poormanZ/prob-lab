# prob-theory-lab

연속 도전 기대값 시뮬레이션 데모. Cloudflare Worker(정적 자산 + `/health`)로 서빙함.

## 규칙
* 0단계에서 시작. 도전 성공 시 +1단계, 실패 시 0단계로 초기화
* n단계 성공확률 : `0.9^n` (1단계 90%, 2단계 81%, ...)
* n단계 상금 : `100 × 2^(n-1)`원 (1단계 100원). 실패 시 상금 0원
* 옵션 없을 때 기대값 최대 : 6단계 약 350원
* 성공할 때마다 옵션 3개 중 1개를 고름. 실패하면 옵션 모두 사라짐. 같은 옵션은 최대 3번

## 구조
* `src/game.ts` : 게임 규칙·옵션 정의 (서버, 페이지, 밸런스 스크립트가 같이 씀)
* `src/client/app.ts` : 페이지 스크립트 → `npm run build` 로 `dist/app.js` 생성
* `static/` : `index.html`, `style.css`
* `scripts/balance.ts` : 옵션 강도 자동 조절 → `src/balance-report.json` 저장
* `src/index.ts` : Worker 진입점. `/api/*`, `/auth/*` 처리, 나머지는 정적 파일
* `src/auth.ts`, `src/kakao.ts` : 카카오 로그인 → 세션 → 아이디 만들기
* `src/records.ts` : 유저별 최고 기록 저장, 랭킹 조회
* `src/client/account.ts` : 로그인 바, 기록 전송 (게임·랭킹 페이지 공용)
* `static/ranking.html` + `src/client/ranking.ts` : `/ranking` 페이지
* `migrations/` : D1(Cloudflare SQLite DB) 테이블

## 로그인·랭킹
* 흐름 : 카카오 로그인 → 처음이면 아이디 만들기 → 상금 받기를 누른 판만 기록 저장 (실패한 판은 안 남음)
* 기록 기준 : 상금 받은 단계가 높은 순 → 같으면 받은 상금(잭팟 포함)이 큰 순 → 같으면 먼저 달성한 순
* 아이디가 없는 유저는 랭킹에 안 나옴
* 카카오 사용자 ID와 토큰은 응답·로그에 안 남김. 세션 ID는 해시만 저장
* 한계 : 게임이 브라우저에서 돌아서 서버는 "불가능한 값"만 거름 (단계 1~20, 단계별 상금 상한 = 상금 옵션 최대치 × 잭팟 2배)

## 개발
```bash
npm install
cp .dev.vars.example .dev.vars   # 카카오 키 입력 (로그인 테스트할 때만)
npm run db:migrate:local         # 로컬 D1 테이블 생성
npm run dev       # 빌드 후 http://localhost:8787
npm run check     # lint + typecheck + test
npm run balance   # 옵션 강도 다시 맞추기 (약 1분)
```
* `npm run balance` 결과의 `tuning` 값은 `src/game.ts` 의 `DEFAULT_TUNING` 에 직접 옮겨야 함

## 배포
* `main` push 시 `.github/workflows/deploy.yml` 이 `wrangler deploy` 실행 (빌드 포함)
* GitHub repo secrets
  * 필수 : `CLOUDFLARE_API_TOKEN`(D1 Edit 권한 포함), `CLOUDFLARE_ACCOUNT_ID`
  * 로그인용 : `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`(카카오 앱에서 켠 경우만). 없으면 로그인만 꺼진 채 배포
* D1 `prob-theory-lab-db` 는 workflow가 없으면 만들고, migration도 자동 적용
* Kakao Developers 에 Redirect URI 등록 필요
  * `https://prob-theory-lab.darkq4.workers.dev/auth/kakao/callback`
  * `http://localhost:8787/auth/kakao/callback`
