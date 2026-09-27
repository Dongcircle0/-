/**
 * 주간바자 행사 정리기 (Google Apps Script 웹앱)
 *
 * 인스타그램 링크 · 캡션 · 포스터만 넣으면 AI가 행사 정보를 정리해
 *   1) '행사DB' 시트에 한 줄씩 쌓고
 *   2) '주간바자' 시트를 발행호(목요일)별로 다시 만들어 줍니다.
 *
 * 설정값은 [프로젝트 설정 > 스크립트 속성]에 넣습니다. (README 참고)
 *   ANTHROPIC_API_KEY  Claude API 키 (기본 AI)
 *   GEMINI_API_KEY     Gemini API 키 (AI_PROVIDER=gemini 일 때)
 *   AI_PROVIDER        claude(기본) | gemini
 *   AI_MODEL           모델 ID를 바꾸고 싶을 때만
 *   APP_PASSCODE       웹앱 접속 암호 (선택, 권장)
 *   SPREADSHEET_ID     스프레드시트에 붙어있지 않은 독립 스크립트일 때만
 */

var CONFIG = {
  DB_SHEET: '행사DB',
  WEEKLY_SHEET: '주간바자',
  POSTER_FOLDER: '주간바자 포스터',
  PRIMARY: '#0BD7ED',
  // 발행 요일: 목요일(4). 목요일에 등록한 행사는 다음 주 발행호로 넘어갑니다.
  PUBLISH_WEEKDAY: 4,
  CLAUDE_MODEL: 'claude-opus-5',
  GEMINI_MODEL: 'gemini-2.5-flash'
};

// '행사DB' 열 순서. 앞쪽은 요청하신 순서(주최/주관/후원 → 계정명 → 행사명 → 일시 → 장소 → 지역 → 세부내용),
// 뒤쪽은 정렬·재가공용 보조 열입니다.
var DB_COLUMNS = [
  ['registeredAt', '등록일시'],
  ['issue', '발행호(목)'],
  ['host', '주최'],
  ['organizer', '주관'],
  ['sponsor', '후원'],
  ['account', '인스타그램 계정'],
  ['title', '행사명'],
  ['datetime', '일시'],
  ['venue', '장소'],
  ['region', '지역'],
  ['details', '세부내용'],
  ['link', '인스타그램 링크'],
  ['poster', '포스터'],
  ['startDate', '시작일'],
  ['endDate', '종료일'],
  ['time', '시간'],
  ['dateNote', '일정 메모'],
  ['caption', '원문 캡션']
];

var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/* ───────────────────────── 웹앱 진입점 ───────────────────────── */

function doGet() {
  var tpl = HtmlService.createTemplateFromFile('Index');
  tpl.needsPasscode = !!prop_('APP_PASSCODE');
  return tpl.evaluate()
    .setTitle('주간바자 행사 정리기')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('주간바자')
    .addItem('주간바자 시트 새로고침', 'rebuildWeeklySheet')
    .addItem('초기 설정(시트 만들기)', 'setup')
    .addToUi();
}

/** '행사DB'를 직접 고치면 '주간바자' 시트도 따라 갱신합니다. */
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === CONFIG.DB_SHEET && e.range.getRow() > 1) {
    try { rebuildWeeklySheet(); } catch (err) { /* 메뉴에서 수동으로 새로고침 가능 */ }
  }
}

/* ───────────────────────── 클라이언트 호출 API ───────────────────────── */

/** 첫 화면 데이터: 이번 발행호와 해당 행사 목록 */
function getDashboard(passcode) {
  checkPasscode_(passcode);
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  var issue = issueFor_(new Date());
  var events = readEvents_(ss).filter(function (ev) { return ev.issue === issue; });
  return {
    issue: issue,
    issueLabel: formatIssue_(issue),
    events: events.map(function (ev) {
      return { title: ev.title, datetime: ev.datetime, venue: ev.venue, link: ev.link, account: ev.account };
    }),
    sheetUrl: ss.getUrl()
  };
}

