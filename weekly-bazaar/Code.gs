/**
 * 주간바자 행사 정리기 (Google Apps Script 웹앱)
 *
 * 인스타그램 링크 · 캡션 · 포스터만 넣으면 AI가 행사 정보를 정리해
 *   1) 바자회의소 스프레드시트의 '바자가자' 시트에 한 줄씩 추가하고
 *   2) '주간바자 정리' 시트를 발행호(목요일)별로 다시 만들어 줍니다.
 *
 * '바자가자' 시트의 머리글(행사명, 일시, 장소, 카테고리, 내용 …)을 읽어서
 * 이름이 맞는 열에 알아서 채웁니다. 열 순서가 바뀌어도 동작합니다.
 *
 * 설정값은 [프로젝트 설정 > 스크립트 속성]에 넣습니다. (README 참고)
 *   GEMINI_API_KEY     Google AI Studio 무료 API 키 (기본 AI, 무료)
 *   APP_PASSCODE       웹앱 접속 암호 (선택, 권장)
 *   AI_PROVIDER        gemini(기본) | claude (Claude는 유료)
 *   ANTHROPIC_API_KEY  AI_PROVIDER=claude 일 때만
 *   AI_MODEL           모델 ID를 바꾸고 싶을 때만
 *   SPREADSHEET_ID     다른 스프레드시트를 쓰고 싶을 때만
 */

var CONFIG = {
  SPREADSHEET_ID: '1-WVDnpUVv7I0cUqqkatNsZcjnMhHNK24jBh0ikunXbg',
  LIST_SHEET: '바자가자',
  LIST_SHEET_POSITION: 5, // 이름으로 못 찾으면 5번째 시트 사용
  WEEKLY_SHEET: '주간바자 정리',
  FIGMA_SHEET: '피그마용',
  // 목요일 발행호가 다루는 주: 0 = 발행일이 속한 월~일, 1 = 발행 다음 주 월~일
  ISSUE_WEEK_OFFSET: 0,
  WEEKLY_PAST_WEEKS: 2, // '주간바자 정리'에 남겨둘 지난 주 수
  POSTER_FOLDER: '주간바자 포스터',
  PRIMARY: '#0BD7ED',
  PUBLISH_WEEKDAY: 4, // 목요일. 목요일에 등록한 행사는 다음 주 발행호로 넘어갑니다.
  // 앞에서부터 차례로 시도. 구글이 모델을 바꾸면 이 목록만 고치면 됩니다.
  GEMINI_MODELS: ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest'],
  CLAUDE_MODEL: 'claude-opus-5',
  DEFAULT_CATEGORIES: ['플리마켓', '바자회', '벼룩시장', '축제/페스티벌', '팝업스토어', '전시', '공연', '체험/워크숍', '기타']
};

/**
 * '바자가자' 시트 머리글과 맞춰볼 항목들.
 * aliases는 공백·기호를 뺀 소문자 기준으로 비교합니다.
 * 머리글이 없는 빈 시트라면 label 순서대로 머리글을 새로 만듭니다.
 */
var FIELDS = [
  { key: 'no', label: 'No', aliases: ['no', '번호', '순번', '연번'], optional: true },
  { key: 'category', label: '카테고리', aliases: ['카테고리', '분류', '종류', '유형', '구분', '행사종류', '행사유형'] },
  { key: 'host', label: '주최', aliases: ['주최', '주최사', '주최기관', '주최측'] },
  { key: 'organizer', label: '주관', aliases: ['주관', '주관사', '주관기관'] },
  { key: 'sponsor', label: '후원', aliases: ['후원', '협찬', '후원협찬', '후원사'] },
  { key: 'account', label: '인스타그램 계정', aliases: ['인스타그램계정', '인스타그램계정명', '인스타계정', '계정', '계정명', '아이디', '인스타아이디'] },
  { key: 'title', label: '행사명', aliases: ['행사명', '행사이름', '제목', '이름'] },
  { key: 'datetime', label: '일시', aliases: ['일시', '일정', '날짜', '기간', '행사일시', '행사기간', '행사일정', '행사날짜', '일자'] },
  { key: 'time', label: '시간', aliases: ['시간', '운영시간', '행사시간'], optional: true },
  { key: 'venue', label: '장소', aliases: ['장소', '위치', '행사장소', '장소명', '주소'] },
  { key: 'region', label: '지역', aliases: ['지역', '시군구', '지역구분', '권역'] },
  { key: 'summary', label: '내용', aliases: ['내용', '행사내용', '소개', '한줄소개', '요약', '내용요약', '행사소개'] },
  { key: 'details', label: '세부내용', aliases: ['세부내용', '상세내용', '세부사항', '상세', '상세정보', '세부정보'] },
  { key: 'link', label: '링크', aliases: ['링크', '인스타그램링크', '인스타링크', 'url', '게시물링크', '게시물', '출처', '출처링크'], helper: true },
  { key: 'poster', label: '포스터', aliases: ['포스터', '포스터링크', '이미지', '포스터이미지'], helper: true },
  { key: 'issue', label: '발행호', aliases: ['발행호', '발행일', '주간바자', '주간바자발행일', '발행주', '업로드일'], helper: true },
  { key: 'registeredAt', label: '등록일', aliases: ['등록일', '등록일시', '작성일', '수집일'], optional: true }
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
    .addItem('정리기 열기 (링크 보기)', 'showAppLink')
    .addItem('주간바자 정리 시트 새로고침', 'rebuildWeeklySheet')
    .addItem('바자가자 시트 연결 확인', 'showMapping')
    .addToUi();
}

