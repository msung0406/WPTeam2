# Study Dashboard — 웹프로그래밍 2팀

## 폴더 구조
```
study-dashboard/
├── index.html  dashboard.html  todo.html  timer.html  calendar.html  progress.html
├── css/
│   ├── style.css        공통 (테마 토큰 · Bootstrap 연결 · 공통 Header)
│   ├── responsive.css   공통 반응형 (마지막에 로드)
│   └── todo.css         페이지 전용 — 각자 <page>.css 하나씩
├── js/
│   ├── storage.js       공통 데이터 레이어 (모든 페이지 필수)
│   ├── planner.js       공통 플래너 (Todo · Main에서 사용)
│   └── todo.js          페이지 전용 — 각자 <page>.js 하나씩
└── assets/
```
페이지 전용 CSS를 따로 두는 이유: 4명이 style.css 하나를 동시에 고치면 충돌남.

## 페이지 기본 틀 (todo.html 참고)
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/<page>.css">
<link rel="stylesheet" href="css/responsive.css">
...
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer></script>
<script src="js/storage.js" defer></script>
<script src="js/planner.js" defer></script>   <!-- 오늘의 계획이 필요한 페이지만 -->
<script src="js/<page>.js" defer></script>
```
Header/Navigation은 todo.html의 `<nav>` 블록을 그대로 복사하고 `active` + `aria-current="page"`만 옮기면 됨.

## 테마
- 색은 **style.css 맨 위 토큰 블록에만** 있음. 페이지 CSS에서는 `var(--sd-*)`만 사용 (hex 직접 쓰지 않기).
- 기본: Catppuccin Latte + `#BABBF1`
- 중간보고서 색(남색/주황): `<html lang="ko" data-theme="deck">`
- 확정되면 토큰 블록만 바꾸면 전 페이지 반영.

## 데이터 (storage.js v3)
localStorage는 직접 건드리지 말고 `SD`를 통해서만 접근. 키마다 쓰는 페이지는 하나.
**예상 시간 입력은 없음** — 할 일은 작업량 1~5로 표시하고, 플래너가 마감일 전에 몇 시간짜리 세션을 배치함 (시험은 점점 길게).
스키마·알고리즘 전체: `system-design.html` 2~5절.

| 키 | 쓰기 | 읽기 | 쓰기 함수 |
|---|---|---|---|
| tasks | Todo | `SD.getTasks()` (보관 포함) · `SD.activeTasks()` (화면용) | `SD.saveTasks(arr)` |
| events | Calendar | `SD.getEvents()` · `SD.eventsOn(ymd)` · `SD.hasScheduleOn(ymd)` | `SD.saveEvents(arr)` |
| ddays | Calendar | `SD.getDdays()` · `SD.allDdays()` (마감 D-Day 포함) | `SD.saveDdays(arr)` |
| studyLogs | Timer | `SD.getStudyLogs()` | `SD.addStudyLog({ subject, minutes, taskId })` |
| settings | Todo | `SD.getSettings()` | `SD.saveSettings({ shortDayHours, longDayHours, restDays, restNotes, week, startEarly })` |

다른 페이지에서 할 일 상태 바꿀 때 (tasks에 직접 쓰지 말 것)
| 상황 | 호출 |
|---|---|
| Main에서 오늘 세션 체크/해제 | `SD.toggleSession(taskId, SD.date.today(), true, hours)` / `(…, false)` |
| 할 일 전체 완료/되돌리기 | `SD.setCompleted(taskId, true/false)` |

오늘의 계획 (Main 등에서)
```js
const items = Planner.planDay({ tasks: SD.getTasks(), events: SD.getEvents(), settings: SD.getSettings(), today: SD.date.today() });
// [{ taskId, title, type, size, block: "h" | "day", hours, label: "3시간" | "종일", reason: "plan" | "catchup" | "due" | "overdue" | "fallback" | "early", done, checked }]
// 표시용: item.label, Planner.REASON_LABEL[reason] → "보충"
// 14일 전체: Planner.plan({...}).days["2026-11-14"]
```

Calendar 마감 → Todo 할 일: `kind: "deadline"`으로 events에 저장하면 storage.js가 페이지 로드 시 자동으로 연결된 task를 만듦 (`SD.syncDeadlines()`). Calendar는 tasks에 쓰지 않음.

events 형식
```js
{ id, kind: "schedule", title: "동아리 MT", date: "2026-11-14", start: "10:00", end: "18:00" }  // 시간은 선택, 표시용. 일정 있는 주말엔 종일 세션 안 잡음
{ id, kind: "deadline", title: "자율주행 퀴즈 3", date: "2026-11-16", type: "exam" | "project" | "assignment" | "general",
  subject: "Autonomous Driving", size: 4 /* 1~5, 비우면 종류별 기본값 */, priority: "high", showDday: true }
```