/**
 * 인스타그램 링크에서 캡션·포스터를 가져오기 시도 (최선 노력).
 * 인스타그램이 로그인 페이지를 돌려주면 실패하므로, 그때는 직접 붙여넣어야 합니다.
 */
function fetchInstagram(passcode, url) {
  checkPasscode_(passcode);
  var result = { ok: false, caption: '', account: accountFromUrl_(url), image: null, message: '' };
  if (!/instagram\.com/i.test(url || '')) {
    result.message = '인스타그램 링크가 아닙니다.';
    return result;
  }
  try {
    var res = UrlFetchApp.fetch(cleanLink_(url), {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        // 링크 미리보기용 크롤러로 요청하면 og 태그를 받을 확률이 높습니다.
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    });
    var html = res.getContentText();
    var desc = metaContent_(html, 'og:description') || metaContent_(html, 'description');
    var title = metaContent_(html, 'og:title');
    var imageUrl = metaContent_(html, 'og:image');

    if (desc) {
      // 형식 예: 12 likes, 3 comments - account on September 1, 2026: "캡션..."
      var m = desc.match(/-\s*([A-Za-z0-9._]+)\s+on\s+[^:]+:\s*["“]?([\s\S]*?)["”]?\.?\s*$/);
      if (m) {
        result.account = result.account || m[1];
        result.caption = m[2];
      } else {
        result.caption = desc;
      }
    }
    if (!result.account && title) {
      var t = title.match(/\(@([A-Za-z0-9._]+)\)/) || title.match(/^([A-Za-z0-9._]+)\s+on Instagram/i);
      if (t) result.account = t[1];
    }
    if (imageUrl) {
      var img = UrlFetchApp.fetch(imageUrl.replace(/&amp;/g, '&'), { muteHttpExceptions: true });
      if (img.getResponseCode() === 200) {
        var blob = img.getBlob();
        result.image = {
          mimeType: blob.getContentType() || 'image/jpeg',
          data: Utilities.base64Encode(blob.getBytes())
        };
      }
    }
    result.ok = !!(result.caption || result.image);
    result.message = result.ok
      ? '링크에서 ' + [result.caption ? '캡션' : '', result.image ? '포스터' : ''].filter(String).join('·') + '을(를) 불러왔어요. 확인 후 정리하기를 눌러주세요.'
      : '인스타그램이 내용을 막았어요. 캡션과 포스터를 직접 넣어주세요.';
  } catch (err) {
    result.message = '불러오기 실패: 캡션과 포스터를 직접 넣어주세요.';
  }
  return result;
}

/**
 * AI로 행사 정보 정리.
 * @param {{link:string, caption:string, image:{mimeType:string,data:string}|null}} input
 */
function analyzeEvent(passcode, input) {
  checkPasscode_(passcode);
  if (!input || (!input.caption && !input.image)) {
    throw new Error('캡션이나 포스터 중 하나는 꼭 넣어주세요.');
  }
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd (E)');
  var urlAccount = accountFromUrl_(input.link);
  var provider = (prop_('AI_PROVIDER') || 'claude').toLowerCase();
  var data = provider === 'gemini'
    ? callGemini_(input, today, urlAccount)
    : callClaude_(input, today, urlAccount);

  var ev = normalizeEvent_(data);
  if (!ev.account && urlAccount) ev.account = urlAccount;
  ev.link = cleanLink_(input.link);
  ev.issue = issueFor_(new Date());

  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  var dup = ev.link ? readEvents_(ss).filter(function (x) { return x.link && x.link === ev.link; })[0] : null;

  return {
    event: ev,
    preview: {
      datetime: formatDateTime_(ev, true),
      design: formatDesign_(ev)
    },
    duplicate: dup ? { title: dup.title, issue: formatIssue_(dup.issue) } : null
  };
}