/** '바자가자'를 직접 고치면 '주간바자 정리' 시트도 따라 갱신합니다. */
function onEdit(e) {
  try {
    if (e && e.range && isListSheet_(e.range.getSheet())) rebuildWeeklySheet(e.source);
  } catch (err) { /* 메뉴에서 수동으로 새로고침 가능 */ }
}

/* ───────────────────────── 클라이언트 호출 API ───────────────────────── */

/** 첫 화면 데이터: 다음 발행호가 다루는 주(월~일)의 행사, 카테고리, 시트 연결 상태 */
function getDashboard(passcode) {
  checkPasscode_(passcode);
  var ss = getSpreadsheet_();
  var ctx = listContext_(ss);
  var issue = issueFor_(new Date());
  var week = weekOfIssue_(issue);
  var events = eventsInWeek_(readEvents_(ctx), week);
  return {
    issue: issue,
    issueLabel: formatIssue_(issue),
    weekLabel: formatWeek_(week),
    events: events.map(function (ev) {
      return { title: ev.title, datetime: ev.datetime, venue: ev.venue, link: ev.link, account: ev.account, category: ev.category };
    }),
    categories: categoryOptions_(ctx),
    mapping: mappingSummary_(ctx),
    sheetUrl: ss.getUrl() + '#gid=' + ctx.sheet.getSheetId()
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
      var img = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
      if (img.getResponseCode() === 200) {
        var blob = img.getBlob();
        result.image = { mimeType: blob.getContentType() || 'image/jpeg', data: Utilities.base64Encode(blob.getBytes()) };
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
  var ss = getSpreadsheet_();
  var ctx = listContext_(ss);
  var categories = categoryOptions_(ctx);
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd (E)');
  var urlAccount = accountFromUrl_(input.link);
  var prompt = buildPrompt_(input, today, urlAccount, categories);

  var data = (prop_('AI_PROVIDER') || 'gemini').toLowerCase() === 'claude'
    ? callClaude_(input, prompt)
    : callGemini_(input, prompt);

  var ev = normalizeEvent_(data);
  if (!ev.account && urlAccount) ev.account = urlAccount;
  ev.link = cleanLink_(input.link);
  ev.issue = issueFor_(new Date());

  var dup = ev.link ? readEvents_(ctx).filter(function (x) { return x.link && cleanLink_(x.link) === ev.link; })[0] : null;
  return {
    event: ev,
    categories: categories,
    duplicate: dup ? { title: dup.title, issue: dup.issueLabel } : null
  };
}

/** 정리된 행사를 '바자가자' 시트에 추가하고 주간 시트를 갱신 */
function saveEvent(passcode, ev, image) {
  checkPasscode_(passcode);
  var ss = getSpreadsheet_();
  ev = normalizeEvent_(ev);
  ev.link = cleanLink_(ev.link);
  ev.issue = ev.issue || issueFor_(new Date());
  ev.registeredAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');

  if (image && image.data) {
    try {
      var name = ev.issue + '_' + (ev.title || '행사').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60) + '.jpg';
      var blob = Utilities.newBlob(Utilities.base64Decode(image.data), image.mimeType || 'image/jpeg', name);
      ev.poster = posterFolder_().createFile(blob).getUrl();
    } catch (err) {
      ev.poster = '(포스터 저장 실패: ' + err.message + ')';
    }
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ctx = listContext_(ss, true);
    writeRow_(ctx, ev);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  rebuildWeeklySheet(ss);
  return getDashboard(passcode);
}

/* ───────────────────────── '바자가자' 시트 ───────────────────────── */

function isListSheet_(sheet) {
  return sheet.getName() === CONFIG.LIST_SHEET ||
    (!sheet.getParent().getSheetByName(CONFIG.LIST_SHEET) && sheet.getIndex() === CONFIG.LIST_SHEET_POSITION);
}

function listSheet_(ss) {
  var sheet = ss.getSheetByName(CONFIG.LIST_SHEET) || ss.getSheets()[CONFIG.LIST_SHEET_POSITION - 1];
  if (!sheet) throw new Error("'" + CONFIG.LIST_SHEET + "' 시트를 찾을 수 없어요.");
  return sheet;
}

function norm_(s) {
  return String(s || '').toLowerCase().replace(/[\s()\[\]{}·•.,:;\/\\_\-~|*#]/g, '');
}

/**
 * 시트의 머리글 행을 찾아 항목 → 열 번호를 매핑합니다.
 * @param {boolean} addHelpers 링크/포스터/발행호 열이 없으면 오른쪽 끝에 추가
 */
function listContext_(ss, addHelpers) {
  var sheet = listSheet_(ss);
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var scanRows = Math.min(Math.max(sheet.getLastRow(), 1), 10);
  var top = sheet.getRange(1, 1, scanRows, lastCol).getDisplayValues();

  var best = null;
  top.forEach(function (row, i) {
    var m = mapHeaders_(row);
    if (!best || m.count > best.count) best = { row: i + 1, map: m.map, combined: m.combined, count: m.count, headers: row };
  });

  if (!best || best.count < 2) {
    if (sheet.getLastRow() === 0) {
      // 완전히 빈 시트면 머리글을 새로 만듭니다.
      var labels = FIELDS.filter(function (f) { return !f.optional || f.key === 'registeredAt'; }).map(function (f) { return f.label; });
      sheet.getRange(1, 1, 1, labels.length).setValues([labels])
        .setBackground(CONFIG.PRIMARY).setFontColor('#001417').setFontWeight('bold');
      sheet.setFrozenRows(1);
      return listContext_(ss, addHelpers);
    }
    throw new Error("'" + sheet.getName() + "' 시트에서 머리글(행사명, 일시, 장소 등)을 찾지 못했어요. 첫 10줄 안에 머리글이 있는지 확인해주세요.");
  }

  var ctx = { sheet: sheet, headerRow: best.row, map: best.map, combined: best.combined, headers: best.headers };
  if (addHelpers) {
    FIELDS.filter(function (f) { return f.helper && !ctx.map[f.key]; }).forEach(function (f) {
      var col = sheet.getLastColumn() + 1;
      var prev = sheet.getRange(ctx.headerRow, col - 1);
      var cell = sheet.getRange(ctx.headerRow, col);
      prev.copyTo(cell, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      cell.setValue(f.label);
      ctx.map[f.key] = col;
      ctx.headers[col - 1] = f.label;
    });
  }
  return ctx;
}

function mapHeaders_(row) {
  var map = {}, combined = 0, count = 0;
  var pending = [];
  row.forEach(function (h, i) {
    var n = norm_(h);
    if (!n) return;
    // '주최/주관/후원'처럼 한 칸에 합쳐진 머리글
    var hits = ['주최', '주관', '후원'].filter(function (w) { return n.indexOf(w) >= 0; }).length;
    if (hits >= 2 && !combined) { combined = i + 1; count++; return; }
    var f = FIELDS.filter(function (f) { return !map[f.key] && f.aliases.indexOf(n) >= 0; })[0];
    if (f) { map[f.key] = i + 1; count++; } else pending.push([n, i + 1]);
  });
  // 정확히 일치하지 않는 머리글은 포함 관계로 한 번 더 (예: '행사명(국문)')
  pending.forEach(function (p) {
    var f = FIELDS.filter(function (f) {
      return !map[f.key] && f.aliases.some(function (a) { return a.length >= 3 && p[0].indexOf(a) >= 0; });
    })[0];
    if (f) { map[f.key] = p[1]; count++; }
  });
  return { map: map, combined: combined, count: count };
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function mappingSummary_(ctx) {
  var used = {};
  var rows = FIELDS.filter(function (f) { return ctx.map[f.key]; }).map(function (f) {
    used[ctx.map[f.key]] = true;
    return { field: f.label, header: ctx.headers[ctx.map[f.key] - 1], col: colLetter_(ctx.map[f.key]) };
  });
  if (ctx.combined) {
    used[ctx.combined] = true;
    rows.unshift({ field: '주최/주관/후원', header: ctx.headers[ctx.combined - 1], col: colLetter_(ctx.combined) });
  }
  var coveredHost = ctx.combined;
  var missing = FIELDS.filter(function (f) {
    if (ctx.map[f.key] || f.optional) return false;
    if (coveredHost && ['host', 'organizer', 'sponsor'].indexOf(f.key) >= 0) return false;
    if (f.key === 'summary' && ctx.map.details) return false; // 세부내용만 있어도 충분
    if (f.key === 'details' && ctx.map.summary) return false;
    return true;
  }).map(function (f) { return f.label; });
  var unmapped = ctx.headers.map(function (h, i) { return used[i + 1] || !String(h).trim() ? null : h; }).filter(Boolean);
  return { sheet: ctx.sheet.getName(), headerRow: ctx.headerRow, columns: rows, missing: missing, unmapped: unmapped };
}

/** 카테고리 목록: 드롭다운(데이터 확인) 목록 → 기존에 쓴 값 → 기본 목록 순 */
function categoryOptions_(ctx) {
  var col = ctx.map.category;
  if (!col) return CONFIG.DEFAULT_CATEGORIES.slice();
  var sheet = ctx.sheet;
  var options = [];
  try {
    var rule = sheet.getRange(ctx.headerRow + 1, col).getDataValidation();
    if (rule) {
      var type = rule.getCriteriaType(), vals = rule.getCriteriaValues();
      if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) options = vals[0];
      if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
        options = vals[0].getDisplayValues().reduce(function (a, r) { return a.concat(r); }, []);
      }
    }
  } catch (e) { /* 드롭다운이 없으면 무시 */ }
  var last = sheet.getLastRow();
  if (last > ctx.headerRow) {
    sheet.getRange(ctx.headerRow + 1, col, last - ctx.headerRow, 1).getDisplayValues().forEach(function (r) {
      r[0].split(/[,\n]/).forEach(function (v) { options.push(v); });
    });
  }
  var seen = {};
  options = options.map(function (v) { return String(v).trim(); })
    .filter(function (v) { return v && !seen[v] && (seen[v] = true); });
  return options.length ? options.slice(0, 40) : CONFIG.DEFAULT_CATEGORIES.slice();
}

/** 마지막으로 내용이 있는 행 (체크박스·서식만 있는 아래쪽 빈 행은 무시) */
function lastDataRow_(ctx) {
  var sheet = ctx.sheet, last = sheet.getLastRow();
  if (last <= ctx.headerRow) return ctx.headerRow;
  var cols = ['title', 'link', 'datetime', 'venue'].map(function (k) { return ctx.map[k]; }).filter(Boolean);
  if (!cols.length) return last;
  var height = last - ctx.headerRow;
  var result = ctx.headerRow;
  cols.forEach(function (c) {
    var vals = sheet.getRange(ctx.headerRow + 1, c, height, 1).getDisplayValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]).trim()) { result = Math.max(result, ctx.headerRow + 1 + i); break; }
    }
  });
  return result;
}

