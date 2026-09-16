# Git 업로드용 소스

Git에는 소스·아이콘·테스트·빌드 도구·문서·잠금 파일을 올립니다. 스토어 제출 ZIP과 Git 소스 ZIP은 용도가 다릅니다.

| 파일                                  | 용도                                             |
| ------------------------------------- | ------------------------------------------------ |
| `release/trustlight-source-0.3.0.zip` | 새 폴더에 풀어 Git 저장소로 올리는 소스 프로젝트 |
| `release/trustlight-0.3.0.zip`        | Chrome 웹 스토어에 제출하는 빌드 결과            |

소스 ZIP에는 `.github/` 등의 숨김 설정 파일도 포함됩니다. 압축 파일 자체를 소스 대신 커밋하지 말고, 압축을 푼 프로젝트의 파일을 올립니다. 개인 API 키, 원본 번들, `.git/`, 개발 의존성, 생성물은 소스 ZIP에 포함되지 않습니다.

## 첫 업로드

기존 작업 폴더를 사용하거나 소스 ZIP을 새 빈 폴더에 풀고 터미널에서 해당 폴더를 엽니다. `git status`가 저장소가 아니라고 표시할 때만 아래 초기화를 실행합니다.

```powershell
git init -b main
```

GitHub에서 빈 저장소를 만든 뒤 아래 과정을 진행합니다. `YOUR_ACCOUNT`와 `YOUR_REPOSITORY`는 본인의 값으로 바꿉니다. 저장소 생성 시 별도의 README나 `.gitignore`를 추가하지 않으면 첫 푸시 시 충돌을 피할 수 있습니다.

```powershell
npm ci
npm run check
git add .
npm run check:repo
git diff --cached --stat
git diff --cached
git commit -m "chore: prepare TrustLight source repository"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

`origin`이 이미 있으면 `git remote -v`로 주소를 확인하고 기존 연결을 사용합니다. 작성자 설정이 없다는 오류가 나면 본인의 이름과 이메일을 Git에 설정합니다. 이 구성은 작성자 정보, 원격 주소, 계정 인증을 임의로 설정하지 않습니다.

## 자동 검사와 소스 내보내기

`main` 푸시와 PR마다 GitHub Actions가 Ubuntu와 Windows에서 `npm ci`, 전체 검사, 소스 ZIP 생성을 실행합니다. 실제 API 키와 별도 저장소 secret은 필요하지 않습니다. workflow에는 저장소 읽기 권한만 부여했으며 자동 게시 단계는 없습니다.

직접 소스 ZIP을 다시 만들려면 다음 명령을 사용합니다.

```powershell
npm run package:source
```

Git 업로드 검사는 현재 파일과 Git 인덱스를 검사하며 과거 커밋 전체를 검사하는 도구는 아닙니다. 이미 키를 포함한 이력이 있는 저장소에는 별도의 이력 점검과 키 폐기가 필요합니다.

CI의 공식 액션 버전은 [actions/checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)과 [actions/setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0) 릴리스의 전체 커밋 SHA로 고정했습니다. Dependabot은 월별로 npm 및 GitHub Actions 업데이트 PR을 제안합니다.
