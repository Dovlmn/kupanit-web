/* KUPANIT_APP — ממשק הקופנית. נטען בכל פתיחה של האפליקציה. */
/* הגדרות Firebase של הקופנית (לא סוד: הגישה לנתונים נשלטת בכללי האבטחה ב-Firebase) */
window.KUPANIT_FIREBASE = window.KUPANIT_FIREBASE || {
  apiKey: "AIzaSyAbz2KkJaqJ8eqcPnsenmedouCQ8B9BB7o",
  authDomain: "kupanit-97e54.firebaseapp.com",
  projectId: "kupanit-97e54",
  storageBucket: "kupanit-97e54.firebasestorage.app",
  messagingSenderId: "981597127863",
  appId: "1:981597127863:web:71b596db89dfdd60adb932"
};
(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => (Math.round(n) || 0).toLocaleString('he-IL') + ' ₪';
const fmt2 = n => (Number(n)||0).toLocaleString('he-IL',{minimumFractionDigits:0,maximumFractionDigits:2}) + ' ₪';

const CATS = ['מזון וצריכה','מסעדות, קפה וברים','ארנונה','חשמל וגז','מים','שירותי תקשורת','רכב','דלק','תחבורה','רפואה ובתי מרקחת','אופנה','ילדים וחינוך','פנאי, בידור וספורט','העברת כספים','תרומות','עיצוב הבית','קוסמטיקה וטיפוח','ספרים ומכשירי כתיבה','מוצרי חשמל ומחשבים','שונות'];
const RENAME = {'חשמל ומחשבים':'מוצרי חשמל ומחשבים','ספרים ודפוס':'ספרים ומכשירי כתיבה','תחבורה ורכבים':'תחבורה','דלק, חשמל וגז':'דלק'};
const canon = c => RENAME[c] || c;
const GROUPS = [{ name: 'חשבונות שוטפים', cats: ['ארנונה','חשמל וגז','מים','שירותי תקשורת'] }, { name: 'רכב ותחבורה', cats: ['רכב','דלק','תחבורה'] }];
const DEFAULT_EXCLUDE = ['TOP TYCOON','מס הכנסה','מע"מ','ביטוח לאומי'];
const SUBS = ['SPOTIFY','APPLE','GOOGLE','NETFLIX','ANTHROPIC','OBSIDIAN','YOUTUBE','DISNEY','MICROSOFT','DROPBOX','OPENAI','AMAZON PRIME'];
const FIXED_CATS = ['עירייה וממשלה','ביטוח','שירותי תקשורת','ארנונה','מים'];
const PAY = {card:'אשראי',cash:'מזומן',bit:'ביט'};
const customCats = () => Array.isArray(S.settings.customCats) ? S.settings.customCats : [];
const allCats = () => [...new Set([...CATS, ...customCats().map(canon)])];

const S = { statements: [], captures: [], settings: { weeklyBudget: 0, rules: {} }, settingsLoaded:false,
  db: null, user: null, me: null, canWrite: true, names: {}, tab: 'week', month: null, openCat: null, openMerchant: null,
  capCat: 'מזון וצריכה', capPay: 'card', pending: null };

/* ---------- dates ---------- */
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fromIso = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = fromIso(s); d.setDate(d.getDate()+n); return iso(d); };
const WEEK_DAY = 4, WEEK_MIN = 13 * 60; // השבוע מתחיל ביום חמישי ב-13:00
const nowTm = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const weekOf = (d, tm) => { const x = fromIso(d); let diff = (x.getDay() - WEEK_DAY + 7) % 7; if (diff === 0 && tm < WEEK_MIN) diff = 7; x.setDate(x.getDate() - diff); return iso(x); };
const weekStart = (s, tm) => weekOf(s, tm ?? (s === today() ? nowTm() : 24 * 60));
const dayDiff = (a, b) => Math.round((fromIso(a) - fromIso(b)) / 864e5);
const shortDate = s => { const [y,m,d] = s.split('-'); return `${+d}.${+m}`; };
const HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const monthName = ym => { const [y,m] = ym.split('-'); return `${HEB_MONTHS[+m-1]} ${y}`; };
const today = () => iso(new Date());
const hhmm = () => { const n = new Date(); return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); };

/* ---------- classification ---------- */
function normMerchant(raw) {
  let s = String(raw || '').split(/\s{2,}/)[0].trim();
  s = s.split(' ').filter(t => !(/\d/.test(t) && /^[A-Z0-9]{6,}$/i.test(t))).join(' ');
  return s.replace(/\s+/g,' ').trim() || String(raw||'').trim();
}
const excludeList = () => Array.isArray(S.settings.exclude) ? S.settings.exclude : DEFAULT_EXCLUDE;
const ruleOf = key => (S.settings.rules || {})[key] || {};
function isExcluded(r) {
  const rule = ruleOf(r.key);
  if (rule.excluded === true) return true;
  if (rule.excluded === false) return false;
  const up = r.raw.toUpperCase();
  return excludeList().some(p => p && up.includes(p.toUpperCase()));
}
function kindOf(r) {
  const rule = ruleOf(r.key);
  if (rule.kind) return rule.kind;
  if (r.src === 'cap') return 'variable';
  if (/הוראת קבע/.test(r.n) || r.t === 'תשלומים' || /חיוב חודשי/.test(r.t)) return 'fixed';
  if (FIXED_CATS.includes(r.c)) return 'fixed';
  const up = r.raw.toUpperCase();
  if (SUBS.some(k => up.includes(k))) return 'fixed';
  return 'variable';
}
function baseCat(r) {
  const c = r.c || 'שונות';
  if (c === 'דלק, חשמל וגז') return /חשמל|גז|GAS/i.test(r.raw) ? 'חשמל וגז' : 'דלק';
  return canon(c);
}
const catOf = r => { const rc = ruleOf(r.key).cat; return rc ? canon(rc) : baseCat(r); };

function statementRows() {
  const out = [];
  for (const st of S.statements) for (const x of (st.rows || [])) {
    const key = normMerchant(x.m);
    out.push({ src:'st', d:x.d, raw:String(x.m||''), key, a:+x.a, c:x.c||'', t:x.t||'', n:x.n||'', card:st.card, month:st.month });
  }
  return out.map(r => ({...r, cat: catOf(r), kind: kindOf(r), excl: isExcluded(r)}));
}
function captureRows() {
  return S.captures.map(c => { const r = { src:'cap', id:c.id, d:c.date, tm: capTm(c), time: c.time || '', raw:c.note || c.category, key: normMerchant(c.note || c.category), a:+c.amount, c:c.category, t:'', n:'', pay:c.pay, by:c.by };
    return {...r, cat: canon(ruleOf(r.key).cat || c.category || 'שונות'), kind: kindOf(r), excl: isExcluded(r)}; });
}
/* A manual entry that also shows up on a statement (same amount, within 4 days) is counted once. */
function matchSet(st, caps) {
  const used = new Set(), matched = new Map();
  const sorted = [...caps].sort((a,b) => a.d < b.d ? -1 : 1);
  for (const c of sorted) {
    let best = -1, bestGap = 99;
    st.forEach((r, i) => { if (used.has(i)) return; if (Math.abs(r.a - c.a) > 1) return;
      const g = Math.abs(dayDiff(r.d, c.d)); if (g <= 4 && g < bestGap) { best = i; bestGap = g; } });
    if (best >= 0) { used.add(best); matched.set(c.id, st[best]); }
  }
  return matched;
}
const countsForWeek = r => !r.excl && r.kind === 'variable' && r.cat !== 'משיכת מזומן';

/* ---------- render: week ---------- */
function budgetFor(ws) {
  const h = Array.isArray(S.settings.budgetHist) ? S.settings.budgetHist : [];
  let b = null; for (const e of h) if (e.from <= ws) b = +e.amount;
  return b ?? (+S.settings.weeklyBudget || 0);
}
function capTm(c) {
  if (c.time && /^\d{1,2}:\d{2}$/.test(c.time)) { const [h, m] = c.time.split(':').map(Number); return h * 60 + m; }
  if (c.createdAt) { const t = new Date(c.createdAt); if (iso(t) === c.date) return t.getHours() * 60 + t.getMinutes(); }
  return 12 * 60;
}
function startParts() {
  const [sd, stt] = String(S.settings.budgetStart || '0000-00-00').split('T');
  return { sd, sTm: stt ? (+stt.slice(0, 2)) * 60 + (+stt.slice(3, 5)) : 0 };
}
/* Each counted expense gets a week key: the Thursday whose 13:00 opens its week.
   A statement line has no time, so it takes the time of the manual entry it matched;
   an unmatched Thursday statement line counts in the week that opens that day. */