function writeRow_(ctx, ev) {
  var sheet = ctx.sheet;
  var prevRow = lastDataRow_(ctx);
  var rowNum = prevRow + 1;
  var width = Math.max(sheet.getLastColumn(), 1);
  if (rowNum > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);

  // 윗줄 서식(글꼴·테두리·드롭다운)을 그대로 이어받기
  if (prevRow > ctx.headerRow) {
    sheet.getRange(prevRow, 1, 1, width).copyTo(sheet.getRange(rowNum, 1, 1, width), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }

  var range = sheet.getRange(rowNum, 1, 1, width);
  var values = range.getValues()[0];
  var formulas = range.getFormulas()[0];
  var out = values.map(function (v, i) { return formulas[i] || v; }); // 기존 수식·체크박스는 유지

  var hasTimeCol = !!ctx.map.time;
  var cells = {
    category: ev.category,
    host: ev.host,
    organizer: ev.organizer,
    sponsor: ev.sponsor,
    account: ev.account ? '@' + ev.account : '',
    title: ev.title,
    datetime: hasTimeCol ? [formatDateRange_(ev, true), ev.dateNote].filter(String).join(' · ') : formatDateTime_(ev, true),
    time: ev.time,
    venue: ev.venue,
    region: ev.region,
    summary: ctx.map.details ? ev.summary : [ev.summary, ev.details].filter(String).join('\n\n'),
    details: ctx.map.summary ? ev.details : [ev.summary, ev.details].filter(String).join('\n\n'),
    link: ev.link,
    poster: ev.poster,
    issue: ev.issue,
    registeredAt: ev.registeredAt
  };
  Object.keys(cells).forEach(function (k) {
    if (ctx.map[k]) out[ctx.map[k] - 1] = cells[k] || '';
  });
  if (ctx.combined) {
    out[ctx.combined - 1] = [['주최', ev.host], ['주관', ev.organizer], ['후원', ev.sponsor]]
      .filter(function (p) { return p[1]; }).map(function (p) { return p[0] + ': ' + p[1]; }).join('\n');
  }
  if (ctx.map.no && prevRow > ctx.headerRow) {
    var prevNo = Number(sheet.getRange(prevRow, ctx.map.no).getValue());
    if (!isNaN(prevNo) && prevNo > 0 && !formulas[ctx.map.no - 1]) out[ctx.map.no - 1] = prevNo + 1;
  }

  // 날짜처럼 보이는 글자가 자동으로 날짜 값으로 바뀌지 않게 텍스트로 고정
  ['issue', 'datetime', 'time', 'registeredAt'].forEach(function (k) {
    if (ctx.map[k]) sheet.getRange(rowNum, ctx.map[k]).setNumberFormat('@');
  });
  range.setValues([out]);
  return rowNum;
}

/** '바자가자' 시트를 읽어 행사 목록으로 */
function readEvents_(ctx) {
  var sheet = ctx.sheet, last = sheet.getLastRow();
  if (last <= ctx.headerRow) return [];
  var values = sheet.getRange(ctx.headerRow + 1, 1, last - ctx.headerRow, Math.max(sheet.getLastColumn(), 1)).getDisplayValues();
  return values.map(function (r) {
    var ev = {};
    FIELDS.forEach(function (f) { ev[f.key] = ctx.map[f.key] ? String(r[ctx.map[f.key] - 1] || '').trim() : ''; });
    ev.account = ev.account.replace(/^@/, '');
    ev.issueKey = normalizeDate_(ev.issue) || ev.issue;
    ev.issueLabel = parseYmd_(ev.issueKey) ? formatIssue_(ev.issueKey) : ev.issue;
    var yearHint = (parseYmd_(ev.issueKey) ? ev.issueKey : normalizeDate_(ev.registeredAt) || '').slice(0, 4);
    var range = dateRange_(ev.datetime, yearHint);
    ev.startKey = range ? range.start : '';
    ev.endKey = range ? range.end : '';
    ev.sortKey = ev.startKey || '9999';
    return ev;
  }).filter(function (ev) { return ev.title || ev.link; });
}

/* ───────────────────────── 주간바자 정리 시트 ───────────────────────── */

/**
 * '주간바자 정리' 시트를 '바자가자' 기준으로 새로 그립니다.
 * 행사 일시를 보고 월~일 한 주 단위로 묶습니다. 여러 주에 걸친 행사는 걸친 주마다 들어가요.
 * 순서: 다음 발행호의 주부터 앞으로의 주 → 지난 주(최근 WEEKLY_PAST_WEEKS주)
 * 왼쪽(A~G): 그 주 행사 목록 / 오른쪽(I~L): 디자인용 행사명·일시·장소
 * 함께 '피그마용' 시트(다음 발행호 행사만, 한 줄에 하나)도 갱신합니다.
 */
function rebuildWeeklySheet(ssArg) {
  var ss = ssArg && ssArg.getSheets ? ssArg : getSpreadsheet_();
  var ctx = listContext_(ss);
  var weekly = ss.getSheetByName(CONFIG.WEEKLY_SHEET) || ss.insertSheet(CONFIG.WEEKLY_SHEET, ss.getNumSheets());
  var all = readEvents_(ctx);

  var issueWeek = weekOfIssue_(issueFor_(new Date()));
  var oldest = addDays_(mondayOf_(ymd_(new Date())), -7 * CONFIG.WEEKLY_PAST_WEEKS);

  var groups = {};
  var undated = [];
  all.forEach(function (ev) {
    if (!ev.startKey) {
      // 날짜를 못 읽었지만 최근 발행호로 등록된 행사는 따로 모아 보여줌
      if (parseYmd_(ev.issueKey) && ev.issueKey >= oldest) undated.push(ev);
      return;
    }
    var from = mondayOf_(ev.startKey), to = mondayOf_(ev.endKey || ev.startKey);
    if (from < oldest) from = oldest;
    for (var w = from, n = 0; w <= to && n < 12; w = addDays_(w, 7), n++) {
      (groups[w] = groups[w] || []).push(ev);
    }
  });

  var upcoming = Object.keys(groups).filter(function (w) { return w >= issueWeek; }).sort();
  var past = Object.keys(groups).filter(function (w) { return w < issueWeek; }).sort().reverse();
  var weeks = upcoming.concat(past);

  weekly.clear();
  weekly.getRange(1, 1, weekly.getMaxRows(), weekly.getMaxColumns()).breakApart();

  var LEFT = ['No', '카테고리', '행사명', '계정', '일시', '장소', '지역'];
  var RIGHT = ['행사명', '일시', '장소', '복사용'];
  var WIDTH = LEFT.length + 1 + RIGHT.length;
  var values = [], styles = [];
  function pad(arr) { while (arr.length < WIDTH) arr.push(''); return arr; }
  function block(title, list) {
    values.push(pad([title]));
    styles.push({ row: values.length, kind: 'issue' });
    values.push(LEFT.concat([''], RIGHT));
    styles.push({ row: values.length, kind: 'header' });
    list.forEach(function (ev, i) {
      var d = formatDesign_(ev);
      values.push([i + 1, ev.category, ev.title, ev.account ? '@' + ev.account : '',
        [ev.datetime, ev.time].filter(String).join(' '), ev.venue, ev.region, '',
        d.title, d.datetime, d.venue, [d.title, d.datetime, d.venue].filter(String).join('\n')]);
    });
    values.push(pad([]));
  }

  if (!weeks.length && !undated.length) values.push(pad(['아직 정리할 행사가 없어요. 웹앱에서 행사를 추가하면 여기에 월~일 주별로 정리돼요.']));

  weeks.forEach(function (w) {
    var list = sortEvents_(groups[w]);
    var tag = w === issueWeek ? '  ◀ 다음 발행' : '';
    block(formatWeek_(w) + ' · ' + formatIssue_(issueOfWeek_(w)) + ' 주간바자 · ' + list.length + '건' + tag, list);
  });
  if (undated.length) block('날짜 확인 필요 · 일시를 읽지 못한 행사 ' + undated.length + '건', undated);

  var range = weekly.getRange(1, 1, values.length, WIDTH);
  range.setNumberFormat('@').setValues(values).setVerticalAlignment('middle').setWrap(true);

  styles.forEach(function (s) {
    if (s.kind === 'issue') {
      weekly.getRange(s.row, 1, 1, WIDTH).merge()
        .setBackground('#0f1a1f').setFontColor(CONFIG.PRIMARY).setFontWeight('bold').setFontSize(12);
    } else {
      weekly.getRange(s.row, 1, 1, LEFT.length).setBackground(CONFIG.PRIMARY).setFontColor('#001417').setFontWeight('bold');
      weekly.getRange(s.row, LEFT.length + 2, 1, RIGHT.length).setBackground('#1b2a30').setFontColor(CONFIG.PRIMARY).setFontWeight('bold');
    }
  });
  [36, 100, 220, 130, 210, 180, 100, 16, 200, 170, 160, 260].forEach(function (w, i) { weekly.setColumnWidth(i + 1, w); });

  rebuildFigmaSheet_(ss, sortEvents_(groups[issueWeek] || []), issueWeek);
}

/**
 * '피그마용' 시트: 다음 발행호 주의 행사만, 1행 머리글 + 한 줄에 행사 하나.
 * 피그마 플러그인(구글 시트 연동)이나 Claude가 그대로 읽기 좋은 모양입니다.
 */
function rebuildFigmaSheet_(ss, list, week) {
  var sheet = ss.getSheetByName(CONFIG.FIGMA_SHEET) || ss.insertSheet(CONFIG.FIGMA_SHEET, ss.getNumSheets());
  var header = ['번호', '행사명', '일시', '장소', '카테고리', '지역', '계정', '포스터', '발행호', '기간'];
  var rows = [header];
  list.forEach(function (ev, i) {
    var d = formatDesign_(ev);
    rows.push([String(i + 1), d.title, d.datetime, d.venue, ev.category, ev.region,
      ev.account ? '@' + ev.account : '', ev.poster, formatIssue_(issueOfWeek_(week)), formatWeek_(week)]);
  });
  sheet.clear();
  sheet.getRange(1, 1, rows.length, header.length).setNumberFormat('@').setValues(rows).setVerticalAlignment('middle');
  sheet.getRange(1, 1, 1, header.length).setBackground(CONFIG.PRIMARY).setFontColor('#001417').setFontWeight('bold');
  sheet.setFrozenRows(1);
  [48, 220, 200, 180, 100, 100, 130, 200, 110, 170].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
}

function sortEvents_(list) {
  return list.slice().sort(function (a, b) {
    return a.sortKey.localeCompare(b.sortKey) || String(a.title).localeCompare(String(b.title));
  });
}

/** 주(월요일 key)와 기간이 겹치는 행사 */
function eventsInWeek_(events, week) {
  var sunday = addDays_(week, 6);
  return sortEvents_(events.filter(function (ev) {
    return ev.startKey && ev.startKey <= sunday && (ev.endKey || ev.startKey) >= week;
  }));
}

/* ───────────────────────── AI 호출 ───────────────────────── */

var EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string', description: '카테고리. 주어진 목록 중 가장 알맞은 것 하나' },
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
    summary: { type: 'string', description: '내용: 어떤 행사인지 1~2문장 소개' },
    details: { type: 'string', description: '세부내용: 줄바꿈으로 구분된 3~6줄. 주요 프로그램, 참가비, 신청 방법/기간, 문의 등 있는 것만' },
    missing: { type: 'array', items: { type: 'string' }, description: '정보가 없어서 비워둔 항목 이름들' }
  },
  required: ['category', 'host', 'organizer', 'sponsor', 'account', 'title', 'startDate', 'endDate', 'time',
    'dateNote', 'venue', 'region', 'summary', 'details', 'missing']
};