/** 정리된 행사를 시트에 저장하고 주간 시트를 갱신 */
function saveEvent(passcode, ev, image) {
  checkPasscode_(passcode);
  var ss = getSpreadsheet_();
  var db = ensureSheets_(ss).db;
  ev = normalizeEvent_(ev);
  ev.link = cleanLink_(ev.link);
  ev.issue = ev.issue || issueFor_(new Date());
  ev.registeredAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  ev.datetime = formatDateTime_(ev, true);

  if (image && image.data) {
    try {
      var blob = Utilities.newBlob(Utilities.base64Decode(image.data), image.mimeType || 'image/jpeg',
        ev.issue + '_' + (ev.title || '행사').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60) + '.jpg');
      ev.poster = posterFolder_().createFile(blob).getUrl();
    } catch (err) {
      ev.poster = '(포스터 저장 실패: ' + err.message + ')';
    }
  }

  var row = DB_COLUMNS.map(function (c) { return ev[c[0]] == null ? '' : String(ev[c[0]]); });
  // 날짜 문자열이 자동으로 날짜 서식으로 바뀌지 않도록 텍스트로 고정해서 기록
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    db.getRange(db.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  rebuildWeeklySheet();
  return getDashboard(passcode);
}

/* ───────────────────────── AI 호출 ───────────────────────── */

var EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    host: { type: 'string', description: '주최. 여러 곳이면 쉼표로. 없으면 빈 문자열' },
    organizer: { type: 'string', description: '주관. 없으면 빈 문자열' },
    sponsor: { type: 'string', description: '후원(협찬·지원 포함). 없으면 빈 문자열' },
    account: { type: 'string', description: '행사를 올린 인스타그램 계정명(@ 제외). 모르면 빈 문자열' },
    title: { type: 'string', description: '행사명. 포스터의 공식 명칭 그대로' },
    startDate: { type: 'string', description: '시작일 YYYY-MM-DD. 모르면 빈 문자열' },
    endDate: { type: 'string', description: '종료일 YYYY-MM-DD. 하루 행사면 시작일과 동일' },
    time: { type: 'string', description: '운영 시간. 예: 11:00~18:00, 14:00. 모르면 빈 문자열' },
    dateNote: { type: 'string', description: '날짜 범위로 표현 못 하는 일정 정보. 예: 매주 토요일, 우천 시 순연. 없으면 빈 문자열' },
    venue: { type: 'string', description: '장소명 (가능하면 건물·공간명까지)' },
    region: { type: 'string', description: '시/도 + 시/군/구. 예: 서울 마포구, 경기 성남시. 모르면 빈 문자열' },
    details: { type: 'string', description: '세부내용 요약. 줄바꿈으로 구분된 3~6줄: 행사 소개, 주요 프로그램, 참가비, 신청 방법/기간, 문의 등 있는 것만' },
    missing: { type: 'array', items: { type: 'string' }, description: '정보가 없어서 비워둔 항목 이름들' }
  },
  required: ['host', 'organizer', 'sponsor', 'account', 'title', 'startDate', 'endDate', 'time',
    'dateNote', 'venue', 'region', 'details', 'missing']
};

function buildPrompt_(input, today, urlAccount) {
  return [
    '너는 바자회의소의 "주간바자" 편집자야. 인스타그램에 올라온 행사 게시물(포스터 이미지와 캡션)을 읽고 행사 정보를 정리해.',
    '',
    '규칙:',
    '- 포스터와 캡션에 실제로 있는 정보만 써. 추측으로 채우지 말고, 없으면 빈 문자열로 두고 missing에 적어.',
    '- 오늘은 ' + today + '이야. 연도가 없는 날짜는 오늘 이후 가장 가까운 날짜로 해석해.',
    '- 주최/주관/후원이 구분 없이 "함께하는 곳" 등으로만 나오면 주최에 넣어.',
    '- 지역은 장소 주소나 이름으로 알 수 있을 때만 "서울 마포구"처럼 시/도 + 시/군/구로 적어.',
    '- 세부내용은 사람이 읽기 좋게 한국어로 간결하게.',
    '',
    '인스타그램 링크: ' + (input.link || '(없음)'),
    urlAccount ? '링크에서 확인된 계정명: ' + urlAccount : '',
    '',
    '캡션:',
    input.caption ? input.caption : '(캡션 없음 — 포스터만 보고 정리해)'
  ].join('\n');
}