function weekData() {
  const st = statementRows(), caps = captureRows(), matched = matchSet(st, caps);
  const stTm = new Map(); for (const [cid, row] of matched) { const c = caps.find(x => x.id === cid); if (c) stTm.set(row, c.tm); }
  const { sd, sTm } = startParts();
  const after = r => r.d > sd || (r.d === sd && r.tm >= sTm);
  const all = [
    ...st.filter(countsForWeek).map(r => ({ ...r, tm: stTm.has(r) ? stTm.get(r) : WEEK_MIN })),
    ...caps.filter(r => countsForWeek(r) && !matched.has(r.id))
  ].filter(after).map(r => ({ ...r, wk: weekOf(r.d, r.tm) }));
  const items = wk => all.filter(r => r.wk === wk);
  return { items, caps, sd, sTm };
}
function savingsInfo(items, curWs, sd, sTm) {
  const weeks = [];
  if (!S.settings.budgetStart) return { weeks, total: 0, streak: 0 };
  const from = S.settings.savingsFrom || '0000-00-00';
  for (let a = weekOf(sd, sTm); a < curWs; a = addDays(a, 7)) {
    const budget = budgetFor(a), spent = items(a).reduce((s, r) => s + r.a, 0);
    const transition = a < from;
    weeks.push({ a, budget, spent, transition, saved: transition ? 0 : Math.max(0, budget - spent) });
  }
  // Running balance: leftovers go in, an overspent week is covered from what is there (never below zero).
  // An overspend the jar cannot cover is carried over: it comes off the next week's budget.
  let bal = 0, debt = 0;
  for (const w of weeks) {
    w.covered = 0; w.uncovered = 0; w.base = w.budget; w.debtIn = 0;
    if (w.transition) { w.balance = bal; continue; }
    w.debtIn = debt; w.budget = w.base - debt; debt = 0;
    if (w.spent <= w.budget) { w.saved = w.budget - w.spent; bal += w.saved; }
    else { w.saved = 0; const over = w.spent - w.budget; w.covered = Math.min(bal, over); w.uncovered = over - w.covered; bal -= w.covered; debt = w.uncovered; }
    w.balance = bal;
  }
  let streak = 0; for (let i = weeks.length - 1; i >= 0 && weeks[i].saved > 0; i--) streak++;
  return { weeks, total: bal, debt, streak };
}
const JAR = `<svg class="jar" viewBox="0 0 64 64" aria-hidden="true">
  <rect x="18" y="6" width="28" height="8" rx="3" fill="var(--accent)"/>
  <path d="M20 14h24v4c6 3 9 9 9 16v14c0 6-5 10-11 10H22c-6 0-11-4-11-10V34c0-7 3-13 9-16z" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2.5"/>
  <circle class="coin" cx="32" cy="2" r="6" fill="var(--gold)" stroke="var(--gold-ink)" stroke-width="2"/>
  <ellipse cx="25" cy="49" rx="7" ry="3.2" fill="var(--gold)" stroke="var(--gold-ink)" stroke-width="1.6"/>
  <ellipse cx="38" cy="50" rx="7" ry="3.2" fill="var(--gold)" stroke="var(--gold-ink)" stroke-width="1.6"/>
  <ellipse cx="31" cy="44" rx="7" ry="3.2" fill="var(--gold)" stroke="var(--gold-ink)" stroke-width="1.6"/>
</svg>`;
function praise(w, streak) {
  if (streak >= 4) return `${streak} שבועות ברצף מתחת לתקציב. זה כבר הרגל!`;
  if (streak === 3) return 'שלושה שבועות ברצף. אתם על גל!';
  if (streak === 2) return 'שבוע שני ברצף. ממשיכים ככה!';
  if (w.saved >= w.budget * 0.25) return 'שבוע חסכוני במיוחד. כל הכבוד!';
  return 'עמדתם בתקציב. כל הכבוד!';
}
function renderWeek() {
  const { items: weekItems, caps, sd, sTm } = weekData();
  const t = today(), now = nowTm();
  const ws = weekOf(t, now), we = addDays(ws, 7);
  const start = S.settings.budgetStart;
  const sv = savingsInfo(weekItems, ws, sd, sTm);
  const baseBudget = budgetFor(ws);
  const debtIn = ws >= (S.settings.savingsFrom || '0000-00-00') ? (sv.debt || 0) : 0;
  const budget = baseBudget - debtIn;
  const notStarted = !!start && (t < sd || (t === sd && now < sTm));
  const items = notStarted ? [] : weekItems(ws).sort((x, y) => (y.d + String(y.tm).padStart(4, '0')).localeCompare(x.d + String(x.tm).padStart(4, '0')));
  const spent = items.reduce((s, r) => s + r.a, 0);
  const left = budget - spent;
  const TOTAL = 7 * 1440;
  const elapsed = dayDiff(t, ws) * 1440 + now - WEEK_MIN;
  const startOff = Math.max(0, Math.min(TOTAL - 1, dayDiff(sd, ws) * 1440 + sTm - WEEK_MIN));
  const frac = Math.min(1, Math.max(0, (elapsed - startOff) / (TOTAL - startOff)));
  const pace = budget * frac;
  const minsLeft = TOTAL - elapsed;
  const leftTxt = minsLeft >= 1440 ? `עוד ${Math.ceil(minsLeft / 1440)} ימים` : 'פחות מיום';
  const pct = budget ? Math.min(100, spent / budget * 100) : 0;
  const cls = spent > budget ? 'bad' : spent > pace ? 'warn' : '';
  const savesThisWeek = ws >= (S.settings.savingsFrom || '0000-00-00');

  // Thursday notice, every time the app is opened on a Thursday
  const isThu = fromIso(t).getDay() === WEEK_DAY;
  $('#thu').innerHTML = isThu && S.thuHidden !== t && budget && !notStarted ? `
    <div class="card cele" role="status" style="background:var(--surface)">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M12 13v3l2 1"/></svg>
      <div style="flex:1;min-width:0">${now < WEEK_MIN
        ? `<div class="cele-t">היום ב-13:00 מתחיל שבוע חדש</div><div>עד אז נשארו ${fmt(Math.max(0, left))} מהשבוע הנוכחי${savesThisWeek && left > 0 ? ', ומה שיישאר יעבור לקופת החיסכון' : ''}. קניות מ-13:00 והלאה ייספרו בשבוע הבא.</div>`
        : `<div class="cele-t">שבוע חדש התחיל היום ב-13:00</div><div>יש לכם ${fmt(budget)} עד יום חמישי הבא ב-13:00. קניות מ-13:00 והלאה נספרות בשבוע הזה.</div>`}</div>
      <button class="btn ghost" type="button" data-thu-hide="${t}">הבנתי</button></div>` : '';

  // celebration for the week that just ended
  const last = sv.weeks[sv.weeks.length - 1];
  let seen = false; try { seen = !!(last && localStorage.getItem('kupa-cele-' + last.a)); } catch (e) {}
  $('#celebrate').innerHTML = !last || seen ? '' : last.saved > 0 ? `
    <div class="card cele" role="status">${JAR}
      <div style="flex:1;min-width:0"><div class="cele-t">חסכתם ${fmt(last.saved)} בשבוע שעבר!</div>
      <div>${praise(last, sv.streak)} הסכום עבר לקופת החיסכון.</div></div>
      <button class="btn ghost" type="button" data-cele="${last.a}">תודה!</button></div>`
    : last.covered > 0 || last.uncovered > 0 ? `
    <div class="card cele" role="status" style="background:var(--surface);border-color:var(--warn)">${JAR}
      <div style="flex:1;min-width:0"><div class="cele-t" style="color:var(--warn)">בשבוע שעבר חרגתם ב-${fmt(last.covered + last.uncovered)}</div>
      <div>${last.covered > 0 ? `הקופה כיסתה ${fmt(last.covered)}${last.uncovered > 0 ? `, ו-${fmt(last.uncovered)} ירדו מהתקציב של השבוע הזה` : ''}. נשארו בה ${fmt(sv.total)}.` : 'בקופה לא היה כסף לכסות את החריגה.'} שבוע חדש, הזדמנות חדשה!</div></div>
      <button class="btn ghost" type="button" data-cele="${last.a}">הבנתי</button></div>` : '';

  if (notStarted) {
    $('#envelope').innerHTML = `<div class="env-row"><div><div class="small muted" style="font-weight:600">מתחילים נקי</div>
      <div class="env-left num">${fmt(budget)}</div></div>
      <div class="small muted" style="text-align:end">התקציב השבועי מתחיל<br>ב-${shortDate(sd)}</div></div>
      <div class="bar"><i style="width:0"></i></div>
      <div class="small muted">מה שנרשם לפני כן נשמר, אבל לא נספר בתקציב.</div>`;
  } else if (budget) {
    $('#envelope').innerHTML = `
    <div class="env-row">
      <div><div class="small muted" style="font-weight:600">${left >= 0 ? 'נשאר השבוע' : 'חריגה השבוע'}</div>
      <div class="env-left num ${left < 0 ? 'bad' : ''}">${fmt(Math.abs(left))}</div></div>
      <div class="small muted num" style="text-align:end">יצא ${fmt(spent)} מתוך ${fmt(budget)}<br>עד יום חמישי ב-13:00 · ${leftTxt}</div>
    </div>
    <div class="bar" role="img" aria-label="ניצול התקציב השבועי ${Math.round(pct)} אחוז"><i class="${cls}" style="width:${pct}%"></i><b style="inset-inline-start:${frac * 100}%"></b></div>
    ${debtIn > 0 ? `<div class="small" style="color:var(--bad);font-weight:700">התקציב השבוע הוא ${fmt(budget)}: ${fmt(baseBudget)} פחות גירעון של ${fmt(debtIn)} מהשבוע שעבר, שהקופה לא כיסתה.</div>` : ''}
    <div class="legend small muted"><span>הקו מסמן כמה היה צפוי לצאת עד עכשיו: ${fmt(pace)}</span><span>${spent > pace && spent <= budget ? 'מהר מהקצב' : spent <= pace ? 'בקצב' : ''}</span></div>
    ${left < 0 && savesThisWeek ? `<div class="small" style="color:var(--warn);font-weight:700">${sv.total > 0 ? `אם השבוע ייגמר ככה, ${fmt(Math.min(sv.total, -left))} מהחריגה יכוסו מקופת החיסכון (יש בה ${fmt(sv.total)}).` : 'בקופת החיסכון אין כרגע כסף לכיסוי החריגה.'}</div>` : ''}`;
  } else {
    $('#envelope').innerHTML = `<div class="env-row"><div><div class="small muted" style="font-weight:600">יצא השבוע</div><div class="env-left num">${fmt(spent)}</div></div>
       <button class="btn ghost" type="button" data-go="settings">הגדרת תקציב שבועי</button></div>`;
  }

  // savings jar
  const projected = !notStarted && budget && frac > 0.15 && savesThisWeek ? budget - spent / frac : 0;
  const savedWeeks = sv.weeks.filter(w => w.saved > 0).length;
  $('#piggy').innerHTML = start && budget ? `${JAR}
    <div style="flex:1;min-width:0"><div class="small muted" style="font-weight:700">קופת החיסכון</div>
      <div class="pig-total num">${fmt(sv.total)}</div>
      <div class="small muted">${savedWeeks ? `${savedWeeks} שבועות עם חיסכון${sv.streak > 1 ? ` · רצף של ${sv.streak}` : ''}` : 'כל שקל שנשאר בסוף השבוע עובר לכאן.'}</div>
      ${projected > 0 ? `<div class="small" style="color:var(--accent);font-weight:700;margin-top:4px">בקצב הנוכחי יעברו לקופה בערך ${fmt(projected)} בסוף השבוע</div>` : projected < 0 && sv.total > 0 ? `<div class="small" style="color:var(--warn);font-weight:700;margin-top:4px">בקצב הנוכחי יירדו מהקופה בערך ${fmt(Math.min(sv.total, -projected))} בסוף השבוע</div>` : ''}
      ${debtIn > 0 ? `<div class="small" style="color:var(--bad);font-weight:700;margin-top:4px">הקופה ריקה. גירעון של ${fmt(debtIn)} מהשבוע שעבר ירד מהתקציב של השבוע הזה.</div>` : ''}
      <div class="small muted" style="margin-top:4px">הכסף נשאר בקופה, ויוצא ממנה רק כדי לכסות חריגה מתקציב שבועי.</div>
    </div>` : '';
  $('#piggy').hidden = !(start && budget);
  pushWidget({ left: notStarted ? fmt(budget) : fmt(Math.abs(left)), leftLabel: notStarted ? 'התקציב השבועי' : left >= 0 ? 'נשאר השבוע' : 'חריגה השבוע', over: !notStarted && left < 0, jar: start && budget ? fmt(sv.total) : '' });

  $('#week-range').textContent = `${shortDate(ws)} 13:00 – ${shortDate(we)} 13:00`;
  const shown = notStarted ? caps.filter(r => weekOf(r.d, r.tm) === ws).sort((x, y) => x.d < y.d ? 1 : -1) : items;
  $('#week-list').innerHTML = shown.length ? shown.map(r => liHTML(r)).join('') :
    `<div class="empty">עוד לא נרשמו הוצאות השבוע. רשמו את הראשונה בטופס למעלה.</div>`;

  // weeks since the budget started (up to 8)
  const weeks = [];
  const firstWs = start ? weekOf(sd, sTm) : addDays(ws, -49);
  for (let i = 7; i >= 0; i--) { const a = addDays(ws, -7 * i); if (a < firstWs) continue; const w = sv.weeks.find(x => x.a === a); weeks.push({ a, v: weekItems(a).reduce((s, r) => s + r.a, 0), b: a === ws ? budget : (w ? w.budget : budgetFor(a)), done: a < ws, saved: w ? w.saved : 0, covered: w ? w.covered : 0, transition: w ? w.transition : false }); }
  if (notStarted || !weeks.length) { $('#weeks').innerHTML = `<div class="empty">הגרף יתמלא שבוע אחרי שבוע.</div>`; return; }
  const max = Math.max(budget, ...weeks.map(w => Math.max(w.v, w.b)), 1);
  $('#weeks').innerHTML = `<div class="weeks-wrap">
    ${budget ? `<div class="line" style="bottom:${18 + (budget / max) * 88}px"></div>` : ''}
    <div class="weeks" style="grid-template-columns:repeat(${Math.max(weeks.length, 4)},1fr)">${weeks.map(w => `<div class="wk" title="${fmt(w.v)}">${w.done && w.saved > 0 ? `<span class="saved-dot" title="נחסכו ${fmt(w.saved)}">+${Math.round(w.saved).toLocaleString('he-IL')}</span>` : w.done && w.covered > 0 ? `<span class="saved-dot" style="background:var(--sunk);color:var(--warn)" title="כוסו מהקופה ${fmt(w.covered)}">−${Math.round(w.covered).toLocaleString('he-IL')}</span>` : `<span class="num">${w.v ? Math.round(w.v).toLocaleString('he-IL') : ''}</span>`}<div class="col ${w.b && w.v > w.b ? 'over' : ''}" style="height:${(w.v / max) * 88}px;${w.transition ? 'opacity:.45' : ''}"></div><span>${w.transition ? 'מעבר' : shortDate(w.a)}</span></div>`).join('')}</div></div>
    <p class="small muted" style="margin:10px 0 0">כל עמודה היא שבוע שמתחיל ביום חמישי ב-13:00. המספר בזהב הוא מה שעבר לקופה, ומספר עם מינוס הוא חריגה שכוסתה ממנה. "מעבר" הוא השבוע המקוצר שלפני שינוי השיטה, והיתרה שלו לא עברה לקופה. שבועות בלי דף אשראי מראים רק את מה שנרשם ידנית.</p>`;
}
function liHTML(r) {
  const who = r.src === 'cap' ? (S.names[r.by] || '') : `כרטיס ${esc(r.card)}`;
  const edit = r.src === 'cap' && S.canWrite && S.pending !== r.id ? `<button class="linkbtn" data-edit="${esc(r.id)}">עריכה</button>` : '';
  const del = r.src === 'cap' && S.canWrite ? (S.pending === r.id
      ? `<button class="linkbtn danger" data-del-yes="${esc(r.id)}">למחוק?</button><button class="linkbtn" data-del-no>ביטול</button>`
      : `<button class="linkbtn" data-del="${esc(r.id)}" aria-label="מחיקה">מחיקה</button>`) : '';
  return `<div class="li"><div class="main"><div>${esc(r.src === 'cap' ? (r.raw) : r.key)}</div>
    <div class="small muted">${shortDate(r.d)}${r.src === 'cap' && r.time ? ' ' + esc(r.time) : ''} · ${esc(r.cat)}${who ? ' · ' + esc(who) : ''}${r.src === 'cap' ? ' · ' + (PAY[r.pay] || '') : ''}</div></div>
    ${edit}${del}<div class="amt num">${fmt2(r.a)}</div></div>`;
}