function buildPrompt_(input, today, urlAccount, categories) {
  return [
    '너는 바자회의소의 "주간바자" 편집자야. 인스타그램에 올라온 행사 게시물(포스터 이미지와 캡션)을 읽고 행사 정보를 정리해.',
    '',
    '규칙:',
    '- 포스터와 캡션에 실제로 있는 정보만 써. 추측으로 채우지 말고, 없으면 빈 문자열로 두고 missing에 적어.',
    '- 오늘은 ' + today + '이야. 연도가 없는 날짜는 오늘 이후 가장 가까운 날짜로 해석해.',
    '- 주최/주관/후원이 구분 없이 "함께하는 곳" 등으로만 나오면 주최에 넣어.',
    '- 카테고리는 다음 중 하나로 골라: ' + categories.join(', '),
    '- 지역은 장소 주소나 이름으로 알 수 있을 때만 "서울 마포구"처럼 시/도 + 시/군/구로 적어.',
    '- 내용과 세부내용은 사람이 읽기 좋게 한국어로 간결하게. 해시태그와 이모지는 빼.',
    '',
    '인스타그램 링크: ' + (input.link || '(없음)'),
    urlAccount ? '링크에서 확인된 계정명: ' + urlAccount : '',
    '',
    '캡션:',
    input.caption ? input.caption : '(캡션 없음 — 포스터만 보고 정리해)'
  ].join('\n');
}