tasks 형식
```js
{ id, title, subject, date: "2026-11-16", priority: "high" | "mid" | "low",
  type: "exam" | "project" | "assignment" | "general", size: 4, completed: false,
  createdAt: "2026-11-09", sessions: [{ date: "2026-11-10", hours: 2 }], plan: null /* or { window, short, long, hours, early } */, sourceEventId: null, archived: false }
```

작업량 1~5 = 기본 패턴 (종류 선택 시 기본값: 일반 2 · 과제 3 · 시험 4 · 프로젝트 5). 할 일마다 "세부 조정"으로 변경 가능 (`task.plan`).

과제·프로젝트·일반 (마감 전에 나눠서)
| 작업량 | 시작 | 세션 | 종일 |
|---|---|---|---|
| 1 | 마감일 | 30분 × 1 | 0 |
| 2 | 2일 전 | 1시간 × 1 | 0 |
| 3 | 4일 전 | 1시간 × 2 | 0 |
| 4 | 7일 전 | 1시간 × 2 | 1 |
| 5 | 14일 전 | 2시간 × 6 | 2 |

시험 (시험 전 매일, 시험에 가까울수록 길게)
| 작업량 | 공부할 날 | 하루 시간 | 종일 | 합계 |
|---|---|---|---|---|
| 1 | 1 | 1시간 | – | 1시간 |
| 2 | 2 | 1→2시간 | – | 3시간 |
| 3 | 3 | 2→3시간 | – | 8시간 |
| 4 | 5 | 2→4시간 | 1 | 약 20시간 |
| 5 | 12 | 2→4시간 | 1 | 약 41시간 |

- 요일은 **설정의 "내 일주일"** (`settings.week`: `off` 쉼 / `short` 짧게 / `long` 길게)이 결정. 종일은 마감·시험에 가장 가까운 길게 요일.
- **쉬는 날** (`settings.restDays` + 메모 `settings.restNotes`): 특정 날짜는 아무것도 계획하지 않음. Todo 페이지의 '쉬는 날' 카드, 주간 계획의 '쉬기' 버튼으로 설정. 매주 반복 패턴은 '내 일주일'.
- 하루 한도: 짧게 날 `settings.shortDayHours` (기본 4시간), 종일 = `settings.longDayHours` (기본 8시간). 넘치면 앞날로 나눠 배치, 그래도 안 되면 경고.
- **시험은 하나씩:** 앞 시험이 끝나기 전엔 다음 시험 공부를 시작하지 않음. 남은 날이 적으면 같은 총 시간을 그 날들에 몰아서 배치하고, 그래도 안 들어가면 앞 시험 전 날에 일부 배치.
- **여유 있으면 미리 시작:** 시험 공부 기간 전에 이틀에 한 번 1시간 "미리" 세션 (작업량 3: 7일, 4: 14일, 5: 21일 전부터). 빈 시간에만 들어가고, 건너뛰어도 보충 없음. 해 두면 마지막 날들 시간이 줄어듦. 설정 `settings.startEarly`, 할 일별 `plan.early`.
- **과목별 학습 기록:** 완료한 시험의 실제 공부 시간 ÷ 계획 시간 평균(0.5~2배)을 같은 과목 다음 시험 시간에 곱함. 실제 시간 = 오늘의 계획에서 체크한 시간.

기타
- `SD.SUBJECTS` · `SD.TYPES` / `SD.TYPE_LABEL` · `SD.SIZES` / `SD.SIZE_LABEL` · `SD.PRIORITY_LABEL`
- `SD.date.today()` · `.addDays(ymd, n)` · `.diff(a, b)` · `.parse(ymd)` · `.toYMD(date)` · `.dow(ymd)`
- `SD.hoursOn(task, ymd)` · `SD.totalHours(task)` 공부한 시간
- `SD.newId()` id 생성 · `SD.onChange([SD.KEYS.tasks], fn)` 다른 탭 변경 감지
- `SD.exportAll()` / `SD.importAll(obj)` 백업 JSON
- 테스트: `node tests/run.js` (storage.js · planner.js 수정 후 꼭 실행)

주의
- `new Date().toISOString().slice(0,10)` 쓰지 말 것 → UTC라 한국 시간 오전 9시 전엔 하루 전 날짜가 나옴. `SD.date.today()` 사용.
- 사용자가 입력한 텍스트는 `textContent`로 출력 (`innerHTML` 금지 — 제목에 HTML이 들어가면 그대로 실행됨).
- 다른 탭에서 데이터가 바뀌면 `storage` 이벤트로 갱신 가능 (todo.js 하단 참고).
