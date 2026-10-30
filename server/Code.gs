/**
 * SEBISTON · ОТДЕЛ ПРОДАЖ — сервер базы данных на Google Таблицах (версия 2)
 * ---------------------------------------------------------------------------
 * Обновление существующего сервера (ссылка сайта НЕ меняется):
 * 1) Расширения → Apps Script → выделить весь старый код в Code.gs → вставить этот → Сохранить.
 * 2) Развернуть → Управление развёртываниями → карандаш (Изменить) →
 *    Версия: «Новая версия» → Развернуть.
 * Новые сотрудники по почте добавятся сами при первом обращении сайта к серверу.
 *
 * Лист «Визиты»: киоск /visit/ пишет сюда визиты, у покупателя — ещё 5 ответов анкеты
 *   (колонки «Район», «Тип квартиры», «Площадь», «Этаж», «Откуда узнали»).
 *
 * Данные правятся через сайт. Таблица — для просмотра, фильтров и анализа.
 * Колонки «ID» и «Данные» служебные: их не трогать.
 */

var ITER = 1000;          // итерации хэша пароля
var TOKEN_DAYS = 30;      // сколько дней держится вход
var ADMIN_ROLE = 'admin';
var SEED_VERSION = 'emails-2026-10c';

/* Сотрудники, которые входят по почте. Пароль по умолчанию — почта с заглавной первой буквой. */
var SEED_USERS = [
  ['kurbanovf@sebiston.com',    'Фарход',           'admin'],
  ['h.odinaeva@sebiston.com',   'Одинаева Х.',      'admin'],
  ['kholovsaid@sebiston.com',   'Холов Саид',       'admin'],
  ['isosaidov@gmail.com',       'Саидов',           'admin'],
  ['aristocrattj@gmail.com',    'Aristocrat',       'admin'],
  ['b.sodiqova@sebiston.com',   'Бахора',           'manager'],
  ['m.esanova@sebiston.com',    'Манижа',           'manager'],
  ['n.azamkulova@sebiston.com', 'Нозия',            'manager'],
  ['g.tabarova@sebiston.com',   'Гесу',             'manager'],
  ['z.olimova@sebiston.com',    'Олимова З.',       'manager'],
  ['a.zakhidov@sebiston.com',   'Захидов А.',       'manager'],
  ['a.davlatzoda@sebiston.com', 'Давлатзода А.',    'manager'],
  ['a.sharopov@sebiston.com',   'Шаропов А.',       'manager'],
  ['m.sharipov@sebiston.com',   'Манучехр Шарипов', 'manager'],
  ['sudobasuhrob@gmail.com',    'Сухроб',           'manager']
];

/* ---------- листы и колонки ---------- */
var SHEETS = {
  call:   { title: 'Звонки', cols: ['Дата','Время','Источник','ФИО клиента','Телефон','WhatsApp','Город','Тема','Объект','Площадь, м²','Этаж','Бюджет, $','Этап','Причина отказа','Встреча','Проведена','Примечание','Менеджер','Изменено','Кем изменено'] },
  office: { title: 'Офис', cols: ['Дата','Время','Источник','ФИО клиента','Телефон','WhatsApp','Город','Тема','Объект','Площадь, м²','Этаж','Бюджет, $','Этап','Причина отказа','Встреча','Проведена','Последнее решение','Примечание','Менеджер','Изменено','Кем изменено'] },
  deals:  { title: 'Продажи', cols: ['Дата','Менеджер','Покупатель','Объект','Блок','Этаж','Площадь, м²','Цена за м², $','Общая сумма, $','Внесено, $','Остаток, $','Метод покупки','Срок','Статус','Примечание','Изменено','Кем изменено'] },
  daily:  { title: 'Лиды по дням', cols: ['Дата','Менеджер','Обработано','Звонков','Комментариев / ответов','Назначено встреч','Проведено встреч','Комментарий к встречам','Отказано','Причина отказа','Бронь — ФИО','Продажа — ФИО','Комментарий по продажам','Изменено','Кем изменено'] },
  tlog:   { title: 'Хронометраж', cols: ['Дата','Менеджер','Начало','Конец','Минут','Категория','Действие','Результат','Примечание','Изменено','Кем изменено'] },
  results:{ title: '_Результаты дня', cols: [], hidden: true },
  ovr:    { title: '_Настройки', cols: [], hidden: true }
};
var USERS_SHEET = 'Пользователи';
var BRAND = '#0E6D23';

function sheetKey(coll, doc){ return coll === 'leads' ? ((doc && doc.kind) === 'office' ? 'office' : 'call') : coll; }