/** Gemini (Google AI Studio 무료 등급) */
function callGemini_(input, prompt) {
  var key = prop_('GEMINI_API_KEY');
  if (!key) throw new Error('스크립트 속성에 GEMINI_API_KEY를 넣어주세요. (README 3단계)');

  var parts = [];
  if (input.image && input.image.data) {
    parts.push({ inline_data: { mime_type: input.image.mimeType || 'image/jpeg', data: input.image.data } });
  }
  parts.push({ text: prompt });

  var schema = { type: 'OBJECT', properties: {}, required: EVENT_SCHEMA.required };
  Object.keys(EVENT_SCHEMA.properties).forEach(function (k) {
    var p = EVENT_SCHEMA.properties[k];
    schema.properties[k] = p.type === 'array'
      ? { type: 'ARRAY', items: { type: 'STRING' }, description: p.description }
      : { type: 'STRING', description: p.description };
  });
  var payload = JSON.stringify({
    contents: [{ role: 'user', parts: parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 }
  });

  var models = (prop_('AI_MODEL') ? [prop_('AI_MODEL')] : []).concat(CONFIG.GEMINI_MODELS)
    .filter(function (m, i, a) { return a.indexOf(m) === i; });
  var errors = [], limited = 0;
  for (var i = 0; i < models.length; i++) {
    for (var attempt = 0; attempt < 3; attempt++) {
      var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': key },
        payload: payload,
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      var json;
      try { json = JSON.parse(res.getContentText() || '{}'); } catch (e) { json = {}; }
      if (code === 200) {
        var cand = json.candidates && json.candidates[0];
        if (!cand || !cand.content) throw new Error('AI가 답을 주지 않았어요. (' + ((cand && cand.finishReason) || '빈 응답') + ')');
        return JSON.parse(cand.content.parts.map(function (p) { return p.text || ''; }).join(''));
      }
      if ((code === 503 || code === 500) && attempt < 2) { Utilities.sleep(2000 * (attempt + 1)); continue; } // 일시적 과부하
      if (code === 429) limited++;
      errors.push(models[i] + ': ' + ((json.error && json.error.message) || ('HTTP ' + code)));
      break; // 한도 초과·모델 없음 등은 다음 모델로
    }
  }
  if (limited === models.length) throw new Error('무료 사용 한도를 넘었어요. 1분 뒤에 다시 눌러주세요. (하루 한도라면 내일 다시)');
  throw new Error('Gemini API 오류 — ' + errors.join(' / '));
}

/** Claude (유료, 선택) */
function callClaude_(input, prompt) {
  var key = prop_('ANTHROPIC_API_KEY');
  if (!key) throw new Error('스크립트 속성에 ANTHROPIC_API_KEY를 넣어주세요.');

  var content = [];
  if (input.image && input.image.data) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mimeType || 'image/jpeg', data: input.image.data } });
  }
  content.push({ type: 'text', text: prompt });

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    payload: JSON.stringify({
      model: prop_('AI_MODEL') || CONFIG.CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: EVENT_SCHEMA } },
      fallbacks: 'default',
      messages: [{ role: 'user', content: content }]
    }),
    muteHttpExceptions: true
  });
  var json = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('Claude API 오류 (' + res.getResponseCode() + '): ' + (json.error && json.error.message));
  }
  if (json.stop_reason === 'refusal') throw new Error('AI가 이 게시물 정리를 거절했어요. 직접 입력해주세요.');
  if (json.stop_reason === 'max_tokens') throw new Error('AI 응답이 잘렸어요. 다시 시도해주세요.');
  return JSON.parse(json.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join(''));
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

