# Chrome 웹 스토어 제출 준비

제출 파일은 `npm run package`로 만든 `release/trustlight-0.3.0.zip`입니다. 루트 폴더 전체, `private/`, `.archive/`, `node_modules/`를 업로드하지 않습니다.

## 등록 문구 초안

이름: 신뢰등

한 가지 목적: 사용자가 직접 선택한 웹 글의 표현과 근거를 분석하여 신호등과 인용문별 설명을 제공하는 읽기 도우미.

설명: 신뢰등은 읽고 있는 웹 글의 표현과 근거를 AI로 살펴봅니다. 신호등을 열고 분석을 요청하면 점수와 문장별 설명을 확인할 수 있습니다. 외부 검색으로 사실 여부를 검증하는 도구는 아니며 결과는 틀릴 수 있습니다. 본인의 Anthropic API 키가 필요하고 API 이용 요금이 발생할 수 있습니다. 사용자가 동의한 뒤 분석을 직접 요청할 때만 페이지 제목과 본문 최대 9,000자를 Anthropic에 전송합니다. 분석된 글과 결과를 확장 프로그램 저장소에 기록하지 않습니다.

## 권한 설명

| 선언                                          | 실제 사용 목적                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `storage`                                     | API 키, 전송 동의, 표시 설정과 위치를 로컬 저장                                  |
| 콘텐츠 스크립트의 `http://*/*`, `https://*/*` | 사용자가 읽는 다양한 사이트에 신호등을 표시하고 버튼을 누른 페이지의 본문을 추출 |
| `https://api.anthropic.com/*`                 | 설정된 사용자 키로 Claude 분석과 모델 접근 확인 수행                             |

`tabs`, `history`, `cookies`, `scripting`, 클립보드, 웹 접근 가능 리소스 권한은 사용하지 않습니다. 콘텐츠 스크립트가 모든 일반 웹사이트에 선언되어 있으므로 설치 시 웹사이트 데이터 접근 경고가 표시될 수 있습니다. 이는 본문을 읽기 위한 실제 권한이며 데이터가 자동 전송된다는 의미는 아닙니다.

## 게시자가 완료할 사항

1. 제공된 `src/options/privacy.html` 내용을 게시자 웹사이트에 공개 HTTPS 페이지로 게시하고 개발자 대시보드에 실제 URL을 등록합니다. 로컬 `chrome-extension://` 주소는 공개 정책 URL을 대신하지 않습니다.
2. 실제 게시자 정보와 문의 수단을 스토어에 입력하고 개인정보 처리방침의 문의 안내와 일치시킵니다. 정책은 실제 운영 방식과 계약에 맞게 최종 확인합니다.
3. 개인정보 공개 항목에는 웹사이트 콘텐츠와 사용자 제공 인증 정보 처리 사실, Anthropic 전송, 단일 목적 사용을 실제 구현에 맞게 신고합니다. 확장 프로그램이 데이터를 영구 저장하지 않더라도 외부 API 전송은 공개 대상입니다.
4. 본인 테스트 계정으로 `dist`를 Chrome에 로드하여 API 키 연결 확인과 실제 분석 1회를 검증합니다. 자동 테스트와 로컬 UI 미리보기는 Anthropic의 실서버 승인·과금·품질을 검증하지 않습니다.
5. 기사 페이지, 본문이 없는 페이지, SPA 화면 이동, 취소, 키 삭제, 동의 해제, 설정 변경, 작은 화면, 키보드 조작을 확인합니다. 시크릿 모드와 Chrome 내부 페이지에서는 동작하지 않습니다.
6. 실제 동작 화면으로 스토어 스크린샷과 설명을 준비합니다. 모의 결과를 실제 모델 출력처럼 홍보하지 않습니다.
7. 심사자가 본인 키로 재현할 수 있는 테스트 절차를 제출합니다. 개발자 공용 키를 ZIP이나 공개 설명에 포함하지 않습니다.
8. 업로드 파일 이름·버전·체크섬을 확인한 후 개발자 계정에서 제출합니다. 스토어 승인은 Google 심사에 달려 있습니다.

## 확인한 공식 문서

- [Chrome 웹 스토어 정책: 개인정보 공개·권한·데이터 사용](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Manifest V3 원격 코드 제한](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
- [Chrome 저장소와 접근 수준](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [서비스 워커 수명](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Anthropic 모델 정보](https://platform.claude.com/docs/en/models/overview)
- [Anthropic 구조화 응답](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Anthropic 스트리밍 응답](https://platform.claude.com/docs/en/build-with-claude/streaming)