function callClaude_(input, today, urlAccount) {
  var key = prop_('ANTHROPIC_API_KEY');
  if (!key) throw new Error('스크립트 속성에 ANTHROPIC_API_KEY를 넣어주세요.');

  var content = [];
  if (input.image && input.image.data) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mimeType || 'image/jpeg', data: input.image.data } });
  }
  content.push({ type: 'text', text: buildPrompt_(input, today, urlAccount) });

  var body = {
    model: prop_('AI_MODEL') || CONFIG.CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: EVENT_SCHEMA } },
    fallbacks: 'default',
    messages: [{ role: 'user', content: content }]
  };
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var json = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('Claude API 오류 (' + res.getResponseCode() + '): ' + (json.error && json.error.message));
  }
  if (json.stop_reason === 'refusal') throw new Error('AI가 이 게시물 정리를 거절했어요. 직접 입력해주세요.');
  if (json.stop_reason === 'max_tokens') throw new Error('AI 응답이 잘렸어요. 다시 시도해주세요.');
  var text = json.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  return JSON.parse(text);
}

function callGemini_(input, today, urlAccount) {
  var key = prop_('GEMINI_API_KEY');
  if (!key) throw new Error('스크립트 속성에 GEMINI_API_KEY를 넣어주세요.');

  var parts = [];
  if (input.image && input.image.data) {
    parts.push({ inline_data: { mime_type: input.image.mimeType || 'image/jpeg', data: input.image.data } });
  }
  parts.push({ text: buildPrompt_(input, today, urlAccount) });

  // Gemini 스키마는 additionalProperties/description 일부를 지원하지 않아 단순화
  var schema = { type: 'OBJECT', properties: {}, required: EVENT_SCHEMA.required };
  Object.keys(EVENT_SCHEMA.properties).forEach(function (k) {
    var p = EVENT_SCHEMA.properties[k];
    schema.properties[k] = p.type === 'array'
      ? { type: 'ARRAY', items: { type: 'STRING' }, description: p.description }
      : { type: 'STRING', description: p.description };
  });

  var model = prop_('AI_MODEL') || CONFIG.GEMINI_MODEL;
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      contents: [{ role: 'user', parts: parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
    }),
    muteHttpExceptions: true
  });
  var json = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini API 오류 (' + res.getResponseCode() + '): ' + (json.error && json.error.message));
  }
  return JSON.parse(json.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join(''));
}

/* ───────────────────────── 주간바자 시트 ───────────────────────── */

/**
 * '주간바자' 시트를 '행사DB' 기준으로 새로 그립니다.
 * 왼쪽(A~F): 발행호별 행사 목록 / 오른쪽(H~K): 디자인용 행사명·일시·장소
 */
function rebuildWeeklySheet() {
  var ss = getSpreadsheet_();
  var weekly = ensureSheets_(ss).weekly;
  var events = readEvents_(ss);

  var groups = {};
  events.forEach(function (ev) {
    var key = ev.issue || '미지정';
    (groups[key] = groups[key] || []).push(ev);
  });
  var issues = Object.keys(groups).sort().reverse(); // 최신 발행호가 위로

  weekly.clear();
  weekly.getRange(1, 1, weekly.getMaxRows(), weekly.getMaxColumns()).breakApart();

  var values = [];
  var styles = []; // {row, kind}
  var LEFT = ['No', '행사명', '계정', '일시', '장소', '지역'];
  var RIGHT = ['행사명', '일시', '장소', '복사용'];
  var WIDTH = LEFT.length + 1 + RIGHT.length;

  function pad(arr) { while (arr.length < WIDTH) arr.push(''); return arr; }

  if (!issues.length) values.push(pad(['아직 등록된 행사가 없어요. 웹앱에서 행사를 추가해보세요.']));

  issues.forEach(function (issue) {
    var list = groups[issue].slice().sort(function (a, b) {
      return (a.startDate || '9999').localeCompare(b.startDate || '9999');
    });
    values.push(pad([formatIssue_(issue) + ' 주간바자 · ' + list.length + '건']));
    styles.push({ row: values.length, kind: 'issue' });
    values.push(LEFT.concat([''], RIGHT));
    styles.push({ row: values.length, kind: 'header' });
    list.forEach(function (ev, i) {
      var d = formatDesign_(ev);
      values.push([i + 1, ev.title, ev.account ? '@' + ev.account : '', ev.datetime, ev.venue, ev.region, '',
        d.title, d.datetime, d.venue, [d.title, d.datetime, d.venue].filter(String).join('\n')]);
    });
    values.push(pad([]));
  });

  weekly.getRange(1, 1, values.length, WIDTH).setNumberFormat('@').setValues(values);
  weekly.getRange(1, 1, values.length, WIDTH).setVerticalAlignment('middle').setWrap(true);

  styles.forEach(function (s) {
    if (s.kind === 'issue') {
      weekly.getRange(s.row, 1, 1, WIDTH).merge()
        .setBackground('#0f1a1f').setFontColor(CONFIG.PRIMARY).setFontWeight('bold').setFontSize(12);
    } else {
      weekly.getRange(s.row, 1, 1, LEFT.length).setBackground(CONFIG.PRIMARY).setFontColor('#001417').setFontWeight('bold');
      weekly.getRange(s.row, LEFT.length + 2, 1, RIGHT.length).setBackground('#1b2a30').setFontColor(CONFIG.PRIMARY).setFontWeight('bold');
    }
  });

  var widths = [36, 220, 130, 200, 180, 100, 16, 200, 150, 160, 260];
  widths.forEach(function (w, i) { weekly.setColumnWidth(i + 1, w); });
  weekly.setFrozenRows(0);
}