/* ---------- render: capture chips ---------- */
function renderCats() {
  // most used categories first
  const freq = {}; S.captures.forEach(c => freq[c.category] = (freq[c.category] || 0) + 1);
  const base = allCats(); if (S.capCat && !base.includes(S.capCat)) base.push(S.capCat);
  const order = base.sort((a, b) => (freq[b] || 0) - (freq[a] || 0));
  $('#cap-cats').innerHTML = order.map(c => `<button type="button" data-cat="${esc(c)}" aria-pressed="${c === S.capCat}">${esc(c)}</button>`).join('')
    + (S.canWrite && S.db ? (S.addingCat
      ? `<div style="display:flex;gap:6px;flex:1 1 100%"><input type="text" id="newcat" placeholder="שם הקטגוריה החדשה" maxlength="30"><button type="button" class="btn ghost" id="newcat-add" style="flex:0 0 auto">הוספה</button><button type="button" class="linkbtn" id="newcat-cancel">ביטול</button></div>`
      : `<button type="button" id="newcat-open" style="border-style:dashed;color:var(--muted)">+ קטגוריה חדשה</button>`) : '');
  if (S.addingCat) { const i = $('#newcat'); if (i) i.focus(); }
}

/* ---------- render: month ---------- */
function renderMonth() {
  const months = [...new Set(S.statements.map(s => s.month))].sort().reverse();
  const sel = $('#month-sel');
  if (!months.length) { sel.hidden = true; $('#month-body').innerHTML = `<div class="card empty">עוד לא הועלו דפי אשראי. מעלים אותם בלשונית "העלאה".</div>`; return; }
  sel.hidden = false;
  if (!S.month || !months.includes(S.month)) S.month = months[0];
  sel.innerHTML = months.map(m => `<option value="${m}" ${m === S.month ? 'selected' : ''}>${monthName(m)}</option>`).join('');

  const allSt = statementRows(), caps = captureRows(), matched = matchSet(allSt, caps);
  const st = allSt.filter(r => r.month === S.month);
  const dmin = st.reduce((m, r) => r.d < m ? r.d : m, '9999'), dmax = st.reduce((m, r) => r.d > m ? r.d : m, '0000');
  const extra = caps.filter(r => !matched.has(r.id) && r.d >= dmin && r.d <= dmax);
  const rows = [...st, ...extra];
  const inc = rows.filter(r => !r.excl), exc = rows.filter(r => r.excl);
  const sum = a => a.reduce((s, r) => s + r.a, 0);
  const total = sum(inc), fixed = sum(inc.filter(r => r.kind === 'fixed')), vari = total - fixed;
  const cards = [...new Set(st.map(r => r.card))];

  const byCat = {};
  for (const r of inc) {
    const c = byCat[r.cat] ||= { name: r.cat, total: 0, fixed: 0, n: 0, m: {} };
    c.total += r.a; c.n++; if (r.kind === 'fixed') c.fixed += r.a;
    const m = c.m[r.key] ||= { key: r.key, total: 0, n: 0, kinds: new Set(), rows: [] };
    m.total += r.a; m.n++; m.kinds.add(r.kind); m.rows.push(r);
  }
  const cats = Object.values(byCat).sort((a, b) => b.total - a.total);
  const maxCat = cats[0]?.total || 1;

  $('#month-body').innerHTML = `
    ${suggestBanner()}
    <div class="kpis">
      <div class="kpi"><div class="k">סך הכל</div><div class="v num">${fmt(total)}</div></div>
      <div class="kpi"><div class="k">קבוע</div><div class="v num">${fmt(fixed)}</div><div class="small muted">${total ? Math.round(fixed / total * 100) : 0}%</div></div>
      <div class="kpi var"><div class="k">משתנה (בשליטה)</div><div class="v num">${fmt(vari)}</div><div class="small muted">${total ? Math.round(vari / total * 100) : 0}%</div></div>
    </div>
    <p class="small muted" style="margin:0">כרטיסים: ${cards.map(esc).join(', ')}${extra.length ? ` · כולל ${extra.length} הוצאות שנרשמו ידנית ולא מופיעות בדף` : ''}. עסקאות מ-${shortDate(dmin)} עד ${shortDate(dmax)}.</p>
    <div class="card">
      <div class="top" style="margin-bottom:6px"><h2>לפי קטגוריה</h2>
        <div class="keyline"><span><i style="background:var(--accent)"></i>משתנה</span><span><i style="background:var(--fixed)"></i>קבוע</span></div></div>
      ${blocksHTML(cats, maxCat, total)}
      ${S.canWrite ? `<button class="btn ghost wide" type="button" data-go="review" style="margin-top:10px">סידור קטגוריות לכל בתי העסק</button>` : ''}
    </div>
    ${exc.length ? `<details class="card"><summary style="cursor:pointer;font-weight:700">לא נכללו בחישוב: ${fmt(sum(exc))} (${exc.length} עסקאות)</summary>
      <div class="list" style="margin-top:8px">${groupList(exc).map(m => `<button class="mrow" data-merchant="${esc(m.key)}" style="margin-top:4px"><span class="main">${esc(m.key)}</span><span class="small muted">${m.n}×</span><span class="num" style="font-weight:700">${fmt(m.total)}</span></button>${S.openMerchant === m.key ? editorHTML(m) : ''}`).join('')}</div></details>` : ''}`;
}
function blocksHTML(cats, maxCat, total) {
  const blocks = []; const used = new Set();
  for (const g of GROUPS) {
    const cs = cats.filter(c => g.cats.includes(c.name)); if (!cs.length) continue;
    cs.forEach(c => used.add(c.name));
    blocks.push({ title: g.name, total: cs.reduce((s, c) => s + c.total, 0), cats: cs });
  }
  for (const c of cats) if (!used.has(c.name)) blocks.push({ title: null, total: c.total, cats: [c] });
  blocks.sort((a, b) => b.total - a.total);
  return blocks.map(b => b.title
    ? `<div class="grp"><div class="grp-hd"><span>${esc(b.title)}</span><span class="num">${fmt(b.total)}</span></div><div class="grp-in">${b.cats.map(c => catHTML(c, maxCat, total)).join('')}</div></div>`
    : catHTML(b.cats[0], maxCat, total)).join('');
}
function suggestBanner() {
  const it = S.suggest && S.suggest.items; if (!it || !S.canWrite) return '';
  const n = Object.values(it).filter(v => v.q).length;
  return `<div class="card" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-color:var(--accent)">
    <div><strong>הכנתי הצעה לסידור הקטגוריות</strong><div class="small muted">${n ? `יש לי ${n} שאלות על בתי עסק שאני לא בטוח לגביהם` : 'כולל קטגוריית תרומות'}</div></div>
    <button class="btn" type="button" data-go="review">לעבור על ההצעה</button></div>`;
}
function renderReview() {
  const box = $('#review-body'); if (!box) return;
  const sug = (S.suggest && S.suggest.items) || {};
  const ms = groupList(statementRows().filter(r => !r.excl));
  const optsBase = new Set([...allCats(), ...Object.values(sug).map(v => v.cat && canon(v.cat)).filter(Boolean), ...ms.map(m => m.rows[0].cat)]);
  const row = (m, i) => {
    const cur = m.rows[0].cat, s = sug[m.key] || {}, pick = (S.rvPick && S.rvPick[m.key]) || (s.cat && canon(s.cat)) || cur;
    const opts = [...new Set([...optsBase, pick])];
    return `<div class="li" style="flex-wrap:wrap;align-items:flex-start" data-rv="${esc(m.key)}">
      <div class="main" style="flex:1 1 200px"><div>${esc(m.key)}</div>
        <div class="small muted num">${fmt(m.total)} · ${m.n} עסקאות${s.cat && s.cat !== cur ? ` · היום: ${esc(cur)}` : ''}</div>
        ${s.q ? `<div class="small" style="color:var(--warn);font-weight:600;margin-top:2px">${esc(s.q)}</div>` : ''}</div>
      <div style="flex:1 1 180px;min-width:0">
        <select class="rv-sel" aria-label="קטגוריה עבור ${esc(m.key)}">${opts.map(c => `<option ${c === pick ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new__">+ קטגוריה חדשה…</option></select>
        <input type="text" class="rv-new" placeholder="שם הקטגוריה החדשה" maxlength="30" style="margin-top:6px" hidden>
      </div></div>`;
  };
  const qs = ms.filter(m => sug[m.key] && sug[m.key].q);
  const moves = ms.filter(m => sug[m.key] && !sug[m.key].q && canon(sug[m.key].cat) !== m.rows[0].cat);
  const rest = ms.filter(m => !qs.includes(m) && !moves.includes(m)).sort((a, b) => a.rows[0].cat.localeCompare(b.rows[0].cat, 'he') || b.total - a.total);
  const block = (title, sub, arr) => arr.length ? `<div class="card"><h3 style="font-size:17px">${title}</h3>${sub ? `<p class="small muted" style="margin:2px 0 4px">${sub}</p>` : ''}<div class="list">${arr.map(row).join('')}</div></div>` : '';
  box.innerHTML = ms.length ? block('שאלות שלי', 'כאן אני לא בטוח. סימנתי את הניחוש הכי סביר.', qs)
    + block('הצעות לשינוי', 'בתי עסק שאני מציע להעביר לקטגוריה אחרת.', moves)
    + block('השאר', 'נראה לי שהסיווג של חברת האשראי נכון. אפשר לשנות גם כאן.', rest)
    : `<div class="card empty">עוד אין בתי עסק. מעלים דף אשראי בלשונית "העלאה".</div>`;
}
async function saveReview() {
  const rules = { ...(S.settings.rules || {}) }; let cc = customCats(); let changed = 0;
  for (const el of document.querySelectorAll('[data-rv]')) {
    const key = el.dataset.rv; const sel = el.querySelector('.rv-sel'); let cat = sel.value;
    if (cat === '__new__') { cat = el.querySelector('.rv-new').value.trim().replace(/\s+/g, ' '); if (!cat) { el.querySelector('.rv-new').focus(); toast('חסר שם לקטגוריה החדשה'); return; } }
    if (!allCats().includes(cat) && !cc.includes(cat) && !['עירייה וממשלה','ביטוח','שירותי תקשורת','משיכת מזומן'].includes(cat)) cc = [...cc, cat];
    const cur = statementRows().find(r => r.key === key)?.cat;
    if (cat !== cur) { rules[key] = { ...(rules[key] || {}), cat }; changed++; }
  }
  $('#rv-save').disabled = true;
  await saveSettings({ rules, customCats: cc });
  try { if (S.suggest) await S.db.doc('settings/suggest').delete(); } catch (e) {}
  S.rvPick = null; $('#rv-save').disabled = false;
  toast(changed ? `עודכנו ${changed} בתי עסק` : 'נשמר, בלי שינויים'); go('month');
}
function groupList(rows) {
  const g = {}; for (const r of rows) { const m = g[r.key] ||= { key: r.key, total: 0, n: 0, kinds: new Set(), rows: [] }; m.total += r.a; m.n++; m.kinds.add(r.kind); m.rows.push(r); }
  return Object.values(g).sort((a, b) => b.total - a.total);
}
function catHTML(c, maxCat, total) {
  const open = S.openCat === c.name;
  const ms = Object.values(c.m).sort((a, b) => b.total - a.total);
  const w = c.total / maxCat * 100;
  return `<div class="cat"><button data-cat-open="${esc(c.name)}" aria-expanded="${open}">
    <div class="hd"><span class="n">${esc(c.name)}</span><span class="num" style="font-weight:700">${fmt(c.total)}</span></div>
    <div class="split" style="width:${Math.max(w, 2)}%"><div class="v" style="width:${(c.total - c.fixed) / c.total * 100}%"></div><div class="f" style="width:${c.fixed / c.total * 100}%"></div></div>
    <div class="hd"><span class="s">${c.n} עסקאות · ${ms.length} בתי עסק</span><span class="s">${total ? Math.round(c.total / total * 100) : 0}%</span></div>
  </button>
  ${open ? `<div class="merchants">${ms.map(m => {
      const k = m.kinds.size > 1 ? 'מעורב' : (m.kinds.has('fixed') ? 'קבוע' : 'משתנה');
      return `<button class="mrow" data-merchant="${esc(m.key)}" aria-expanded="${S.openMerchant === m.key}"><span class="main">${esc(m.key)}</span>
        <span class="tag ${k === 'קבוע' ? 'fixed' : 'var'}">${k}</span><span class="small muted num">${m.n}×</span><span class="num" style="font-weight:700">${fmt(m.total)}</span></button>
        ${S.openMerchant === m.key ? editorHTML(m) : ''}`; }).join('')}</div>` : ''}</div>`;
}
function editorHTML(m) {
  const rule = ruleOf(m.key);
  const curCat = rule.cat || m.rows[0].cat;
  const curKind = rule.kind || (m.kinds.has('fixed') && !m.kinds.has('variable') ? 'fixed' : 'variable');
  const catList = [...new Set([...allCats(), 'עירייה וממשלה', 'ביטוח', 'שירותי תקשורת', 'משיכת מזומן', curCat])];
  const excl = m.rows[0].excl;
  return `<div class="editor" data-editor="${esc(m.key)}">
    <div class="txs">${m.rows.slice().sort((a, b) => a.d < b.d ? -1 : 1).map(r => `<div><span>${shortDate(r.d)}${r.src === 'cap' ? ' · ידני' : ' · ' + esc(r.card)}${r.n ? ' · ' + esc(r.n) : ''}</span><span class="num">${fmt2(r.a)}</span></div>`).join('')}</div>
    ${S.canWrite ? `<div class="field-row">
      <div><label class="lbl" for="ed-cat">קטגוריה</label><select id="ed-cat">${catList.map(c => `<option ${c === curCat ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new__">+ קטגוריה חדשה…</option></select>
        <input type="text" id="ed-newcat" placeholder="שם הקטגוריה החדשה" maxlength="30" style="margin-top:6px" hidden></div>
      <div><span class="lbl">סוג</span><div class="seg" id="ed-kind"><button type="button" data-kind="variable" aria-pressed="${curKind === 'variable'}">משתנה</button><button type="button" data-kind="fixed" aria-pressed="${curKind === 'fixed'}">קבוע</button></div></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn ghost" type="button" data-ed-save="${esc(m.key)}">שמירה לכל העסקאות של בית העסק</button>
      <button class="linkbtn ${excl ? '' : 'danger'}" type="button" data-ed-excl="${esc(m.key)}" data-v="${excl ? 'false' : 'true'}">${excl ? 'להחזיר לחישוב' : 'להוציא מהחישוב'}</button>
    </div>` : ''}
  </div>`;
}

/* ---------- render: upload & settings ---------- */
function renderStatements() {
  const list = [...S.statements].sort((a, b) => (b.month + b.card).localeCompare(a.month + a.card));
  $('#stmts').innerHTML = list.length ? list.map(s => {
    const tot = (s.rows || []).reduce((t, r) => t + (+r.a), 0);
    const id = `${s.card}_${s.month}`;
    const del = !S.canWrite ? '' : S.pending === 'st:' + id
      ? `<button class="linkbtn danger" data-stdel-yes="${esc(id)}">למחוק?</button><button class="linkbtn" data-del-no>ביטול</button>`
      : `<button class="linkbtn" data-stdel="${esc(id)}">מחיקה</button>`;
    return `<div class="li"><div class="main"><div>${monthName(s.month)} · כרטיס ${esc(s.card)}</div><div class="small muted">${esc(s.label || '')} · ${(s.rows || []).length} עסקאות</div></div>${del}<div class="amt num">${fmt(tot)}</div></div>`;
  }).join('') : `<div class="empty">אין עדיין דפים שמורים.</div>`;
}
function renderSettings() {
  const b = $('#set-budget'); if (document.activeElement !== b) b.value = budgetFor(weekStart(today())) || '';
  const sd = $('#set-start'); if (document.activeElement !== sd) sd.value = (S.settings.budgetStart || '').slice(0, 10);
  $('#excl').innerHTML = excludeList().map((p, i) => `<div class="li"><div class="main"><div>${esc(p)}</div></div>${S.canWrite ? `<button class="linkbtn danger" data-excl-rm="${i}">הסרה</button>` : ''}</div>`).join('') || `<div class="empty">אין החרגות.</div>`;
  const rules = Object.entries(S.settings.rules || {}).filter(([, v]) => v && (v.cat || v.kind || v.excluded !== undefined));
  $('#rules').innerHTML = rules.length ? rules.map(([k, v]) => `<div class="li"><div class="main"><div>${esc(k)}</div><div class="small muted">${[v.cat, v.kind === 'fixed' ? 'קבוע' : v.kind === 'variable' ? 'משתנה' : '', v.excluded === true ? 'מוחרג' : v.excluded === false ? 'נכלל תמיד' : ''].filter(Boolean).map(esc).join(' · ')}</div></div>${S.canWrite ? `<button class="linkbtn" data-rule-rm="${esc(k)}">איפוס</button>` : ''}</div>`).join('') : `<div class="empty">עוד אין התאמות.</div>`;
}
function renderAll() {
  renderCats(); renderWeek(); renderMonth(); renderStatements(); renderSettings();
  if (S.tab !== 'review' || !document.querySelector('[data-rv]')) renderReview();
  $('#ro').hidden = S.canWrite;
  $('#cap-save').disabled = !S.db || !S.canWrite;
}

/* ---------- writes ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.firstElementChild.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
function writeErr(e) {
  if (e && e.code === 'permission-denied') { S.canWrite = false; renderAll(); toast('לחשבון הזה אין הרשאה לשמור בקופנית'); }
  else toast('השמירה לא הצליחה. בדקו את החיבור ונסו שוב.');
}
let settingsBusy = Promise.resolve();
function saveSettings(patch) {
  if (!S.db) return;
  const next = { weeklyBudget: +S.settings.weeklyBudget || 0, rules: { ...(S.settings.rules || {}) }, exclude: excludeList(), customCats: customCats(), budgetStart: S.settings.budgetStart || null, savingsFrom: S.settings.savingsFrom || null, budgetHist: Array.isArray(S.settings.budgetHist) ? S.settings.budgetHist : [], ...patch };
  S.settings = next; renderAll();
  settingsBusy = settingsBusy.then(() => S.db.doc('settings/main').set(next)).catch(writeErr);
  return settingsBusy;
}

/* ---------- statement parsing ---------- */
function toIsoDate(v) {
  if (v instanceof Date && !isNaN(v)) return iso(new Date(v.getFullYear(), v.getMonth(), v.getDate() + (v.getHours() >= 12 ? 1 : 0)));
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return iso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  const m = String(v ?? '').trim().match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$/);
  if (!m) return null;
  let y = +m[3]; if (y < 100) y += 2000;
  return `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
}
const toNum = v => typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[₪,\s]/g, '').replace(/[^\d.\-]/g, ''));
function parseWorkbook(wb, fname) {
  const groups = {};
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const hi = aoa.findIndex(r => r && r.some(c => /תאריך/.test(String(c ?? ''))) && r.some(c => /סכום/.test(String(c ?? ''))));
    if (hi < 0) continue;
    const H = aoa[hi].map(c => String(c ?? '').trim());
    const col = (...res) => { for (const re of res) { const i = H.findIndex(h => re.test(h)); if (i >= 0) return i; } return -1; };
    const cD = col(/תאריך עסקה/, /תאריך רכישה/, /^תאריך$/), cM = col(/שם בית ה?עסק/, /בית ה?עסק/, /תיאור/),
          cA = col(/סכום חיוב/, /סכום החיוב/, /סכום לחיוב/, /^סכום$/, /סכום/), cC = col(/קטגוריה/, /ענף/),
          cT = col(/סוג עסקה/, /סוג/), cN = col(/הערות/, /פירוט נוסף/), cK = col(/4 ספרות/, /ספרות אחרונות/, /כרטיס/),
          cB = col(/תאריך חיוב/);
    if (cD < 0 || cM < 0 || cA < 0) continue;
    const headText = aoa.slice(0, hi).flat().filter(Boolean).map(String).join(' ');
    let monthHdr = null; const mm = headText.match(/(\d{1,2})\/(\d{4})/); if (mm) monthHdr = `${mm[2]}-${String(+mm[1]).padStart(2, '0')}`;
    const cardHdr = (headText.match(/(\d{4})-/) || headText.match(/\b(\d{4})\b/) || [])[1];
    const labelCell = aoa.slice(0, hi).flat().map(c => String(c ?? '')).find(c => /^\s*\d{4}\s*-/.test(c)) || '';
    const label = labelCell.replace(/^\s*\d{4}\s*-\s*/, '');
    for (const r of aoa.slice(hi + 1)) {
      if (!r) continue;
      const d = toIsoDate(r[cD]); const a = toNum(r[cA]);
      if (!d || !isFinite(a) || a === 0 || !r[cM]) continue;
      const card = String((cK >= 0 && r[cK]) || cardHdr || 'כרטיס').replace(/\D/g, '').slice(-4) || 'כרטיס';
      let month = monthHdr;
      if (!month && cB >= 0) { const b = toIsoDate(r[cB]); if (b) month = b.slice(0, 7); }
      if (!month) month = d.slice(0, 7);
      const key = `${card}_${month}`;
      const g = groups[key] ||= { card, month, label: label.trim(), rows: [], files: new Set() };
      g.files.add(fname);
      g.rows.push({ d, m: String(r[cM]).trim(), a: Math.round(a * 100) / 100, c: cC >= 0 ? String(r[cC] ?? '') : '', t: cT >= 0 ? String(r[cT] ?? '') : '', n: cN >= 0 ? String(r[cN] ?? '').trim() : '' });
    }
  }
  return groups;
}
async function handleFiles(files) {
  if (!window.XLSX) { toast('רכיב קריאת האקסל לא נטען. רעננו את העמוד.'); return; }
  const all = {};
  for (const f of files) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      const g = parseWorkbook(wb, f.name);
      for (const [k, v] of Object.entries(g)) { if (all[k]) { all[k].rows.push(...v.rows); v.files.forEach(x => all[k].files.add(x)); } else all[k] = v; }
    } catch (e) { toast(`לא הצלחתי לקרוא את ${f.name}`); }
  }
  S.preview = all; renderPreview();
}
function renderPreview() {
  const p = S.preview || {}; const keys = Object.keys(p);
  if (!S.preview) { $('#preview').innerHTML = ''; return; }
  if (!keys.length) { $('#preview').innerHTML = `<div class="card note">לא נמצאו עסקאות בקבצים. ודאו שזה קובץ "פירוט עסקאות" שיוצא מאתר חברת האשראי.</div>`; return; }
  const exists = new Set(S.statements.map(s => `${s.card}_${s.month}`));
  $('#preview').innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:10px"><h2>מוכן לשמירה</h2><div class="list">${keys.map(k => {
    const g = p[k]; const tot = g.rows.reduce((t, r) => t + r.a, 0);
    return `<div class="li"><div class="main"><div>${monthName(g.month)} · כרטיס ${esc(g.card)}</div><div class="small muted">${g.rows.length} עסקאות${exists.has(k) ? ' · יחליף דף קיים' : ''}</div></div><div class="amt num">${fmt(tot)}</div></div>`; }).join('')}</div>
    <div style="display:flex;gap:8px"><button class="btn" id="pv-save" ${S.canWrite && S.db ? '' : 'disabled'}>שמירה</button><button class="btn ghost" id="pv-cancel">ביטול</button></div></div>`;
}
async function savePreview() {
  const p = S.preview; if (!p || !S.db) return;
  $('#pv-save').disabled = true;
  try {
    for (const [k, g] of Object.entries(p)) await S.db.doc('statements/' + k).set({ card: g.card, month: g.month, label: g.label, rows: g.rows, uploadedAt: Date.now(), by: S.me || null });
    const first = Object.values(p)[0];
    S.preview = null; renderPreview(); S.month = first.month; toast('הדפים נשמרו'); go('month');
  } catch (e) { writeErr(e); $('#pv-save') && ($('#pv-save').disabled = false); }
}

/* ---------- events ---------- */
function go(tab) {
  S.tab = tab;
  document.querySelectorAll('section[data-tab]').forEach(s => s.hidden = s.dataset.tab !== tab);
  document.querySelectorAll('nav.tabs button').forEach(b => { if (b.dataset.go === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (tab === 'review') renderReview();
  try { if (tab !== 'review') localStorage.setItem('kupa-tab', tab); } catch (e) {}
  if (!S.editing) window.scrollTo(0, 0);
}
document.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-go]'); if (!t) return;
  const d = t.dataset;
  if (d.go) { go(d.go); return; }
  if (d.cat !== undefined && t.closest('#cap-cats')) { S.capCat = d.cat; renderCats(); return; }
  if (d.pay) { S.capPay = d.pay; document.querySelectorAll('#cap-pay button').forEach(b => b.setAttribute('aria-pressed', b === t)); return; }
  if (d.edit) { startEdit(d.edit); return; }
  if (t.id === 'cap-cancel') { endEdit(); return; }
  if (d.del) { S.pending = d.del; renderWeek(); return; }
  if (d.delNo !== undefined) { S.pending = null; renderAll(); return; }
  if (d.delYes) { S.pending = null; try { await S.db.doc('captures/' + d.delYes).delete(); toast('נמחק'); } catch (er) { writeErr(er); } return; }
  if (d.stdel) { S.pending = 'st:' + d.stdel; renderStatements(); return; }
  if (d.stdelYes) { S.pending = null; try { await S.db.doc('statements/' + d.stdelYes).delete(); toast('הדף נמחק'); } catch (er) { writeErr(er); } return; }
  if (d.catOpen) { S.openCat = S.openCat === d.catOpen ? null : d.catOpen; S.openMerchant = null; renderMonth(); return; }
  if (d.merchant) { S.openMerchant = S.openMerchant === d.merchant ? null : d.merchant; renderMonth(); return; }
  if (d.kind) { t.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === t)); return; }
  if (d.edSave) {
    const ed = t.closest('.editor'); let cat = ed.querySelector('#ed-cat').value; let cc = customCats();
    if (cat === '__new__') {
      cat = ed.querySelector('#ed-newcat').value.trim().replace(/\s+/g, ' ');
      if (!cat) { ed.querySelector('#ed-newcat').focus(); toast('הקלידו שם לקטגוריה החדשה'); return; }
      if (!allCats().includes(cat)) cc = [...cc, cat];
    }
    const kind = ed.querySelector('#ed-kind [aria-pressed="true"]').dataset.kind;
    const rules = { ...(S.settings.rules || {}) }; rules[d.edSave] = { ...(rules[d.edSave] || {}), cat, kind };
    S.openCat = cat; S.openMerchant = null; await saveSettings({ rules, customCats: cc }); toast(`${d.edSave} עבר לקטגוריה ״${cat}״`); return;
  }
  if (d.edExcl) {
    const rules = { ...(S.settings.rules || {}) }; rules[d.edExcl] = { ...(rules[d.edExcl] || {}), excluded: d.v === 'true' };
    S.openMerchant = null; await saveSettings({ rules }); toast(d.v === 'true' ? 'הוצא מהחישוב' : 'הוחזר לחישוב'); return;
  }
  if (d.ruleRm) { const rules = { ...(S.settings.rules || {}) }; delete rules[d.ruleRm]; await saveSettings({ rules }); return; }
  if (d.exclRm !== undefined) { const ex = [...excludeList()]; ex.splice(+d.exclRm, 1); await saveSettings({ exclude: ex }); return; }
  if (t.id === 'excl-add') { const v = $('#excl-new').value.trim(); if (!v) return; $('#excl-new').value = ''; await saveSettings({ exclude: [...excludeList(), v] }); return; }
  if (t.id === 'set-budget-save') {
    const v = Math.max(0, +$('#set-budget').value || 0); const ws = weekStart(today()); const st = S.settings.budgetStart;
    const from = st && st > ws ? st : ws;
    const hist = (Array.isArray(S.settings.budgetHist) ? S.settings.budgetHist : []).filter(e => e.from < from).concat([{ from, amount: v }]);
    await saveSettings({ weeklyBudget: v, budgetHist: hist }); toast('התקציב השבועי עודכן: ' + fmt(v)); return; }
  if (t.id === 'set-start-save') {
    const v = $('#set-start').value; if (!v) return;
    const hist = (Array.isArray(S.settings.budgetHist) ? S.settings.budgetHist : []).filter(e => e.from > v);
    hist.unshift({ from: v, amount: +S.settings.weeklyBudget || 0 });
    await saveSettings({ budgetStart: v, budgetHist: hist }); toast('התקציב נספר החל מ-' + shortDate(v)); return; }
  if (d.thuHide) { S.thuHidden = d.thuHide; $('#thu').innerHTML = ''; return; }
  if (d.cele) { try { localStorage.setItem('kupa-cele-' + d.cele, '1'); } catch (er) {} $('#celebrate').innerHTML = ''; return; }
  if (t.id === 'pv-save') { savePreview(); return; }
  if (t.id === 'rv-save') { saveReview(); return; }
  if (t.id === 'newcat-open') { S.addingCat = true; renderCats(); return; }
  if (t.id === 'newcat-cancel') { S.addingCat = false; renderCats(); return; }
  if (t.id === 'newcat-add') { addCategory(); return; }
  if (t.id === 'pv-cancel') { S.preview = null; renderPreview(); return; }
});
async function addCategory() {
  const v = ($('#newcat')?.value || '').trim().replace(/\s+/g, ' ');
  if (!v) { $('#newcat')?.focus(); return; }
  S.addingCat = false; S.capCat = v;
  if (!allCats().includes(v)) { await saveSettings({ customCats: [...customCats(), v] }); toast('נוספה קטגוריה: ' + v); }
  else renderCats();
}
function commitNewCat(input) {
  const v = input.value.trim().replace(/\s+/g, ' '); if (!v) return false;
  const sel = input.parentElement.querySelector('select');
  let opt = [...sel.options].find(o => o.value === v);
  if (!opt) { opt = new Option(v, v); sel.insertBefore(opt, sel.querySelector('option[value="__new__"]')); }
  sel.value = v; input.value = ''; input.hidden = true;
  const row = input.closest('[data-rv]'); if (row) (S.rvPick ||= {})[row.dataset.rv] = v;
  return true;
}
document.addEventListener('keydown', e => {
  const el = e.target;
  if ((el.classList && el.classList.contains('rv-new')) || el.id === 'ed-newcat') {
    if (e.key === 'Enter') { e.preventDefault(); if (commitNewCat(el)) toast(`הקטגוריה ״${el.parentElement.querySelector('select').value}״ נבחרה. לא לשכוח ללחוץ על שמירה.`); }
    if (e.key === 'Escape') { el.hidden = true; const s = el.parentElement.querySelector('select'); if (s.value === '__new__') s.selectedIndex = 0; }
  }
});
document.addEventListener('focusout', e => { const el = e.target; if (((el.classList && el.classList.contains('rv-new')) || el.id === 'ed-newcat') && el.value.trim()) commitNewCat(el); });
document.addEventListener('keydown', e => { if (e.target.id === 'newcat' && e.key === 'Enter') { e.preventDefault(); addCategory(); } if (e.target.id === 'newcat' && e.key === 'Escape') { S.addingCat = false; renderCats(); } });
document.addEventListener('change', e => {
  if (e.target.classList.contains('rv-sel')) { const row = e.target.closest('[data-rv]'); const i = row.querySelector('.rv-new'); i.hidden = e.target.value !== '__new__'; if (!i.hidden) i.focus(); else (S.rvPick ||= {})[row.dataset.rv] = e.target.value; }
});
document.addEventListener('change', e => { if (e.target.id === 'ed-cat') { const i = e.target.parentElement.querySelector('#ed-newcat'); i.hidden = e.target.value !== '__new__'; if (!i.hidden) i.focus(); } });
$('#month-sel').addEventListener('change', e => { S.month = e.target.value; S.openCat = null; S.openMerchant = null; renderMonth(); });
$('#file').addEventListener('change', e => { if (e.target.files.length) handleFiles([...e.target.files]); e.target.value = ''; });
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]); });

