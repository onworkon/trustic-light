# 신뢰등

사용자가 선택한 웹 글의 표현·출처·논거를 Claude로 분석하고, 신호등과 문장별 설명으로 보여주는 Chrome Manifest V3 확장 프로그램입니다. 분석은 사용자가 버튼을 누르고 본문 전송에 동의한 경우에만 실행됩니다. 사실 확인이나 진위 보증 서비스가 아닙니다.

[GitHub 저장소](https://github.com/onworkon/trustic-light) · [자동 검사](https://github.com/onworkon/trustic-light/actions/workflows/ci.yml)

## 실행과 배포

Node.js 22 이상이 필요합니다. 런타임 외부 라이브러리는 없으며 개발 도구 버전은 `package-lock.json`에 고정합니다.

```powershell
npm ci
npm run check
npm run package
```

Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드**하여 **`dist` 폴더**를 선택합니다. 프로젝트 루트는 소스 프로젝트이며 로드 대상이 아닙니다. 최소 Chrome 버전은 120입니다.

설정에서 본인의 Anthropic API 키를 입력하고 전송 안내를 확인한 뒤 저장합니다. 웹페이지를 새로고침하고 신호등 → **이 글 분석하기**를 누릅니다. 문장별 설명을 누르면 해당 본문으로 이동합니다. 손잡이는 드래그와 방향키로 이동할 수 있습니다. 툴바의 확장 아이콘은 설정을 엽니다.

- `npm run typecheck`: 엄격한 TypeScript 검사
- `npm run check:repo`: 업로드 대상과 Git 인덱스의 비공개 파일·키 형식 검사
- `npm test`: 분석·입력 검증·본문 추출·보안·취소·동시 요청 회귀 테스트
- `npm run build`: `dist/` 생성 및 허용 파일·비밀 키·매니페스트 검사
- `npm run format`: 소스 포맷 정리
- `npm run package`: 전체 검사 후 `release/trustlight-0.3.0.zip`과 SHA-256 파일 생성
- `npm run package:source`: 전체 검사 후 Git 업로드용 `release/trustlight-source-0.3.0.zip`과 SHA-256 파일 생성
- `node scripts/preview.mjs`: 빌드 후 로컬 UI 미리보기. 고정 모의 응답을 사용하며 실제 API 연결을 검증하지 않습니다.

## 코드 구조

| 경로              | 책임                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `src/background/` | 저장소 접근, 요청 권한 검증, 분석 동시성·취소, Anthropic 통신, 응답 검증 |
| `src/content/`    | 화면 표시, 사용자가 요청한 본문 추출, 인용 범위 강조, 페이지 수명 관리   |
| `src/options/`    | 키 등록·삭제, 연결 확인, 전송 동의, 개인정보 처리방침                    |
| `src/shared/`     | 타입, 한도, 메시지 처리                                                  |
| `scripts/`        | 빌드·배포 검증·ZIP·로컬 미리보기                                         |
| `tests/`          | 네트워크 비용이 없는 자동 회귀 테스트                                    |

확장 프로그램은 키를 콘텐츠 스크립트에 반환하지 않습니다. 저장소는 `TRUSTED_CONTEXTS`로 제한합니다. AI 응답은 HTML로 삽입하지 않으며 본문 인용을 다시 확인합니다. DOM을 감싸거나 수정하지 않고 CSS Custom Highlight API로 표시합니다.

한 페이지당 요청 1개, 전체 동시 요청 최대 2개, 재요청 간격 3초로 제한합니다. 유료 요청은 자동 재시도하지 않습니다. 분석은 최대 90초, 연결 확인은 최대 20초이며 취소 시 `AbortController`로 실제 통신을 중단합니다. 취소 전에 이미 처리된 API 사용량은 제공자가 청구할 수 있습니다. 본문·결과를 영구 저장하거나 동기화하지 않습니다.

## 기존 배포물과 보안

최초 작업 폴더에는 원본 TypeScript 프로젝트 대신 0.2.10 압축 번들만 있었습니다. 검토 후 기능을 모듈 단위 소스로 재구성했습니다. 원본 번들은 최초 작업 폴더의 `.archive/original-0.2.10/`에 보관하고 Git 저장소와 배포물에서 제외했습니다.

**최초 작업 폴더의 `private/bootstrap.json`에는 API 키가 들어 있습니다.** 이 파일은 원본 보존용으로 해당 폴더에만 남아 있으며 Git 저장소, 스토어 ZIP, 소스 ZIP에서 제외합니다. 새 코드에서는 읽지 않습니다. 최초 작업 폴더 전체를 임의로 압축해 업로드하지 마세요. 이전 패키지를 공유했다면 그 키를 Anthropic 콘솔에서 폐기하고 재발급하세요. 공용 개발자 키를 일반 사용자에게 배포하려면 별도 인증·사용량 제한을 갖춘 서버가 필요합니다.

업데이트 시 개발자 부트스트랩으로 표시된 기존 키는 마이그레이션하지 않습니다. 사용자가 직접 저장한 키만 유지할 수 있으며 전송 동의는 새로 받습니다. 로컬 저장소는 OS 수준의 비밀 금고가 아니므로 컴퓨터에 접근 가능한 사용자로부터의 완전한 보호를 제공하지 않습니다.

스토어 등록 전에 [배포 체크리스트](docs/STORE_RELEASE.md), [전체 검토 기록](docs/REVIEW.md)을 확인하세요. 이 작업은 스토어 게시를 수행하지 않습니다.

## Git 업로드와 협업

[Git 업로드 안내](docs/GIT_UPLOAD.md)에 첫 커밋·원격 연결·푸시 절차를 정리했습니다. 별도 폴더에서 시작할 때는 `npm run package:source`로 생성한 소스 ZIP을 풀어 사용합니다. 소스 ZIP에는 `.gitignore`, GitHub Actions, 테스트, 의존성 잠금 파일이 포함됩니다.

`main` 푸시와 PR에는 Ubuntu·Windows 자동 검사가 구성되어 있습니다. API 키나 별도 secret 설정은 필요하지 않습니다. [개발 안내](CONTRIBUTING.md)와 [보안 안내](SECURITY.md)도 함께 확인하세요.