function rng(a, b){ a = a == null ? '' : String(a); b = b == null ? '' : String(b); return a && b ? (a === b ? a : a + '–' + b) : a ? 'от ' + a : b ? 'до ' + b : ''; }
function n(v){ var x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : ''; }
function d(v){ return v ? String(v).slice(0, 10) : ''; }
function s(v){ return v == null ? '' : v; }
function whenEdited(x){ return x.updatedAt ? String(x.updatedAt).replace('T',' ').slice(0,16) : ''; }

function readable(key, x){
  switch(key){
    case 'call': case 'office':
      var r = [d(x.date), s(x.time), s(x.src), s(x.fio), s(x.tel), s(x.wa), s(x.city), s(x.topic),
        (x.objects || []).join(', '), rng(x.sqFrom, x.sqTo),
        (x.floorFrom != null || x.floorTo) ? rng(x.floorFrom, x.floorTo) : s(x.floor),
        (x.budgetFrom != null || x.budgetTo) ? rng(x.budgetFrom, x.budgetTo) : s(x.budget),
        s(x.stage), s(x.reject), x.meetDate ? d(x.meetDate) + (x.meetTime ? ' ' + x.meetTime : '') : '', x.meetHeld ? 'да' : ''];
      if(key === 'office') r.push(s(x.decision));
      return r.concat([s(x.note), s(x.mgr), whenEdited(x), s(x.updatedBy)]);
    case 'deals':
      return [d(x.date), s(x.mgr), s(x.buyer), s(x.object), s(x.block), n(x.floor), n(x.area), n(x.price), n(x.total), n(x.paid),
        (n(x.total) === '' ? '' : n(x.total) - (n(x.paid) || 0)), s(x.method), s(x.term), s(x.status), s(x.note), whenEdited(x), s(x.updatedBy)];
    case 'daily':
      return [d(x.date), s(x.mgr), n(x.worked), n(x.calls), n(x.comments), n(x.set), n(x.held), s(x.heldNote), n(x.rej), s(x.rejReason),
        s(x.bronNames), s(x.soldNames), s(x.saleNote), whenEdited(x), s(x.updatedBy)];
    case 'tlog':
      return [d(x.date), s(x.mgr), s(x.start), s(x.end), n(x.dur), s(x.cat), s(x.act), s(x.res), s(x.nt), whenEdited(x), s(x.updatedBy)];
  }
  return [];
}

/* ---------- установка ---------- */
function setup(){
  var ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function(k){ ensureSheet_(ss, k); });
  usersSheet_();
  seedUsers_(true);
  var def = ss.getSheetByName('Лист1') || ss.getSheetByName('Sheet1');
  if(def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  safeAlert_('Готово. Если сайт ещё не подключён: Развернуть → Новое развёртывание → Веб-приложение (Выполнять как: Я, Доступ: Все).');
}
function safeAlert_(m){ try{ SpreadsheetApp.getUi().alert(m); }catch(e){ Logger.log(m); } }

function usersSheet_(){
  var ss = SpreadsheetApp.getActive(), us = ss.getSheetByName(USERS_SHEET);
  if(!us){
    us = ss.insertSheet(USERS_SHEET);
    us.getRange(1, 1, 1, 6).setValues([['Логин / почта','Имя','Роль','Соль','Хэш','Активен']]);
    styleHeader_(us, 6);
    us.hideColumns(4, 2);
  }
  return us;
}
function defaultPw_(login){ login = String(login || ''); return login.charAt(0).toUpperCase() + login.slice(1); }

/* добавляет сотрудников из SEED_USERS один раз (или принудительно из меню) */
function seedUsers_(force){
  var props = PropertiesService.getScriptProperties();
  if(!force && props.getProperty('seed') === SEED_VERSION) return;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try{
    if(!force && props.getProperty('seed') === SEED_VERSION) return;
    var sh = usersSheet_();
    SEED_USERS.forEach(function(x){
      var u = x[0].toLowerCase();
      if(findUserRow_(sh, u)) return;
      var salt = newSalt_();
      sh.appendRow([u, x[1], x[2], salt, hashPw_(salt, defaultPw_(u)), 'да']);
    });
    props.setProperty('seed', SEED_VERSION);
  } finally { lock.releaseLock(); }
}

function ensureSheet_(ss, key){
  var def = SHEETS[key], sh = ss.getSheetByName(def.title);
  var head = def.cols.concat(['ID', 'Данные']);
  if(!sh){
    sh = ss.insertSheet(def.title);
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    styleHeader_(sh, head.length);
    sh.hideColumns(head.length - 1, 2);
    if(def.hidden) sh.hideSheet();
  }
  return sh;
}
function styleHeader_(sh, cols){
  var h = sh.getRange(1, 1, 1, cols);
  h.setBackground(BRAND).setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 36);
}