$('#capture').addEventListener('submit', async e => {
  e.preventDefault();
  const amount = toNum($('#cap-amount').value);
  if (!isFinite(amount) || amount <= 0) { $('#cap-amount').focus(); toast('הקלידו סכום'); return; }
  if (!S.db || !S.canWrite) return;
  const doc = { date: $('#cap-date').value || today(), time: $('#cap-time').value || '', amount: Math.round(amount * 100) / 100, category: S.capCat, note: $('#cap-note').value.trim(), pay: S.capPay, by: S.me || null, createdAt: Date.now() };
  $('#cap-save').disabled = true;
  if (S.editing) {
    const id = S.editing; const { by, createdAt, ...changes } = doc;
    try { await S.db.doc('captures/' + id).update(changes); toast(`עודכן: ${fmt2(doc.amount)} · ${doc.category}`); endEdit(); }
    catch (er) { writeErr(er); }
    $('#cap-save').disabled = !S.canWrite; return;
  }
  try {
    await S.db.collection('captures').add(doc);
    $('#cap-amount').value = ''; $('#cap-note').value = ''; $('#cap-date').value = today(); $('#cap-time').value = hhmm();
    toast(`נשמר: ${fmt2(doc.amount)} · ${doc.category}`);
  } catch (er) { writeErr(er); }
  $('#cap-save').disabled = !S.canWrite;
});

