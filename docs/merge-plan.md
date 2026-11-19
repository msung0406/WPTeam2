# 브랜치 합치기 · 디자인 통일 계획

작성: 김지환 (Main · Dashboard) · 2026-11-15

## 0. 한 줄 요약

`todo-planner`가 만든 공통 틀(`SD` 데이터 레이어 + `style.css` 테마 + 공통 Nav)을 기준으로 맞추고,
Calendar·Timer는 데이터 저장과 디자인만 이 틀로 옮긴다.

### SD가 뭐야?

`js/storage.js`가 만드는 전역 객체 이름 (**S**tudy **D**ashboard).
localStorage를 각자 직접 쓰면 키 이름·형식이 달라져서 Dashboard가 못 읽으므로,
모든 페이지가 `SD`를 통해서만 읽고 쓴다.

```js
SD.getTasks()                       // 할 일 목록 읽기
SD.saveEvents(events)               // Calendar 일정 저장
SD.addStudyLog({ subject, minutes }) // Timer 공부 기록 추가
SD.date.today()                     // "2026-11-15" (한국 시간 기준)
```

## 1. 현재 브랜치 상태

| 브랜치 | 담당 | 데이터 | 디자인 | 합칠 때 문제 |
|---|---|---|---|---|
| `todo-planner` | 김주환 | `SD` (직접 만듦) | 공통 틀 | `main`과 시작 커밋이 달라 그냥 merge 안 됨 |
| `main-dashboard` | 김지환 | `SD` | 공통 틀 | 없음 |
| `calandar-/-D-DAY` | 김도형 | 자체 `PlannerStore` (키 `study-planner-events-v1`, id 문자열) | 자체 색·헤더, 파일이 루트에 있음 | Dashboard·Todo와 데이터가 안 이어짐 |
| `Timer` | 김민성 | 자체 저장 (`records`, 과목 수학·영어…) | 자체 색·다크모드, `index.html` 사용 | Main의 `index.html`과 파일명 충돌, 데이터 안 이어짐 |

## 2. 합치는 순서

1. **`todo-planner` → `main`**
   공통 기반이라 가장 먼저. 시작 커밋이 달라서 `main` 위에 다시 올린 브랜치로 PR.
   ```bash
   git checkout -b todo-planner-rebased origin/main
   git cherry-pick 91a63c9
   ```
2. **`main-dashboard` → `main`**
   공통 파일(`storage.js`, `planner.js`, `style.css`, `responsive.css`)이 1번과 완전히 같아서 충돌 없음.
3. **Calendar 전환** (아래 3절)
4. **Timer · Progress 전환** (아래 3절)
5. **공통 CSS 정리** (아래 4절) — 마지막에 한 번

## 3. 데이터 통일

| 데이터 | 쓰는 페이지 | 저장 | 읽기 |
|---|---|---|---|
| tasks | Todo | `SD.saveTasks(arr)` | `SD.activeTasks()` |
| events | Calendar | `SD.saveEvents(arr)` | `SD.getEvents()` · `SD.eventsOn(ymd)` |
| ddays | Calendar | `SD.saveDdays(arr)` | `SD.allDdays()` |
| studyLogs | Timer | `SD.addStudyLog({ subject, minutes, taskId })` | `SD.getStudyLogs()` |
| settings | Todo | `SD.saveSettings(obj)` | `SD.getSettings()` |

규칙: 키마다 쓰는 페이지는 하나. 나머지는 읽기만.

### Calendar (김도형)
- `PlannerStore.addEvent/removeEvent` → `SD.getEvents()` 수정 후 `SD.saveEvents()`
- id: `crypto.randomUUID()` → `SD.newId()` (숫자)
- 일정: `{ id, kind: "schedule", title, date, start, end }`
- 마감(과제·시험): `{ id, kind: "deadline", title, date, type, subject, size, priority, showDday }`
  → 저장하면 Todo에 할 일이 자동으로 생김 (`SD.syncDeadlines()`)