/* ---------- меню в таблице ---------- */
function onOpen(){
  SpreadsheetApp.getUi().createMenu('Sebiston')
    .addItem('Первая установка', 'setup')
    .addItem('Добавить сотрудника / сменить пароль', 'menuSetPassword')
    .addItem('Отключить сотрудника', 'menuDisable')
    .addSeparator()
    .addItem('Telegram: подключить бота (токен)', 'menuTgToken')
    .addItem('Telegram: менеджеры и проверка', 'menuTgStatus')
    .addToUi();
}
function menuSetPassword(){
  var ui = SpreadsheetApp.getUi();
  var u = ui.prompt('Логин или почта сотрудника').getResponseText().trim().toLowerCase(); if(!u) return;
  var sh = usersSheet_(), row = findUserRow_(sh, u);
  var name = row ? sh.getRange(row, 2).getValue() : ui.prompt('Имя, как на сайте (например: Нозия)').getResponseText().trim();
  var role = row ? sh.getRange(row, 3).getValue() : (ui.alert('Руководитель (статистика, доступы, удаление записей)?', ui.ButtonSet.YES_NO) === ui.Button.YES ? 'admin' : 'manager');
  var pw = ui.prompt('Новый пароль (не короче 8 символов)').getResponseText();
  if(!pw || pw.length < 8){ ui.alert('Пароль слишком короткий'); return; }
  var salt = newSalt_(), hash = hashPw_(salt, pw);
  if(row) sh.getRange(row, 4, 1, 3).setValues([[salt, hash, 'да']]);
  else sh.appendRow([u, name, role, salt, hash, 'да']);
  ui.alert('Готово: ' + u + ' (' + name + ')');
}
function menuDisable(){
  var ui = SpreadsheetApp.getUi();
  var u = ui.prompt('Логин или почта сотрудника, которого отключить').getResponseText().trim().toLowerCase();
  var sh = usersSheet_(), row = findUserRow_(sh, u);
  if(!row){ ui.alert('Такого логина нет'); return; }
  sh.getRange(row, 6).setValue('нет'); ui.alert('Отключён: ' + u);
}

/* ---------- пароли и вход ---------- */
function hex_(bytes){ return bytes.map(function(b){ var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join(''); }
function sha_(x){ return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, x, Utilities.Charset.UTF_8)); }
function hashPw_(salt, pw){ var x = sha_(salt + ':' + pw); for(var i = 0; i < ITER; i++) x = sha_(x + salt); return x; }
function newSalt_(){ return Utilities.getUuid().replace(/-/g, '').slice(0, 24); }
function findUserRow_(sh, u){
  var v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  for(var i = 1; i < v.length; i++) if(String(v[i][0]).trim().toLowerCase() === u) return i + 1;
  return 0;
}
function isOn_(v){ return String(v).trim() === 'да'; }
function roleOf_(v){ return String(v).trim() === ADMIN_ROLE ? 'admin' : 'manager'; }

function login_(u, p){
  u = String(u || '').trim().toLowerCase();
  var cache = CacheService.getScriptCache(), fk = 'fail_' + u, fails = +(cache.get(fk) || 0);
  if(fails >= 5) return { ok: false, err: 'Слишком много попыток. Подождите 10 минут.' };
  var sh = usersSheet_(), row = u ? findUserRow_(sh, u) : 0;
  var rec = row ? sh.getRange(row, 1, 1, 6).getValues()[0] : null;
  if(!rec || !isOn_(rec[5]) || hashPw_(String(rec[3]), String(p || '')) !== String(rec[4])){
    cache.put(fk, String(fails + 1), 600);
    return { ok: false, err: 'Неверная почта или пароль' };
  }
  cache.remove(fk);
  var tok = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var exp = Date.now() + TOKEN_DAYS * 864e5;
  PropertiesService.getScriptProperties().setProperty('t_' + tok, JSON.stringify({ u: u, exp: exp }));
  return { ok: true, t: tok, u: u, n: String(rec[1]), r: roleOf_(rec[2]), exp: exp };
}
function who_(tok){
  if(!tok) return null;
  var props = PropertiesService.getScriptProperties(), raw = props.getProperty('t_' + tok);
  if(!raw) return null;
  var o = JSON.parse(raw);
  if(o.exp < Date.now()){ props.deleteProperty('t_' + tok); return null; }
  var sh = usersSheet_(), row = findUserRow_(sh, o.u);
  if(!row) return null;
  var rec = sh.getRange(row, 1, 1, 6).getValues()[0];
  if(!isOn_(rec[5])) return null;
  return { u: o.u, n: String(rec[1]), r: roleOf_(rec[2]) };
}