function setPay(p) { S.capPay = p; document.querySelectorAll('#cap-pay button').forEach(b => b.setAttribute('aria-pressed', b.dataset.pay === p)); }
function startEdit(id) {
  const c = S.captures.find(x => x.id === id); if (!c) return;
  S.editing = id; S.pending = null;
  $('#cap-amount').value = c.amount; $('#cap-note').value = c.note || ''; $('#cap-date').value = c.date;
  let tm = c.time; if (!tm && c.createdAt) { const d = new Date(c.createdAt); if (iso(d) === c.date) tm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  $('#cap-time').value = tm || '';
  S.capCat = c.category || 'שונות'; setPay(c.pay || 'card'); renderCats();
  $('#cap-title').textContent = 'עריכת הוצאה'; $('#cap-save').textContent = 'עדכון ההוצאה'; $('#cap-cancel').hidden = false;
  $('#capture').style.outline = '2px solid var(--accent)';
  go('week'); $('#capture').scrollIntoView({ behavior: 'smooth', block: 'start' }); renderWeek();
}
function endEdit() {
  S.editing = null;
  $('#cap-amount').value = ''; $('#cap-note').value = ''; $('#cap-date').value = today(); $('#cap-time').value = hhmm();
  $('#cap-title').textContent = 'הוצאה חדשה'; $('#cap-save').textContent = 'שמור הוצאה'; $('#cap-cancel').hidden = true;
  $('#capture').style.outline = '';
}

/* ---------- boot ---------- */
$('#cap-date').value = today(); $('#cap-time').value = hhmm();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (document.activeElement !== $('#cap-time') && !$('#cap-amount').value) { $('#cap-date').value = today(); $('#cap-time').value = hhmm(); } renderWeek(); } });
try { const t = localStorage.getItem('kupa-tab'); if (t && t !== 'week' && location.hash !== '#add') go(t); } catch (e) {}
if (location.hash === '#add') go('week');
renderAll();