/** 시트에서 사람이 2026. 10. 3 / 2026년 10월 3일처럼 적어도 YYYY-MM-DD로 맞춥니다. */
function normalizeDate_(s) {
  var m = String(s || '').match(/(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/);
  return m ? m[1] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[3]) : '';
}

/**
 * 일시 문자열에서 시작일·종료일을 찾습니다. 연도가 없으면 yearHint(발행호/등록일 연도) 사용.
 * 예: '2026.10.03(토) ~ 10.05(월) 11:00~18:00' → {start:'2026-10-03', end:'2026-10-05'}
 *     '10/3~10/5', '10월 3일', '2026-12-30 ~ 2027-01-02' 도 읽어요.
 */
function dateRange_(text, yearHint) {
  var re = /(?:(\d{4})\s*[.\-\/년]\s*)?(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})(?!\d)/g;
  var hint = +yearHint || +Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy');
  var dates = [], m, prev = null;
  while ((m = re.exec(String(text || ''))) !== null) {
    var mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    var y = m[1] ? +m[1] : prev ? prev.y + (mo < prev.mo ? 1 : 0) : hint;
    prev = { y: y, mo: mo };
    dates.push(y + '-' + pad2_(mo) + '-' + pad2_(d));
  }
  if (!dates.length) return null;
  var end = dates[dates.length - 1];
  return { start: dates[0], end: end >= dates[0] ? end : dates[0] };
}