/* ---------- сотрудники ---------- */
function allUsers_(){
  var sh = usersSheet_(), last = sh.getLastRow();
  if(last < 2) return [];
  return sh.getRange(2, 1, last - 1, 6).getValues()
    .filter(function(r){ return String(r[0]).trim(); })
    .map(function(r){ return { u: String(r[0]).trim().toLowerCase(), n: String(r[1]), r: roleOf_(r[2]), on: isOn_(r[5]) }; });
}
/* имена для списков на сайте (без паролей и почт) */
function staff_(){ return allUsers_().filter(function(x){ return x.on; }).map(function(x){ return { n: x.n, r: x.r }; }); }

function userSave_(me, q){
  var u = String(q.u || '').trim().toLowerCase();
  var name = String(q.n || '').trim();
  var role = q.r === 'admin' ? 'admin' : 'manager';
  var on = q.on !== false;
  var pw = q.p == null ? '' : String(q.p);
  if(!u || /\s/.test(u)) return { ok: false, err: 'Укажите почту без пробелов' };
  if(!name) return { ok: false, err: 'Укажите имя' };
  if(pw && pw.length < 8) return { ok: false, err: 'Пароль не короче 8 символов' };
  if(u === me.u && (role !== 'admin' || !on)) return { ok: false, err: 'Нельзя снять права или отключить самого себя' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try{
    var sh = usersSheet_(), row = findUserRow_(sh, u);
    if(row){
      sh.getRange(row, 2, 1, 2).setValues([[name, role]]);
      sh.getRange(row, 6).setValue(on ? 'да' : 'нет');
      if(pw){ var s1 = newSalt_(); sh.getRange(row, 4, 1, 2).setValues([[s1, hashPw_(s1, pw)]]); }
    } else {
      var s2 = newSalt_();
      sh.appendRow([u, name, role, s2, hashPw_(s2, pw || defaultPw_(u)), on ? 'да' : 'нет']);
    }
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return { ok: true, users: allUsers_() };
}

/* ---------- чтение и запись ---------- */
function idCol_(sh){ return sh.getLastColumn() - 1; } // предпоследняя колонка — ID
function findRow_(sh, id){
  var last = sh.getLastRow(); if(last < 2) return 0;
  var ids = sh.getRange(2, idCol_(sh), last - 1, 1).getValues();
  for(var i = 0; i < ids.length; i++) if(String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}
function put_(ss, coll, id, doc){
  var key = sheetKey(coll, doc), sh = ensureSheet_(ss, key), width = sh.getLastColumn();
  var json = JSON.stringify(doc);
  if(json.length > 49000) throw new Error('Слишком большая запись');
  var row = findRow_(sh, id);
  // запись могла переехать между «Звонки» и «Офис»
  if(!row && coll === 'leads'){
    var other = ensureSheet_(ss, key === 'call' ? 'office' : 'call'), r2 = findRow_(other, id);
    if(r2) other.deleteRow(r2);
  }
  var vals = SHEETS[key].cols.length ? readable(key, doc) : [];
  var line = vals.concat([String(id), json]);
  while(line.length < width) line.splice(line.length - 2, 0, '');
  if(row) sh.getRange(row, 1, 1, line.length).setValues([line]);
  else sh.appendRow(line);
}
function del_(ss, coll, id){
  var keys = coll === 'leads' ? ['call', 'office'] : [coll];
  keys.forEach(function(k){ var sh = ensureSheet_(ss, k), row = findRow_(sh, id); if(row) sh.deleteRow(row); });
}
function readAll_(ss){
  var out = { leads: [], deals: [], daily: [], tlog: [], results: [], ovr: [] };
  Object.keys(SHEETS).forEach(function(k){
    var sh = ss.getSheetByName(SHEETS[k].title); if(!sh || sh.getLastRow() < 2) return;
    var w = sh.getLastColumn(), vals = sh.getRange(2, w - 1, sh.getLastRow() - 1, 2).getValues();
    var coll = (k === 'call' || k === 'office') ? 'leads' : k;
    vals.forEach(function(v){ if(!v[1]) return; try{ var o = JSON.parse(v[1]); o.__id = String(v[0]); out[coll].push(o); }catch(e){} });
  });
  return out;
}

/* ---------- веб-приложение ---------- */
var VERSION = 2;
function reply_(o){
  if (o && typeof o === 'object') {
    if (o.v == null)   o.v = VERSION;
    if (o.app == null) o.app = 'sebiston-sales';
  }
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(){ return reply_({ ok: true, app: 'sebiston-sales', v: 2, time: new Date().toISOString() }); }
function doPost(e){
  var q; try{ q = JSON.parse(e.postData.contents); }catch(x){ return reply_({ ok: false, err: 'bad request' }); }
  try{ seedUsers_(false); }catch(x){}
  if(q.a === 'login') return reply_(login_(q.u, q.p));
  if (q.a === 'visit') return reply_(saveVisit_(q.v));
  if (q.a === 'otp_request') return reply_(otpRequest_(q));
  if (q.a === 'otp_status')  return reply_(otpStatus_(q));
  if (q.a === 'otp_verify')  return reply_(otpVerify_(q));
  var me = who_(q.t);
  if(!me) return reply_({ ok: false, err: 'auth' });
  if(q.a === 'logout'){ PropertiesService.getScriptProperties().deleteProperty('t_' + q.t); return reply_({ ok: true }); }
  if(q.a === 'users'){
    if(me.r !== 'admin') return reply_({ ok: false, err: 'Только для руководителя' });
    return reply_({ ok: true, users: allUsers_() });
  }
  if(q.a === 'user_save'){
    if(me.r !== 'admin') return reply_({ ok: false, err: 'Только для руководителя' });
    return reply_(userSave_(me, q));
  }
  if (q.a === 'visits_list') {
    if (me.r !== 'admin') return reply_({ ok:false, err:'Только для руководителя' });
    return reply_({ ok:true, visits: listVisits_() });
  }
  if (q.a === 'visit_del') {
    if (me.r !== 'admin') return reply_({ ok:false, err:'Только для руководителя' });
    return reply_(delVisit_(q.id));
  }
  if(q.a !== 'sync') return reply_({ ok: false, err: 'unknown action' });
  var ss = SpreadsheetApp.getActive(), done = [], denied = [];
  var ops = Array.isArray(q.ops) ? q.ops.slice(0, 500) : [];
  if(ops.length){
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try{
      ops.forEach(function(op){
        try{
          if(!op || !op.coll || !op.id || (!SHEETS[op.coll] && op.coll !== 'leads')) throw new Error('bad op');
          if(op.op === 'del'){
            if(me.r !== 'admin'){ denied.push(op.k); return; }
            del_(ss, op.coll, op.id);
          } else put_(ss, op.coll, op.id, op.doc || {});
          done.push(op.k);
        }catch(err){ done.push(op.k); } // битую операцию не повторяем бесконечно
      });
      SpreadsheetApp.flush();
    } finally { lock.releaseLock(); }
  }
  return reply_({ ok: true, me: me, staff: staff_(), done: done, denied: denied, data: readAll_(ss), time: new Date().toISOString() });
}
function ping(){ Logger.log(SpreadsheetApp.getActive().getName()); }

/* Лист «Визиты». Колонки 1–13 — визит (13 = ID, скрыта), 14–15 — кто правил на сайте,
   16–20 — анкета покупателя с киоска. Порядок не менять: сайт читает по номерам колонок. */
var VISIT_HEAD = ['Дата/время','Роль','Режим','ФИО','Телефон','Email',
                  'Интересующие ЖК','Цель визита','Агентство','Компания','Направление','Язык','ID',
                  'Изменено','Кем',
                  'Район','Тип квартиры','Площадь','Этаж','Откуда узнали'];
var VISIT_QUIZ = ['district','rooms','area','floor','source'];   // поля анкеты → колонки 16–20

function visitsSheet_(){
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName('Визиты');
  if (!sh) {
    sh = ss.insertSheet('Визиты');
    sh.setFrozenRows(1); sh.setRowHeight(1, 34);
  }
  if (sh.getMaxColumns() < VISIT_HEAD.length) sh.insertColumnsAfter(sh.getMaxColumns(), VISIT_HEAD.length - sh.getMaxColumns());
  // шапку дописываем/обновляем, старые строки не трогаем
  var head = sh.getRange(1, 1, 1, VISIT_HEAD.length);
  if (head.getValues()[0].join('|') !== VISIT_HEAD.join('|')) {
    head.setValues([VISIT_HEAD]).setBackground('#0E6D23').setFontColor('#FFFFFF').setFontWeight('bold')
        .setWrap(true).setVerticalAlignment('middle');
    sh.hideColumns(13);
  }
  return sh;
}
function quizVal_(x){ return Array.isArray(x) ? x.join(', ') : (x == null ? '' : String(x)); }

function saveVisit_(v){
  v = v || {};
  if (!v.phone && !v.name) return { ok:false, err:'empty' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = visitsSheet_();
    var id = String(v.id || ('visit-' + Date.now()));
    var at = String(v.at || '').replace('T', ' ').slice(0, 16);
    var jk = Array.isArray(v.jk) ? v.jk.join(', ') : (v.jk || '');
    var row = [at, v.role||'', v.mode||'', v.name||'', v.phone||'', v.email||'',
               jk, v.goal||'', v.agency||'', v.company||'', v.dir||'', v.lang||'', id];
    var last = sh.getLastRow(), found = 0;
    if (last >= 2) {
      var ids = sh.getRange(2, 13, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === id) { found = i + 2; break; } }
    }
    if (found) sh.getRange(found, 1, 1, row.length).setValues([row]);
    else { sh.appendRow(row); found = sh.getLastRow(); }
    if (v.upAt || v.upBy) sh.getRange(found, 14, 1, 2).setValues([[ String(v.upAt||''), String(v.upBy||'') ]]);
    // анкета: пишем только если пришла (правка визита на сайте её не стирает)
    var hasQuiz = VISIT_QUIZ.some(function(k){ return Object.prototype.hasOwnProperty.call(v, k); });
    if (hasQuiz) sh.getRange(found, 16, 1, VISIT_QUIZ.length).setValues([VISIT_QUIZ.map(function(k){ return quizVal_(v[k]); })]);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return { ok:true, id:String(v.id || '') };
}


function testVisit(){
  return saveVisit_({ id:"test-"+Date.now(), at:new Date().toISOString(),
    role:"Покупатель", mode:"", name:"ТЕСТ сервера", phone:"+992900000000",
    email:"", jk:["Скандинавия"], goal:"Проверка", agency:"", company:"",
    dir:"", lang:"РУС",
    district:"Центр", rooms:"2-комнатная", area:"50–70 м²", floor:"до 9 этажа", source:"Instagram | Социальные сети" });
}


function listVisits_(){
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName('Визиты');
  if (!sh || sh.getLastRow() < 2) return [];
  var w = Math.max(VISIT_HEAD.length, sh.getLastColumn());
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues();
  return vals.filter(function(r){ return String(r[3] || r[4]).trim(); }).map(function(r){
    return { at:String(r[0]||''), role:String(r[1]||''), mode:String(r[2]||''),
             name:String(r[3]||''), phone:String(r[4]||''), email:String(r[5]||''),
             jk:String(r[6]||''), goal:String(r[7]||''), agency:String(r[8]||''),
             company:String(r[9]||''), dir:String(r[10]||''), lang:String(r[11]||''),
             id:String(r[12]||''), upAt:String(r[13]||''), upBy:String(r[14]||''),
             district:String(r[15]||''), rooms:String(r[16]||''), area:String(r[17]||''),
             floor:String(r[18]||''), source:String(r[19]||'') };
  });
}
function delVisit_(id){
  id = String(id || ''); if (!id) return { ok:false, err:'no id' };
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName('Визиты');
  if (!sh || sh.getLastRow() < 2) return { ok:false, err:'empty' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ids = sh.getRange(2, 13, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) { sh.deleteRow(i + 2); return { ok:true }; }
    }
  } finally { lock.releaseLock(); }
  return { ok:false, err:'not found' };
}

/* =====================================================================
   TELEGRAM-БОТ · подтверждение номера на киоске
   ---------------------------------------------------------------------
   Киоск: гость вводит номер → «Отправить код» → бот пишет менеджерам заявку и код.
   Менеджер либо сам вводит код на киоске, либо говорит его гостю,
   либо жмёт в Telegram кнопку «✅ Подтвердить» — киоск подтвердится сам.
   Вебхук не нужен: бот читает сообщения (getUpdates), когда киоск обращается к серверу.
   Менеджер подключается так: открывает бота → /start → «Поделиться номером».
   Номер должен быть в списке TG_MANAGERS ниже.
   ===================================================================== */
var TG_MANAGERS = ['992988904095', '79263273634'];   // номера менеджеров, которым бот шлёт коды (только цифры)
var OTP_TTL = 600;                                   // код живёт 10 минут

function tgToken_(){ return PropertiesService.getScriptProperties().getProperty('TG_TOKEN') || ''; }
function tgChats_(){ try{ return JSON.parse(PropertiesService.getScriptProperties().getProperty('TG_CHATS') || '{}'); }catch(e){ return {}; } }
function tgSaveChats_(o){ PropertiesService.getScriptProperties().setProperty('TG_CHATS', JSON.stringify(o)); }
function digitsOnly_(x){ return String(x == null ? '' : x).replace(/\D/g, ''); }

function tg_(method, payload){
  var tok = tgToken_(); if(!tok) return { ok:false, description:'no token' };
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + tok + '/' + method,
    { method:'post', contentType:'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions:true });
  try{ return JSON.parse(r.getContentText()); }catch(e){ return { ok:false, description:r.getContentText() }; }
}

/* читает новые сообщения бота: регистрация менеджеров и нажатия «Подтвердить» */
function tgPoll_(){
  if(!tgToken_()) return;
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock(); if(!lock.tryLock(5000)) return;
  try{
    var off = +(props.getProperty('TG_OFFSET') || 0);
    var res = tg_('getUpdates', { offset: off, timeout: 0, allowed_updates: ['message','callback_query'] });
    if(!res.ok || !res.result) return;
    var chats = tgChats_();
    res.result.forEach(function(u){
      off = Math.max(off, u.update_id + 1);
      var m = u.message, cb = u.callback_query;
      if(m && m.chat && m.chat.type === 'private'){
        if(m.contact){
          var ph = digitsOnly_(m.contact.phone_number), own = m.contact.user_id === m.from.id;
          if(own && TG_MANAGERS.indexOf(ph) >= 0){
            chats[String(m.chat.id)] = { phone: ph, name: [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') };
            tg_('sendMessage', { chat_id: m.chat.id, text: '✅ Готово. Сюда будут приходить заявки с киоска Sebiston и коды подтверждения.', reply_markup: { remove_keyboard: true } });
          } else {
            tg_('sendMessage', { chat_id: m.chat.id, text: own ? 'Этого номера нет в списке менеджеров. Обратитесь к администратору.' : 'Поделитесь, пожалуйста, своим номером кнопкой ниже.' });
          }
        } else if(!chats[String(m.chat.id)]){
          tg_('sendMessage', { chat_id: m.chat.id, text: 'Здравствуйте! Это бот киоска Sebiston. Чтобы получать заявки, подтвердите свой номер:',
            reply_markup: { keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
        } else if(/^\/start/.test(m.text || '')){
          tg_('sendMessage', { chat_id: m.chat.id, text: 'Вы подключены. Заявки с киоска придут сюда.' });
        }
      }
      if(cb){
        var who = chats[String(cb.from.id)], data = String(cb.data || '');
        if(who && /^ok:/.test(data)){
          var req = data.slice(3), c = CacheService.getScriptCache(), raw = c.get('otp_' + req);
          if(raw){
            var o = JSON.parse(raw); o.ok = true; o.by = who.name || who.phone; c.put('otp_' + req, JSON.stringify(o), OTP_TTL);
            tg_('answerCallbackQuery', { callback_query_id: cb.id, text: 'Подтверждено' });
            tg_('editMessageReplyMarkup', { chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [[{ text: '✅ Подтверждено: ' + (who.name || ''), callback_data: 'done' }]] } });
          } else tg_('answerCallbackQuery', { callback_query_id: cb.id, text: 'Код устарел' });
        } else tg_('answerCallbackQuery', { callback_query_id: cb.id });
      }
    });
    props.setProperty('TG_OFFSET', String(off));
    tgSaveChats_(chats);
  } finally { lock.releaseLock(); }
}

/* ищет клиента по номеру в таблице: имя и чем занимался */
function findClient_(ph){
  ph = digitsOnly_(ph).slice(-9); if(ph.length < 9) return null;
  var ss = SpreadsheetApp.getActive(), found = null;
  [['Продажи', 'deals'], ['Офис', 'office'], ['Звонки', 'call']].some(function(p){
    var sh = ss.getSheetByName(p[0]); if(!sh || sh.getLastRow() < 2) return false;
    var w = sh.getLastColumn(), vals = sh.getRange(2, w, sh.getLastRow() - 1, 1).getValues();   // колонка «Данные» (JSON)
    for(var i = vals.length - 1; i >= 0; i--){
      try{ var o = JSON.parse(vals[i][0] || '{}'); }catch(e){ continue; }
      var t = digitsOnly_(o.tel || o.phone || o.wa).slice(-9);
      if(t && t === ph){
        found = { name: String(o.fio || o.buyer || '').trim(),
                  line: p[1] === 'deals' ? ('Покупатель' + (o.object ? ' · ' + o.object : '')) : ('Клиент найден в базе' + ((o.objects || []).length ? ' × ' + o.objects.join(', ') : '')) };
        return true;
      }
    }
    return false;
  });
  if(!found){
    var v = ss.getSheetByName('Визиты');
    if(v && v.getLastRow() >= 2){
      var r = v.getRange(2, 1, v.getLastRow() - 1, 9).getValues();
      for(var j = r.length - 1; j >= 0; j--){
        if(digitsOnly_(r[j][4]).slice(-9) === ph && String(r[j][3]).trim()){
          found = { name: String(r[j][3]).trim(), line: r[j][8] ? 'Агентство: ' + r[j][8] : 'Уже был в офисе' + (r[j][6] ? ' × ' + r[j][6] : '') };
          break;
        }
      }
    }
  }
  return found;
}

function otpRequest_(q){
  var ph = digitsOnly_(q.phone);
  if(ph.length < 9) return { ok:false, err:'phone' };
  if(!tgToken_()) return { ok:false, err:'bot' };
  var c = CacheService.getScriptCache();
  if(c.get('otp_lim_' + ph)) return { ok:false, err:'wait' };                       // не чаще раза в 30 секунд на номер
  var n = +(c.get('otp_cnt') || 0); if(n > 40) return { ok:false, err:'busy' };     // защита от спама
  c.put('otp_cnt', String(n + 1), 600); c.put('otp_lim_' + ph, '1', 30);
  tgPoll_();                                                                        // подхватить новых менеджеров
  var chats = tgChats_(), ids = Object.keys(chats);
  if(!ids.length) return { ok:false, err:'nomgr' };
  var code = String(Math.floor(1000 + Math.random() * 9000));
  var req = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  c.put('otp_' + req, JSON.stringify({ phone: ph, code: code, ok:false }), OTP_TTL);
  var cl = findClient_(ph);
  var role = String(q.role || ''), pretty = '+' + ph.replace(/^(992)(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
  var text = '🔔 Заявка с киоска Sebiston\n' +
             'Роль: ' + (role || '—') + '\n' +
             'Телефон: ' + pretty + '\n' +
             (cl && cl.name ? 'В базе: ' + cl.name + '\n' : 'В базе не найден\n') +
             '\nКод подтверждения: ' + code + '\n\n' +
             'Введите код на киоске сами, сообщите его гостю или нажмите «Подтвердить».';
  ids.forEach(function(id){
    tg_('sendMessage', { chat_id: Number(id), text: text, reply_markup: { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'ok:' + req }]] } });
  });
  return { ok:true, req: req, ttl: OTP_TTL };
}

function otpState_(req){ var raw = CacheService.getScriptCache().get('otp_' + String(req || '')); return raw ? JSON.parse(raw) : null; }
function otpDone_(o){ var cl = findClient_(o.phone) || {}; return { ok:true, verified:true, name: cl.name || '', line: cl.line || '', by: o.by || '' }; }

function otpStatus_(q){
  tgPoll_();
  var o = otpState_(q.req); if(!o) return { ok:false, err:'expired' };
  return o.ok ? otpDone_(o) : { ok:true, verified:false };
}
function otpVerify_(q){
  var o = otpState_(q.req); if(!o) return { ok:false, err:'expired' };
  var c = CacheService.getScriptCache(), k = 'otp_try_' + q.req, tries = +(c.get(k) || 0);
  if(tries >= 5) return { ok:false, err:'tries' };
  if(String(q.code || '').trim() !== o.code){ c.put(k, String(tries + 1), OTP_TTL); return { ok:false, err:'code' }; }
  o.ok = true; c.put('otp_' + q.req, JSON.stringify(o), OTP_TTL);
  return otpDone_(o);
}

/* ---------- меню ---------- */
function menuTgToken(){
  var ui = SpreadsheetApp.getUi();
  var t = ui.prompt('Токен бота от @BotFather (вида 123456789:AA...)').getResponseText().trim();
  if(!/^\d+:[\w-]{30,}$/.test(t)){ ui.alert('Это не похоже на токен бота'); return; }
  PropertiesService.getScriptProperties().setProperty('TG_TOKEN', t);
  tg_('deleteWebhook', {});
  var me = tg_('getMe', {});
  ui.alert(me.ok ? ('Бот подключён: @' + me.result.username + '\n\nТеперь каждый менеджер: открыть бота → /start → «Поделиться номером».') : ('Telegram ответил ошибкой: ' + (me.description || '')));
}
function menuTgStatus(){
  tgPoll_();
  var ch = tgChats_(), list = Object.keys(ch).map(function(k){ return '• ' + (ch[k].name || '') + ' +' + ch[k].phone; });
  var me = tg_('getMe', {});
  SpreadsheetApp.getUi().alert('Бот: ' + (me.ok ? '@' + me.result.username : 'не подключён') +
    '\n\nМенеджеры, которые подключились:\n' + (list.length ? list.join('\n') : '— пока никого (нужно /start и «Поделиться номером»)') +
    '\n\nРазрешённые номера: ' + TG_MANAGERS.map(function(x){ return '+' + x; }).join(', '));
}