/* ---------- people (names shown next to entries) ---------- */
function listenPeople(db) {
  db.collection('people').onSnapshot(snap => {
    snap.docs.forEach(d => { S.names[d.id] = (d.data() || {}).name || ''; });
    renderAll(); renderAccount();
  }, () => {});
}

/* ---------- account ---------- */
function renderAccount() {
  const box = $('#account'); if (!box) return;
  const u = S.authUser;
  box.innerHTML = u ? `
    <div class="li"><div class="main"><div>${esc(S.names[u.uid] || 'בלי שם')}</div><div class="small muted">${esc(u.email || '')}</div></div>
    <button class="linkbtn" type="button" id="acc-rename">שינוי שם</button><button class="linkbtn danger" type="button" id="acc-out">יציאה</button></div>` : '';
}

/* ---------- home-screen widget (Android app only) ---------- */
var KPPlugin = null, lastWidget = '';
function kupanitPlugin() {
  if (KPPlugin) return KPPlugin;
  const C = window.Capacitor;
  if (!C || !(C.isNativePlatform ? C.isNativePlatform() : C.platform !== 'web')) return null;
  try { KPPlugin = C.registerPlugin ? C.registerPlugin('Kupanit') : (C.Plugins && C.Plugins.Kupanit); } catch (e) { KPPlugin = C.Plugins && C.Plugins.Kupanit; }
  return KPPlugin || null;
}
function pushWidget(d) {
  const K = kupanitPlugin(); if (!K || !S.db) return;
  const key = JSON.stringify(d); if (key === lastWidget) return; lastWidget = key;
  K.setWidget({ ...d, updated: hhmm() }).catch(() => {});
}
async function checkWidgetAction() {
  const K = kupanitPlugin(); if (!K) return;
  try {
    const r = await K.takeAction();
    if (r && r.action === 'add') {
      if (S.editing) endEdit();
      go('week');
      setTimeout(() => { $('#capture').scrollIntoView({ block: 'start' }); $('#cap-amount').focus(); }, 150);
    } else if (r && r.action === 'week') go('week');
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastWidget = ''; setTimeout(checkWidgetAction, 200); } });