function ymd_(date) { return Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd'); }

function addDays_(key, n) {
  var d = parseYmd_(key);
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
}

/** 그 날짜가 속한 주의 월요일 (YYYY-MM-DD) */
function mondayOf_(key) {
  var d = parseYmd_(key);
  return addDays_(key, -((d.getDay() + 6) % 7));
}

/** 목요일 발행호가 다루는 주의 월요일 */
function weekOfIssue_(issue) {
  return addDays_(mondayOf_(issue), 7 * CONFIG.ISSUE_WEEK_OFFSET);
}

/** 주(월요일)를 다루는 목요일 발행호 */
function issueOfWeek_(week) {
  return addDays_(week, 3 - 7 * CONFIG.ISSUE_WEEK_OFFSET);
}

/** 2026.09.28(월) ~ 10.04(일) */
function formatWeek_(week) {
  var s = parseYmd_(week), e = parseYmd_(addDays_(week, 6));
  return fmtDay_(s, true) + ' ~ ' + fmtDay_(e, s.getFullYear() !== e.getFullYear());
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
  return fmtDay_(s, withYear) + ' ~ ' + fmtDay_(e, withYear && s.getFullYear() !== e.getFullYear());
}

/** 시트에 들어가는 일시: 2026.10.03(토) ~ 10.05(월) 11:00~18:00 · 우천 시 취소 */
function formatDateTime_(ev, withYear) {
  var main = [formatDateRange_(ev, withYear), ev.time].filter(String).join(' ');
  return [main, ev.dateNote].filter(String).join(' · ');
}

/**
 * 디자인용(주간바자 정리 오른쪽) 형식. 나은쌤 템플릿에 맞춰 여기만 고치면 됩니다.
 * 시트에 적힌 일시에서 연도만 뺍니다: 2026.10.03(토) → 10.03(토)
 */
function formatDesign_(ev) {
  var dt = [ev.datetime, ev.time].filter(String).join(' ')
    .replace(/(^|[\s~\-])(\d{4})\s*[.\-\/]\s*(?=\d{1,2}\s*[.\-\/])/g, '$1')
    .replace(/(^|[\s~\-])\d{4}년\s*/g, '$1');
  return { title: ev.title || '', datetime: dt.trim(), venue: ev.venue || '' };
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/* ───────────────────────── 기타 유틸 ───────────────────────── */

function normalizeEvent_(d) {
  d = d || {};
  var keys = ['category', 'host', 'organizer', 'sponsor', 'account', 'title', 'startDate', 'endDate', 'time',
    'dateNote', 'venue', 'region', 'summary', 'details', 'link', 'poster', 'issue'];
  var ev = {};
  keys.forEach(function (k) { ev[k] = d[k] == null ? '' : String(d[k]).trim(); });
  ev.account = ev.account.replace(/^@/, '');
  ev.startDate = normalizeDate_(ev.startDate);
  ev.endDate = normalizeDate_(ev.endDate) || ev.startDate;
  ev.issue = normalizeDate_(ev.issue);
  ev.missing = d.missing || [];
  return ev;
}

function getSpreadsheet_() {
  var id = prop_('SPREADSHEET_ID') || CONFIG.SPREADSHEET_ID;
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
    throw new Error('스프레드시트를 열 수 없어요. 배포한 계정에 편집 권한이 있는지 확인해주세요.');
  }
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

/* ───────────────────────── 설치·메뉴 ───────────────────────── */

/** 처음 한 번 실행: 권한 승인 + 시트 연결 확인 + 주간 시트·포스터 폴더 만들기 */
function setup() {
  var ss = getSpreadsheet_();
  var ctx = listContext_(ss);
  posterFolder_();
  rebuildWeeklySheet(ss);
  var s = mappingSummary_(ctx);
  Logger.log('바자가자 시트 %s행 머리글 연결: %s', s.headerRow,
    s.columns.map(function (c) { return c.field + '→' + c.col + '열(' + c.header + ')'; }).join(', '));
  if (s.missing.length) Logger.log('시트에 없는 항목(저장 시 링크·포스터·발행호 열만 자동 추가): %s', s.missing.join(', '));
  if (s.unmapped.length) Logger.log('연결 안 된 머리글(비워둠): %s', s.unmapped.join(', '));
}

function showAppLink() {
  var url = ScriptApp.getService().getUrl();
  var html = url
    ? '<div style="font-family:sans-serif;font-size:14px;line-height:1.6">' +
      '<p><b>주간바자 행사 정리기 주소</b></p>' +
      '<p><a href="' + url + '" target="_blank" style="color:#0a8fa0;word-break:break-all">' + url + '</a></p>' +
      '<p style="color:#666">휴대폰에서 이 주소를 열고 <b>홈 화면에 추가</b>하면 앱처럼 쓸 수 있어요.</p></div>'
    : '<div style="font-family:sans-serif;font-size:14px">아직 웹앱으로 배포하지 않았어요.<br>Apps Script 편집기에서 <b>배포 &gt; 새 배포 &gt; 웹 앱</b>을 먼저 해주세요.</div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(420).setHeight(180), '정리기 열기');
}

function showMapping() {
  var s = mappingSummary_(listContext_(SpreadsheetApp.getActiveSpreadsheet()));
  var lines = ['[' + s.sheet + '] 시트 ' + s.headerRow + '행 머리글 기준', ''];
  s.columns.forEach(function (c) { lines.push(c.col + '열 ' + c.header + '  ←  ' + c.field); });
  if (s.missing.length) lines.push('', '시트에 없는 항목: ' + s.missing.join(', '));
  if (s.unmapped.length) lines.push('비워두는 열: ' + s.unmapped.join(', '));
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}