- D-Day: `{ id, title, targetDate }` (`date` 아님)
- 날짜 계산은 `SD.date.diff(a, b)`, 오늘은 `SD.date.today()`

### Timer · Progress (김민성)
- `index.html` → `timer.html` + `progress.html`로 분리 (`index.html`은 Main)
- 집중 끝날 때 `SD.addStudyLog({ subject, minutes, taskId })`
- 과목 목록: `SD.SUBJECTS` (통계가 과목 오타로 갈라지지 않게 고정)
- Progress 집계는 `js/stats.js`의 `Stats.weekMinutes()`, `Stats.minutesOn()`, `Stats.taskCompletion()` 재사용 가능

### 결정 필요
- **"공부 시간"의 기준**: Main·Dashboard는 Timer 기록(`studyLogs.minutes`)을 공부 시간으로 표시.
  Todo의 계획 체크 시간(`task.sessions`)은 "오늘 계획 완료"에만 사용. Progress도 같은 기준으로 갈지 확인.

## 4. 디자인 통일

- **색**: `css/style.css` 맨 위 토큰 블록에만. 페이지 CSS에서는 `var(--sd-*)`만 사용, hex 직접 금지.
  - 기본: Catppuccin Latte + `#BABBF1`, 발표용: `<html data-theme="deck">`
- **폰트**: IBM Plex Sans KR (Google Fonts), Bootstrap 5.3.3
- **Nav**: `todo.html`의 `<nav class="navbar ... sd-navbar">` 블록 그대로 복사, `active` + `aria-current="page"`만 이동
- **페이지 틀**: `container-xl py-4` → `sd-eyebrow` + `sd-page-title` 헤더 → 요약 카드(`sd-stat-label` / `sd-stat-value`) → 카드들
- **CSS 로드 순서**: Bootstrap → `style.css` → `<page>.css` → `responsive.css`
- **합칠 때 style.css로 옮길 것** (지금은 페이지 CSS에 중복)
  - `.sd-plan*`, `.sd-block*`, `.sd-reason-*` (todo · main)
  - `.sd-dday-*`, `.sd-section-title`, `.sd-stat-note`, `.sd-empty`, `.sd-more` (main · dashboard)
  - 링크 색: Bootstrap 5.3은 `--bs-link-color`가 아니라 `--bs-link-color-rgb`를 써서 지금 링크가 기본 파랑으로 나옴 → style.css에서 수정
- **다크모드**: Timer만 있음. 하려면 style.css 토큰에 `data-theme="dark"` 추가해서 전 페이지 적용, 아니면 제거
- **보안·날짜 규칙**: 사용자 입력은 `textContent`로 출력, 날짜는 `toISOString()` 금지 → `SD.date.today()`

## 5. 진행 방식

- 각자 브랜치에서 작업 → `main`으로 PR → 한 명 이상 확인 후 merge
- Calendar·Timer 전환은 에이전트에 맡길 수 있음. 단 **본인 브랜치에 직접 push하지 않고**
  `calendar-sd`, `timer-sd` 같은 새 브랜치에 PR로 올려서 담당자가 확인
- `storage.js` · `planner.js` 수정 시 `node tests/run.js` 통과 확인 (담당: 김주환)

## 6. 체크리스트

- [ ] 팀 합의: 데이터는 `SD`로 통일, 공부 시간 기준
- [ ] `todo-planner` → `main`
- [ ] `main-dashboard` → `main`
- [ ] Calendar `SD` 전환 + 공통 Nav · 토큰
- [ ] Timer/Progress 파일 분리 + `SD.addStudyLog` + 공통 Nav · 토큰
- [ ] 공통 CSS를 style.css로 이동, 링크 색 수정
- [ ] 6개 페이지 Nav 링크 전부 열리는지, 모바일(390px) 가로 스크롤 없는지 확인