/* ───────────────────────── 날짜/형식 ───────────────────────── */

/** 등록일 기준 발행호(목요일). 목요일 당일에 등록하면 다음 주 목요일. */
function issueFor_(date) {
  var d = new Date(Utilities.formatDate(date, 'Asia/Seoul', "yyyy-MM-dd'T'00:00:00"));
  var diff = (CONFIG.PUBLISH_WEEKDAY - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
}

function parseYmd_(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

function formatIssue_(issue) {
  var d = parseYmd_(issue);
  if (!d) return issue;
  return d.getFullYear() + '.' + pad2_(d.getMonth() + 1) + '.' + pad2_(d.getDate()) + '(' + WEEKDAYS[d.getDay()] + ')';
}

function fmtDay_(d, withYear) {
  return (withYear ? d.getFullYear() + '.' : '') + pad2_(d.getMonth() + 1) + '.' + pad2_(d.getDate()) + '(' + WEEKDAYS[d.getDay()] + ')';
}

function formatDateRange_(ev, withYear) {
  var s = parseYmd_(ev.startDate), e = parseYmd_(ev.endDate);
  if (!s) return '';
  if (!e || e.getTime() === s.getTime()) return fmtDay_(s, withYear);
  var sameYear = s.getFullYear() === e.getFullYear();
  return fmtDay_(s, withYear) + ' ~ ' + fmtDay_(e, withYear && !sameYear);
}

/** '행사DB'의 일시: 2026.10.03(토) ~ 10.05(월) 11:00~18:00 · 매주 토요일 */
function formatDateTime_(ev, withYear) {
  var main = [formatDateRange_(ev, withYear), ev.time].filter(String).join(' ');
  return [main, ev.dateNote].filter(String).join(' · ');
}

/**
 * 디자인용(주간바자 오른쪽) 형식. 나은쌤 템플릿에 맞춰 여기만 고치면 됩니다.
 *   행사명: 그대로 / 일시: 10.03(토) ~ 10.05(월) 11:00~18:00 / 장소: 장소명
 */
function formatDesign_(ev) {
  return {
    title: ev.title || '',
    datetime: formatDateTime_(ev, false),
    venue: ev.venue || ''
  };
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/* ───────────────────────── 시트/드라이브 유틸 ───────────────────────── */

function setup() {
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  posterFolder_();
  rebuildWeeklySheet();
}

function getSpreadsheet_() {
  var id = prop_('SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('스프레드시트를 찾을 수 없어요. 스프레드시트의 [확장 프로그램 > Apps Script]에서 만들었는지 확인하거나 SPREADSHEET_ID를 설정해주세요.');
  return ss;
}

function ensureSheets_(ss) {
  var db = ss.getSheetByName(CONFIG.DB_SHEET);
  if (!db) {
    db = ss.insertSheet(CONFIG.DB_SHEET, 0);
    var headers = DB_COLUMNS.map(function (c) { return c[1]; });
    db.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground(CONFIG.PRIMARY).setFontColor('#001417').setFontWeight('bold');
    db.setFrozenRows(1);
    var widths = [120, 100, 140, 140, 140, 140, 220, 230, 180, 110, 360, 220, 160, 90, 90, 100, 140, 300];
    widths.forEach(function (w, i) { db.setColumnWidth(i + 1, w); });
    db.getRange('K:K').setWrap(true);
  }
  var weekly = ss.getSheetByName(CONFIG.WEEKLY_SHEET);
  if (!weekly) weekly = ss.insertSheet(CONFIG.WEEKLY_SHEET, 1);
  return { db: db, weekly: weekly };
}

/** '행사DB'를 헤더 이름 기준으로 읽습니다 (열 순서를 바꿔도 동작). */
function readEvents_(ss) {
  var db = ss.getSheetByName(CONFIG.DB_SHEET);
  if (!db || db.getLastRow() < 2) return [];
  var values = db.getDataRange().getDisplayValues();
  var header = values[0];
  var idx = {};
  DB_COLUMNS.forEach(function (c) { idx[c[0]] = header.indexOf(c[1]); });
  return values.slice(1).filter(function (r) { return r.join('').trim(); }).map(function (r) {
    var ev = {};
    Object.keys(idx).forEach(function (k) { ev[k] = idx[k] >= 0 ? r[idx[k]] : ''; });
    ev.issue = normalizeDate_(ev.issue);
    ev.startDate = normalizeDate_(ev.startDate);
    ev.endDate = normalizeDate_(ev.endDate);
    ev.account = String(ev.account || '').replace(/^@/, '');
    if (!ev.datetime) ev.datetime = formatDateTime_(ev, true);
    return ev;
  });
}

/** 시트에서 사람이 2026. 10. 3 처럼 고쳐도 YYYY-MM-DD로 맞춥니다. */
function normalizeDate_(s) {
  var m = String(s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? m[1] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[3]) : String(s || '').trim();
}

function normalizeEvent_(d) {
  d = d || {};
  var ev = {};
  DB_COLUMNS.forEach(function (c) { ev[c[0]] = d[c[0]] == null ? '' : String(d[c[0]]).trim(); });
  ev.account = ev.account.replace(/^@/, '');
  ev.startDate = normalizeDate_(ev.startDate);
  ev.endDate = normalizeDate_(ev.endDate) || ev.startDate;
  ev.issue = normalizeDate_(ev.issue);
  ev.missing = d.missing || [];
  return ev;
}

function posterFolder_() {
  var id = prop_('POSTER_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 폴더가 지워졌으면 새로 만듦 */ }
  }
  var folder = DriveApp.createFolder(CONFIG.POSTER_FOLDER);
  PropertiesService.getScriptProperties().setProperty('POSTER_FOLDER_ID', folder.getId());
  return folder;
}

function accountFromUrl_(url) {
  var m = String(url || '').match(/instagram\.com\/([A-Za-z0-9._]+)\/(?:p|reel|tv)\//i);
  return m ? m[1] : '';
}

/** 공유 링크의 ?igsh= 같은 추적 파라미터 제거 */
function cleanLink_(url) {
  return String(url || '').trim().replace(/[?#].*$/, '');
}

function metaContent_(html, name) {
  var re = new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]*content=["\']([^"\']*)["\']', 'i');
  var m = html.match(re);
  if (!m) {
    re = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + name + '["\']', 'i');
    m = html.match(re);
  }
  return m ? decodeEntities_(m[1]) : '';
}

function decodeEntities_(s) {
  return s.replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); })
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function checkPasscode_(passcode) {
  var expected = prop_('APP_PASSCODE');
  if (expected && passcode !== expected) throw new Error('PASSCODE: 접속 암호가 올바르지 않아요.');
}