/* ---------- notifications (Android app only) ---------- */
var LNPlugin = null;
function notifPlugin() {
  if (LNPlugin) return LNPlugin;
  const C = window.Capacitor;
  if (!C || !(C.isNativePlatform ? C.isNativePlatform() : C.platform !== 'web')) return null;
  try { LNPlugin = C.registerPlugin ? C.registerPlugin('LocalNotifications') : (C.Plugins && C.Plugins.LocalNotifications); } catch (e) { LNPlugin = C.Plugins && C.Plugins.LocalNotifications; }
  return LNPlugin || null;
}
const NOTIF_DAILY = [1, 2, 3, 4, 5, 7]; // ראשון–חמישי ומוצאי שבת. בלי שישי.
function notifPrefs() {
  let p = { daily: true, thursday: true };
  try { const v = JSON.parse(localStorage.getItem('kupa-notif') || 'null'); if (v) p = { ...p, ...v }; } catch (e) {}
  return p;
}
async function applyNotifications(ask) {
  const LN = notifPlugin(); if (!LN) return 'none';
  const p = notifPrefs();
  try {
    let perm = await LN.checkPermissions();
    if (perm.display !== 'granted' && ask && (p.daily || p.thursday)) perm = await LN.requestPermissions();
    const pending = await LN.getPending();
    if (pending.notifications && pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    if (perm.display !== 'granted') return 'denied';
    const list = [];
    if (p.daily) NOTIF_DAILY.forEach(w => list.push({ id: 2200 + w, title: 'קופנית', body: 'היו היום הוצאות? זה הזמן לרשום אותן.', schedule: { on: { weekday: w, hour: 22, minute: 0 }, allowWhileIdle: true } }));
    if (p.thursday) list.push({ id: 1300, title: 'שבוע חדש בקופנית', body: 'שבוע התקציב החדש התחיל עכשיו. מה שנשאר מהשבוע הקודם עבר לקופת החיסכון.', schedule: { on: { weekday: 5, hour: 13, minute: 0 }, allowWhileIdle: true } });
    if (list.length) await LN.schedule({ notifications: list });
    return 'ok';
  } catch (e) { return 'error'; }
}
function renderNotif() {
  const box = $('#notif-card'); if (!box) return;
  if (!notifPlugin()) { box.hidden = true; return; }
  box.hidden = false;
  const p = notifPrefs();
  $('#nf-daily').checked = p.daily; $('#nf-thu').checked = p.thursday;
}
async function saveNotif() {
  const p = { daily: $('#nf-daily').checked, thursday: $('#nf-thu').checked };
  try { localStorage.setItem('kupa-notif', JSON.stringify(p)); } catch (e) {}
  const r = await applyNotifications(true);
  toast(r === 'denied' ? 'הטלפון חוסם התראות לקופנית. אפשר לאשר אותן בהגדרות הטלפון.' : r === 'ok' ? 'ההתראות עודכנו' : 'לא הצלחתי לעדכן את ההתראות');
}

/* ---------- import from the Claude version ---------- */
async function importFile(file) { importText(await file.text()); }
async function importText(txt) {
  if (!S.db) return;
  let data;
  try { data = JSON.parse(txt); } catch (e) { toast('הנתונים לא נקראו. בחרו את קובץ הייצוא של הקופנית או הדביקו אותו שוב.'); return; }
  if (!data || data.kupanitExport !== 1) { toast('זה לא קובץ ייצוא של הקופנית'); return; }
  const writes = [];
  (data.statements || []).forEach(d => writes.push(['statements/' + d.id, d.data]));
  (data.captures || []).forEach(d => writes.push(['captures/' + d.id, d.data]));
  if (data.settings) Object.entries(data.settings).forEach(([k, v]) => v && writes.push(['settings/' + k, v]));
  if (data.people) Object.entries(data.people).forEach(([k, v]) => v && writes.push(['people/' + k, { name: v }]));
  $('#imp-status').textContent = `מעביר ${writes.length} רשומות…`;
  try {
    for (let i = 0; i < writes.length; i += 400) {
      const b = S.db.batch();
      writes.slice(i, i + 400).forEach(([path, v]) => b.set(S.db.doc(path), v));
      await b.commit();
    }
    if ($('#imp-text')) $('#imp-text').value = '';
    $('#imp-status').textContent = `הועברו ${(data.captures || []).length} הוצאות, ${(data.statements || []).length} דפי אשראי וההגדרות.`;
    toast('הנתונים הועברו');
  } catch (e) { $('#imp-status').textContent = ''; writeErr(e); }
}

/* ---------- sign-in ---------- */
const AUTH_ERR = {
  'auth/invalid-credential': 'המייל או הסיסמה לא נכונים.',
  'auth/wrong-password': 'הסיסמה לא נכונה.',
  'auth/user-not-found': 'אין חשבון עם המייל הזה. אפשר להירשם.',
  'auth/email-already-in-use': 'כבר יש חשבון עם המייל הזה. היכנסו במקום להירשם.',
  'auth/weak-password': 'הסיסמה צריכה להיות באורך 6 תווים לפחות.',
  'auth/invalid-email': 'כתובת המייל לא תקינה.',
  'auth/missing-password': 'חסרה סיסמה.',
  'auth/network-request-failed': 'אין חיבור לאינטרנט. נסו שוב.',
  'auth/too-many-requests': 'יותר מדי ניסיונות. חכו כמה דקות ונסו שוב.'
};
function authMode(m) {
  S.authMode = m;
  $('#au-name-row').hidden = m !== 'up';
  $('#au-go').textContent = m === 'up' ? 'הרשמה' : 'כניסה';
  $('#au-switch').textContent = m === 'up' ? 'כבר יש לי חשבון' : 'עוד אין לי חשבון';
  $('#au-err').textContent = '';
}
function showAuth(on) {
  $('#auth').hidden = !on;
  document.querySelector('.wrap').hidden = on;
  document.querySelector('nav.tabs').hidden = on;
}

(async () => {
  const cfg = window.KUPANIT_FIREBASE;
  if (!window.firebase || !cfg) { $('#sync').textContent = 'לא מחובר'; renderAll(); return; }
  firebase.initializeApp(cfg);
  const auth = firebase.auth(), db = firebase.firestore();
  if (window.KUPANIT_EMULATOR) { auth.useEmulator('http://127.0.0.1:9099'); db.useEmulator('127.0.0.1', 8080); }
  try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) {}
  authMode('in');
  $('#au-switch').addEventListener('click', () => authMode(S.authMode === 'up' ? 'in' : 'up'));
  $('#au-reset').addEventListener('click', async () => {
    const em = $('#au-email').value.trim();
    if (!em) { $('#au-err').textContent = 'כתבו את המייל, ואז לחצו שוב על "שכחתי סיסמה".'; return; }
    try { await auth.sendPasswordResetEmail(em); $('#au-err').textContent = 'נשלח מייל לאיפוס הסיסמה.'; }
    catch (e) { $('#au-err').textContent = AUTH_ERR[e.code] || 'לא הצלחתי לשלוח מייל איפוס.'; }
  });
  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const em = $('#au-email').value.trim(), pw = $('#au-pass').value, nm = $('#au-name').value.trim();
    $('#au-err').textContent = ''; $('#au-go').disabled = true;
    try {
      if (S.authMode === 'up') {
        if (!nm) { $('#au-err').textContent = 'כתבו את השם שיופיע ליד ההוצאות שתרשמו.'; $('#au-go').disabled = false; return; }
        S.pendingName = nm;
        await auth.createUserWithEmailAndPassword(em, pw);
      } else await auth.signInWithEmailAndPassword(em, pw);
    } catch (er) { $('#au-err').textContent = AUTH_ERR[er.code] || ('הכניסה לא הצליחה: ' + (er.code || er.message)); }
    $('#au-go').disabled = false;
  });
  document.addEventListener('click', async e => {
    if (e.target.id === 'acc-out') { await auth.signOut(); location.reload(); }
    if (e.target.id === 'acc-rename') {
      const box = $('#account');
      box.innerHTML = `<div class="field-row"><input type="text" id="acc-name" value="${esc(S.names[S.me] || '')}" maxlength="30"><button class="btn ghost" type="button" id="acc-name-save" style="flex:0 0 auto">שמירה</button></div>`;
      $('#acc-name').focus();
    }
    if (e.target.id === 'acc-name-save') {
      const v = $('#acc-name').value.trim(); if (!v) return;
      try { await db.doc('people/' + S.me).set({ name: v }); } catch (er) { writeErr(er); }
      renderAccount();
    }
    if (e.target.id === 'nf-save') saveNotif();
  });
  $('#imp-paste-go').addEventListener('click', () => { const t = $('#imp-text').value.trim(); if (t) importText(t); });
  $('#imp-file').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });

  let started = false;
  auth.onAuthStateChanged(async u => {
    if (!u) { S.authUser = null; showAuth(true); return; }
    S.authUser = u; S.me = u.uid; showAuth(false);
    if (started) return; started = true;
    S.db = db;
    $('#sync').textContent = 'מתחבר…';
    const fail = er => { if (er && er.code === 'permission-denied') { S.canWrite = false; $('#ro').hidden = false; $('#sync').textContent = 'אין הרשאה'; } else $('#sync').textContent = 'אין חיבור'; };
    if (S.pendingName) { try { await db.doc('people/' + u.uid).set({ name: S.pendingName }); } catch (er) {} S.pendingName = null; }
    db.collection('statements').onSnapshot({ includeMetadataChanges: true }, snap => { S.statements = snap.docs.map(d => d.data()); $('#sync').textContent = !snap.metadata.fromCache ? 'מסונכרן' : navigator.onLine ? 'מתחבר…' : 'לא מקוון'; renderAll(); }, fail);
    db.collection('captures').orderBy('date', 'desc').limit(1500).onSnapshot(snap => {
      S.captures = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll(); }, fail);
    db.doc('settings/main').onSnapshot(snap => {
      if (snap.exists) { const v = snap.data(); S.settings = { weeklyBudget: v.weeklyBudget || 0, rules: v.rules || {}, exclude: v.exclude, customCats: v.customCats || [], budgetStart: v.budgetStart || null, savingsFrom: v.savingsFrom || null, budgetHist: v.budgetHist || [] }; }
      S.settingsLoaded = true; renderAll(); }, fail);
    db.doc('settings/suggest').onSnapshot(snap => { S.suggest = snap.exists ? snap.data() : null; renderAll(); }, () => {});
    listenPeople(db);
    renderAccount(); renderNotif(); applyNotifications(true);
    checkWidgetAction();
    renderAll();
  });
})();
})();
