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
* `src/index.ts` : Worker 진입점

## 개발
```bash
npm install
npm run dev       # 빌드 후 http://localhost:8787
npm run check     # lint + typecheck + test
npm run balance   # 옵션 강도 다시 맞추기 (약 1분)
```
* `npm run balance` 결과의 `tuning` 값은 `src/game.ts` 의 `DEFAULT_TUNING` 에 직접 옮겨야 함

## 배포
* `main` push 시 `.github/workflows/deploy.yml` 이 `wrangler deploy` 실행 (빌드 포함)
* GitHub repo secrets 필요 : `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
