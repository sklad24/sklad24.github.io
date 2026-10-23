/* «Склад»: Периоды и календарь, расходы и прибыль, реклама, ABC-анализ. */
/* ============================================================
   РАСХОДЫ / ПРИБЫЛЬ (валовая и чистая)
   ============================================================ */
/* var, а не let: так текущий период виден как window.currentFinancePeriod —
   пригождается при разборе проблем и в проверках */
var currentFinancePeriod = 1;

/* period: null = всё время, 1/7/30 = последние N дней (включая сегодня),
   'yesterday' = ровно вчерашний календарный день,
   {start,end} (мс) = произвольный период, выбранный вручную по календарю */
function getPeriodRange(period){
  if(period===null) return null;
  if(typeof period === 'object' && period.start !== undefined){
    return {start: period.start, end: period.end};
  }
  /* «Месяц» — календарный: с первого числа текущего месяца по сегодня */
  if(period==='thisMonth'){
    const now = new Date();
    return {start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end: now.getTime()};
  }
  const end = new Date(); const start = new Date();
  if(period==='yesterday'){
    start.setDate(start.getDate()-1); start.setHours(0,0,0,0);
    end.setDate(end.getDate()-1); end.setHours(23,59,59,999);
  } else {
    start.setDate(start.getDate()-(period-1)); start.setHours(0,0,0,0);
  }
  return {start: start.getTime(), end: end.getTime()};
}

/* ============================================================
   КАЛЕНДАРЬ СВОЕГО ПЕРИОДА
   Раньше это были два поля с датами и кнопка рядом — три отдельных
   элемента ради одного действия. Теперь одно окно: отметил начало,
   отметил конец, нажал «Показать».
   ============================================================ */
let calView = null;      // месяц, который показан
let calStart = null;     // выбранное начало (Date, полночь)
let calEnd = null;       // выбранный конец

function dayKey(d){ return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate(); }
function sameDay(a,b){ return a && b && dayKey(a) === dayKey(b); }
function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }

/* Один и тот же календарь обслуживает и «Расходы», и «Историю» —
   разница только в том, куда уходит выбранный период. */
let calTarget = 'finance';
var historyRange = null;   // {start, end} или null — показывать всё
var abcRange = null;       // {start, end} или null — ABC-анализ за всё время

function openRangeModal(target){
  calTarget = target || 'finance';
  const current = (calTarget === 'history') ? historyRange
                : (calTarget === 'balance') ? currentBalancePeriod
                : (calTarget === 'abc') ? abcRange
                : currentFinancePeriod;
  const isRange = current && typeof current === 'object';

  const base = isRange ? new Date(current.start) : new Date();
  calView = new Date(base.getFullYear(), base.getMonth(), 1);
  if(isRange){
    calStart = startOfDay(new Date(current.start));
    calEnd = startOfDay(new Date(current.end));
  } else {
    calStart = null; calEnd = null;
  }

  document.querySelector('#rangeModalBg h3').textContent =
      (calTarget === 'history') ? 'Даты в истории'
    : (calTarget === 'balance') ? 'Период баланса'
    : (calTarget === 'abc') ? 'Период ABC-анализа'
    : 'Свой период';
  document.getElementById('calReset').style.display = (calTarget === 'history' || calTarget === 'abc') ? 'flex' : 'none';

  renderCal();
  document.getElementById('rangeModalBg').classList.add('show');
}

async function resetCalRange(){
  closeRangeModal();
  if(calTarget === 'abc'){
    abcRange = null;
    updateAbcRangeLabel();
    await generateABC();
    return;
  }
  historyRange = null;
  updateHistoryRangeLabel();
  await renderHistory();
}
function updateHistoryRangeLabel(){
  const label = document.getElementById('historyRangeLabel');
  const btn = document.getElementById('historyDateBtn');
  if(!label) return;
  if(historyRange){
    label.style.display = 'block';
    label.textContent = 'Показаны даты: ' + new Date(historyRange.start).toLocaleDateString('ru-RU')
        + ' – ' + new Date(historyRange.end).toLocaleDateString('ru-RU');
    if(btn) btn.classList.add('active-filter');
  } else {
    label.style.display = 'none';
    if(btn) btn.classList.remove('active-filter');
  }
}
function updateAbcRangeLabel(){
  const label = document.getElementById('abcRangeLabel');
  const btn = document.getElementById('abcDateBtn');
  if(!label) return;
  if(abcRange){
    label.style.display = 'block';
    label.textContent = 'Период: ' + new Date(abcRange.start).toLocaleDateString('ru-RU')
        + ' – ' + new Date(abcRange.end).toLocaleDateString('ru-RU');
    if(btn) btn.classList.add('active-filter');
  } else {
    label.style.display = 'none';
    if(btn) btn.classList.remove('active-filter');
  }
}
function closeRangeModal(){
  document.getElementById('rangeModalBg').classList.remove('show');
}
function calShift(delta){
  calView = new Date(calView.getFullYear(), calView.getMonth() + delta, 1);
  renderCal();
}

function renderCal(){
  /* Собираем заголовок сами: локаль отдаёт «июль 2026 г.», а capitalize
     превращает хвост в «Г.» */
  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  document.getElementById('calTitle').textContent =
      MONTHS[calView.getMonth()] + ' ' + calView.getFullYear();

  const year = calView.getFullYear(), month = calView.getMonth();
  const first = new Date(year, month, 1);
  /* getDay() считает неделю с воскресенья, а календарь у нас с понедельника */
  const shift = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = startOfDay(new Date());

  let html = '';
  for(let i=0;i<shift;i++) html += '<button class="empty" disabled></button>';

  for(let day=1; day<=daysInMonth; day++){
    const d = new Date(year, month, day);
    const cls = [];
    if(sameDay(d, today)) cls.push('today');
    if(sameDay(d, calStart) || sameDay(d, calEnd)) cls.push('edge');
    else if(calStart && calEnd && d > calStart && d < calEnd) cls.push('in-range');
    // будущие дни выбирать незачем: операций там нет
    const disabled = d > today ? 'disabled' : '';
    html += `<button type="button" class="${cls.join(' ')}" ${disabled} onclick="calPick(${year},${month},${day})">${day}</button>`;
  }
  document.getElementById('calGrid').innerHTML = html;

  const summary = document.getElementById('calSummary');
  const apply = document.getElementById('calApply');
  if(calStart && calEnd){
    const days = Math.round((calEnd - calStart)/86400000) + 1;
    summary.textContent = calStart.toLocaleDateString('ru-RU') + ' — ' + calEnd.toLocaleDateString('ru-RU')
        + ' · ' + days + ' ' + pluralDney(days);
    apply.disabled = false;
  } else if(calStart){
    summary.textContent = 'Начало: ' + calStart.toLocaleDateString('ru-RU') + '. Теперь выберите последний день';
    apply.disabled = true;
  } else {
    summary.textContent = 'Выберите первый день периода';
    apply.disabled = true;
  }
}
function pluralDney(n){
  const m = n%100;
  if(m>=11 && m<=14) return 'дней';
  const l = n%10;
  if(l===1) return 'день';
  if(l>=2 && l<=4) return 'дня';
  return 'дней';
}

function calPick(year, month, day){
  const d = new Date(year, month, day);
  if(!calStart || (calStart && calEnd)){
    calStart = d; calEnd = null;
  } else if(d < calStart){
    /* ткнули раньше начала — считаем это новым началом, а не ошибкой */
    calStart = d;
  } else {
    calEnd = d;
  }
  renderCal();
}

async function applyCalRange(){
  if(!calStart || !calEnd) return;
  const start = new Date(calStart); start.setHours(0,0,0,0);
  const end = new Date(calEnd); end.setHours(23,59,59,999);
  const range = {start: start.getTime(), end: end.getTime()};
  closeRangeModal();

  if(calTarget === 'history'){
    historyRange = range;
    updateHistoryRangeLabel();
    await renderHistory();
    return;
  }
  if(calTarget === 'balance'){
    await renderBalance(range, null);
    return;
  }
  if(calTarget === 'abc'){
    abcRange = range;
    updateAbcRangeLabel();
    await generateABC();
    return;
  }
  await renderFinance(range, null);
}

async function computeFinance(days){
  const hist = await getAllLive('history');
  const products = await getAllLive('products');
  let filtered;
  if(days===null){
    filtered = hist.filter(h=>h.type==='Расход');
  } else {
    const range = getPeriodRange(days);
    filtered = hist.filter(h=> h.type==='Расход' && h.timestamp>=range.start && h.timestamp<=range.end);
  }

  let revenue=0, cogs=0, grossProfit=0, taxAmount=0, commissionAmount=0, packagingAmount=0, deliveryDiscountAmount=0;
  const bySku = {};

  filtered.forEach(h=>{
    const p = products.find(x=>x.sku===h.sku);
    const e = opEconomics(h, p);
    if(!e) return;

    revenue += e.revenue; cogs += e.cost; grossProfit += e.gross;
    taxAmount += e.tax; commissionAmount += e.comm; packagingAmount += e.pack; deliveryDiscountAmount += e.delivDiscount;

    /* Имя берём из карточки, а для удалённых товаров — из самой записи,
       чтобы их продажи не исчезали из отчёта за прошлый период. */
    if(!bySku[h.sku]) bySku[h.sku] = {name: (p ? p.name : h.name) || h.sku, qty:0, revenue:0, net:0};
    bySku[h.sku].qty += e.qty;
    bySku[h.sku].revenue += e.revenue;
    bySku[h.sku].net += e.net;
  });

  const netProfit = grossProfit - taxAmount - commissionAmount - packagingAmount - deliveryDiscountAmount;
  return {revenue, cogs, grossProfit, taxAmount, commissionAmount, packagingAmount, deliveryDiscountAmount, netProfit, bySku};
}

/* Одно кольцо со всеми показателями: выручка, себестоимость, валовая
   прибыль, налог, комиссия, упаковка, скидка на доставку, реклама и чистая
   прибыль — каждый пункт свой цвет, своё деление кольца. Нажали на деление
   кольца или на карточку под ним — в центре кольца появляется сумма именно
   по этому пункту за выбранный период. */
var finRingSelected = null;
var finRingSegments = [];

function renderFinanceRing(f, adSpend, netProfitFinal, partnerComm){
  /* Выручки в кольце нет намеренно: она равна сумме всех остальных долей,
     поэтому занимала половину круга и сплющивала всё остальное. Главная
     цифра здесь — чистая прибыль, она же в центре. */
  const segments = [
    {name:'Чистая прибыль', value:netProfitFinal, color:'#4338FF', icon:'i-check-circle'},
    {name:'Себестоимость', value:f.cogs, color:'#10B981', icon:'i-box'},
    {name:'Валовая прибыль', value:f.grossProfit, color:'#FF9F43', icon:'i-chart'},
    {name:'Налог', value:f.taxAmount, color:'#F0508C', icon:'i-alert'},
    {name:'Комиссия маркетплейса', value:f.commissionAmount, color:'#F5C518', icon:'i-wallet'},
    {name:'Комиссия партнёрам', value:partnerComm || 0, color:'#F2683C', icon:'i-coins'},
    {name:'Упаковка', value:f.packagingAmount, color:'#14B8A6', icon:'i-box'},
    {name:'Скидка на доставку', value:f.deliveryDiscountAmount, color:'#A07BFF', icon:'i-out'},
    {name:'Реклама', value:adSpend, color:'#C084FC', icon:'i-chart'},
  ];
  segments.forEach(s=>{ s.arcValue = Math.max(0, s.value); });

  finRingSegments = segments;
  finRingSelected = null;
  showFinRingTotal();

  const cx = 110, cy = 110, r = 92, sw = 20;
  const circumference = 2*Math.PI*r;
  const total = segments.reduce((s,x)=>s+x.arcValue,0);

  let svgHtml = `<circle class="ring-track" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${sw}"/>`;
  if(total > 0){
    let cumulative = 0;
    segments.forEach((s,i)=>{
      if(s.arcValue<=0) return;
      const frac = s.arcValue/total;
      const len = frac*circumference, gap = circumference-len, offset = -cumulative*circumference;
      svgHtml += `<circle data-idx="${i}" onclick="selectFinRingSegment(${i})" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${sw}" stroke="${s.color}" stroke-dasharray="${len.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>`;
      cumulative += frac;
    });
  }
  document.getElementById('finRingSvg').innerHTML = svgHtml;

  const grid = document.getElementById('finRingGrid');
  const hint = document.getElementById('finRingHint');
  /* Подсказка про нажатия на кольцо нужна, только когда по кольцу есть
     что нажимать. */
  if(hint) hint.style.display = (f.revenue <= 0) ? 'none' : '';
  if(f.revenue <= 0){
    grid.innerHTML = emptyLine('i-wallet','За этот период продаж не было');
    return;
  }
  grid.innerHTML = segments.map((s,i)=>{
    const pct = total>0 ? Math.round(s.arcValue/total*100) : 0;
    return `<div class="cat-card" id="finSegCard${i}" style="--seg-color:${s.color}" onclick="selectFinRingSegment(${i})">
      <div class="cat-share" style="background:${s.color}26;color:${s.color}">${pct}%</div>
      <div class="cat-icon" style="background:${s.color}"><svg class="icon"><use href="#${s.icon}"/></svg></div>
      <div class="cat-name">${escapeHtml(s.name)}</div>
      <div class="cat-meta">доля кольца</div>
      <div class="cat-amount">${Math.round(s.value)} ₽</div>
    </div>`;
  }).join('');
}
/* В центре кольца — чистая прибыль: ради неё сюда и заходят. */
function showFinRingTotal(){
  finRingSelected = null;
  const main = finRingSegments[0];
  document.getElementById('finRingAmount').textContent = (main ? Math.round(main.value) : 0) + ' ₽';
  document.getElementById('finRingLabel').textContent = main ? main.name : 'Чистая прибыль';
  document.querySelectorAll('#finRingGrid .cat-card').forEach(c=>c.classList.remove('selected'));
  markPickedArc(-1);
}
function markPickedArc(i){
  document.querySelectorAll('#finRingSvg circle[data-idx]').forEach(c=>{
    c.classList.toggle('picked', Number(c.dataset.idx) === i);
  });
}
function selectFinRingSegment(i){
  const s = finRingSegments[i];
  if(!s) return;
  if(finRingSelected === i){ showFinRingTotal(); return; }
  finRingSelected = i;
  markPickedArc(i);
  document.getElementById('finRingAmount').textContent = Math.round(s.value) + ' ₽';
  document.getElementById('finRingLabel').textContent = s.name;
  document.querySelectorAll('#finRingGrid .cat-card').forEach(c=>{
    c.classList.toggle('selected', c.id === ('finSegCard'+i));
  });
}

async function renderFinance(days, btnEl){
  currentFinancePeriod = days;
  const isCustom = typeof days === 'object' && days !== null;
  const ids = {1:'finPeriodBtn1','yesterday':'finPeriodBtnYesterday',7:'finPeriodBtn7','thisMonth':'finPeriodBtn30'};
  document.querySelectorAll('#finPeriodSeg button').forEach(b=>b.classList.remove('active'));
  // при своём периоде подсвечивается сам календарь
  const activeBtn = btnEl || document.getElementById(isCustom ? 'finPeriodBtnRange' : ids[days]);
  if(activeBtn) activeBtn.classList.add('active');

  const rangeLabel = document.getElementById('finCustomRangeLabel');
  if(isCustom){
    rangeLabel.style.display = 'block';
    rangeLabel.textContent = 'Показан период: '+new Date(days.start).toLocaleDateString('ru-RU')+' – '+new Date(days.end).toLocaleDateString('ru-RU');
  } else {
    rangeLabel.style.display = 'none';
  }

  const f = await computeFinance(days);
  const adSpend = await computeAdSpendForPeriod(days);
  const partnerComm = await computePartnerCommission(days);
  const netProfitFinal = f.netProfit - adSpend - partnerComm;
  const round = (n)=> Math.round(n);

  renderFinanceRing(f, adSpend, netProfitFinal, partnerComm);

  const rows = Object.values(f.bySku).sort((a,b)=>b.net-a.net);
  const list = document.getElementById('financeByProduct');
  if(rows.length===0){
    list.innerHTML = emptyLine('i-wallet','За этот период продаж не было');
  } else {
    list.innerHTML = rows.map(r=>`
      <div class="row-item">
        <div class="rmain"><div class="rname">${escapeHtml(r.name)}</div><div class="rmeta">продано ${round(r.qty)} шт · выручка ${round(r.revenue)} ₽</div></div>
        <span class="rval ${r.net>=0?'pos':'neg'}">${round(r.net)} ₽</span>
      </div>`).join('') + `<div class="t-caption" style="margin-top:8px;color:var(--text-tertiary);">
        Выручка — сумма продаж по цене продажи, сколько заплатили покупатели (до всех расходов).
        Справа — прибыль товара: выручка минус себестоимость, налог, комиссия площадки, упаковка и скидка на доставку.
        Реклама и комиссия партнёрам сюда не входят — они учтены в кольце выше.</div>`;
  }

  await renderReturnsReport(days);
  await loadAdSpendToday();
  await renderAdSpendLog();
}

/* ============================================================
   ОТЧЁТ ПО ТОВАРАМ (Excel .xlsx)
   Повторяет таблицу учёта: по каждому товару — закупка, реализация,
   прибыль, плюс все расходы из карточки (комиссия, налог, упаковка,
   скидка на доставку), возвраты и остаток. Внизу — реклама, комиссия
   партнёрам (только в главном аккаунте) и чистая прибыль.
   Период — тот, что выбран на вкладке «Расходы».
   ============================================================ */
async function buildProductReport(days){
  const hist = await getAllLive('history');
  const products = await getAllLive('products');
  const range = getPeriodRange(days);
  const inRange = ts => !range || (ts >= range.start && ts <= range.end);
  const rows = {};
  const lastIn = {};
  const slot = (sku, name)=> rows[sku] || (rows[sku] = {
    sku, name: name || sku, qty:0, cost:0, revenue:0, comm:0, tax:0, pack:0, deliv:0,
    got:0, reship:0, damaged:0
  });
  hist.forEach(h=>{
    if(!h.sku) return;
    const p = products.find(x=> x.sku === h.sku);
    if(h.type === 'Приход' && (!lastIn[h.sku] || h.timestamp > lastIn[h.sku])) lastIn[h.sku] = h.timestamp;
    if(!inRange(h.timestamp)) return;
    if(h.type === 'Расход'){
      const e = opEconomics(h, p);
      if(!e) return;
      const s = slot(h.sku, p ? p.name : h.name);
      s.qty += e.qty; s.cost += e.cost; s.revenue += e.revenue;
      s.comm += e.comm; s.tax += e.tax; s.pack += e.pack; s.deliv += e.delivDiscount;
    }
    if(h.type === 'Корректировка' && h.snap && h.snap.isReturn){
      const s = slot(h.sku, p ? p.name : h.name);
      const q = Math.abs(Number(h.qty)) || Math.abs(Number(h.delta)) || 0;
      if(!h.snap.returnClose) s.got += q;
      else if(h.snap.returnAction === 'reship') s.reship += q;
      else if(h.snap.returnAction === 'damaged') s.damaged += q;
    }
  });
  const waiting = await returnsBySku();
  const list = Object.values(rows)
    .filter(r=> r.qty || r.got || r.reship || r.damaged)
    .sort((a,b)=> b.revenue - a.revenue);
  return {list, lastIn, waiting, products, range};
}
/* Реклама по дням — тот же расчёт, что и в «Расходах»: поправка за день
   или ежедневная сумма. Нужна построчно, для блока внизу отчёта. */
async function adSpendByDay(range){
  const manual = await getAllLive('adspend');
  const byDay = {};
  manual.forEach(a=>{ byDay[a.dateKey] = Number(a.amount) || 0; });
  const out = [];
  if(!range) return out;
  const day = new Date(range.start); day.setHours(12,0,0,0);
  const last = new Date(range.end);
  for(let guard = 0; day <= last && guard < 4000; guard++){
    const key = dateKeyOf(day);
    out.push({key, amount: (key in byDay) ? byDay[key] : adRateForDay(key)});
    day.setDate(day.getDate() + 1);
  }
  return out;
}

/* Выгрузка в Excel (.xlsx). Формулы — в колонках «прибыль» и в итогах,
   поэтому Excel сам пересчитывает их, если вы поправите цифру в ячейке. */
function reportPeriodLabel(range){
  if(!range) return 'за всё время';
  return 'с ' + new Date(range.start).toLocaleDateString('ru-RU') + ' по ' + new Date(range.end).toLocaleDateString('ru-RU');
}
function reportStamp(range){
  return range ? (dateKeyOf(new Date(range.start)) + '_' + dateKeyOf(new Date(range.end))) : 'все-время';
}

/* Удержания, которых нет ни в одной строке отчёта, в файл не попадают:
   у товара с фиксированной ценой комиссии, налога, упаковки и скидки нет,
   и пустые колонки только мешают. Если хоть у одного товара есть — колонка
   выводится у всех. */
const REPORT_DEDUCTIONS = [
  {src:'comm',  title:'Комиссия маркетплейса, ₽'},
  {src:'tax',   title:'Налог, ₽'},
  /* упаковку партнёр берёт на себя — в отчётах её нет */
  /* скидка на доставку — колонка всегда, даже если нулевая */
  {src:'deliv', title:'Скидка на доставку, ₽', always:true}
];
function presentDeductions(data){
  return REPORT_DEDUCTIONS.filter(d=> d.always || data.some(r=> Math.abs(Number(r[d.src]) || 0) > 0.004));
}

/* Колонка: title, width, style (стиль ячейки), key (имя для формул), sum
   (стиль итога; нет — итог пустой), get(строка, номер, буквы колонок),
   f(номер строки, буквы) — формула, если колонка считается. */
function layoutSheet(cols, data, firstRow){
  const L = {};
  cols.forEach((c, i)=>{ if(c.key) L[c.key] = xlsxColName(i); });
  const header = cols.map(c=> ({v: c.title, s: 2}));
  const body = data.map((d, i)=>{
    const rn = firstRow + i;
    return cols.map(c=>{
      const val = c.get(d, i, L);
      if(val && typeof val === 'object' && 'v' in val) return Object.assign({s: c.style}, val);
      const cell = {v: val, s: c.style};
      if(c.f) cell.f = c.f(rn, L);
      return cell;
    });
  });
  let tot = null;
  if(data.length){
    const last = firstRow + data.length - 1;
    tot = cols.map((c, i)=>{
      if(i === 0) return {v: '', s: 7};
      if(i === 1) return {v: 'ИТОГО', s: 7};
      if(!c.sum) return {v: '', s: 7};
      const letter = xlsxColName(i);
      const sumv = data.reduce((s, d)=> s + (Number(c.get(d, 0, L)) || 0), 0);
      return {v: sumv, f: `SUM(${letter}${firstRow}:${letter}${last})`, s: c.sum};
    });
  }
  return {L, header, body, tot};
}

function buildSummaryColumns(present, owner){
  const cols = [
    {title:'№', width:5, style:5, get:(d, i)=> i + 1},
    {title:'Товар', width:30, style:3, get:d=> d.name}
  ];
  /* «Последний приход» — только в главном аккаунте */
  if(owner) cols.push({title:'Последний приход', width:14, style:6, get:d=> d.lastIn ? xlsxDateSerial(d.lastIn) : ''});
  cols.push(
    {title:'Продано, шт', width:10, style:5, key:'qty', sum:9, get:d=> d.qty},
    {title:'Закупка, ₽', width:13, style:4, key:'cost', sum:8, get:d=> d.cost},
    {title:'Реализация, ₽', width:14, style:4, key:'revenue', sum:8, get:d=> d.revenue},
    {title:'Прибыль валовая, ₽', width:14, style:4, key:'gross', sum:8,
      get:d=> d.revenue - d.cost, f:(rn, L)=> `${L.revenue}${rn}-${L.cost}${rn}`}
  );
  present.forEach(p=> cols.push({title:p.title, width:13, style:4, key:p.src, sum:8, get:d=> d[p.src]}));
  /* реклама в отчёт по товарам не выводится: она одна на весь магазин, её видно внизу */
  cols.push({title:'Прибыль чистая, ₽', width:14, style:4, key:'net', sum:8,
    get:d=> d.revenue - d.cost - present.reduce((s, p)=> s + (Number(d[p.src]) || 0), 0),
    f:(rn, L)=> [`${L.gross}${rn}`].concat(present.map(p=> `${L[p.src]}${rn}`)).join('-')});
  cols.push(
    {title:'Вернули, шт', width:10, style:5, key:'got', sum:9, get:d=> d.got},
    {title:'Повреждены, шт', width:12, style:5, key:'damaged', sum:9, get:d=> d.damaged},
    {title:'Остаток на складе, шт', width:13, style:5, key:'stock', sum:9, get:d=> d.stock}
  );
  return cols;
}

async function exportProductReport(){
  const days = currentFinancePeriod;
  const range = getPeriodRange(days);
  const {list, lastIn, waiting, products} = await buildProductReport(days);
  const owner = isFullWorkspace();
  /* Реклама — одна сумма на весь магазин за период, по товарам не делится */
  const adsTotal = await computeAdSpendForPeriod(days);
  const data = list.map(r=>{
    const p = products.find(x=> x.sku === r.sku) || {};
    return {
      name: r.name, sku: r.sku, barcode: p.barcode || '', supplier: p.supplier || '',
      lastIn: lastIn[r.sku] || 0,
      qty: r.qty, cost: r.cost, revenue: r.revenue,
      comm: r.comm, tax: r.tax, pack: r.pack, deliv: r.deliv,
      got: r.got, reship: r.reship, damaged: r.damaged,
      wait: (waiting[r.sku] && waiting[r.sku].ret) || 0,
      stock: Number(p.totalStock) || 0
    };
  });
  const present = presentDeductions(data);
  const cols = buildSummaryColumns(present, owner);
  const {L, header, body, tot} = layoutSheet(cols, data, 5);
  const rows = [
    [{v: 'Отчёт по товарам', s: 1}],
    [{v: 'Период: ' + reportPeriodLabel(range), s: 10}],
    [],
    header
  ].concat(body);
  const netIdx = cols.findIndex(c=> c.key === 'net');
  const totalRow = 5 + data.length;
  if(tot) rows.push(tot);
  else rows.push([{v: 'За этот период продаж и возвратов не было', s: 10}]);

  /* Блок под таблицей: подпись в B:H, значение в I (колонка выручки). */
  const merges = ['A1:' + xlsxColName(cols.length - 1) + '1', 'A2:' + xlsxColName(cols.length - 1) + '2'];
  const partner = owner ? await computePartnerCommission(days) : 0;
  const tNet = tot ? tot[netIdx].v : 0;
  rows.push([]);
  const addBlock = (label, cell)=>{
    const r = rows.length + 1;
    rows.push([{v: '', s: 0}, {v: label, s: 3}].concat(Array(6).fill({v: '', s: 3}), [cell]));
    merges.push(`B${r}:H${r}`);
    return r;
  };
  const adsRow = addBlock('Реклама за период (общая, на весь магазин), ₽', {v: adsTotal, s: 4});
  let partnerRow = null;
  if(owner) partnerRow = addBlock('Комиссия партнёрам, ₽', {v: partner, s: 4});
  const netFinal = tNet - adsTotal - partner;
  let netF = tot ? `${L.net}${totalRow}-I${adsRow}` : null;
  if(netF && partnerRow) netF += `-I${partnerRow}`;
  addBlock('Чистая прибыль' + (owner ? ' (после рекламы и партнёров), ₽' : ' (после рекламы), ₽'),
    netF ? {v: netFinal, f: netF, s: 8} : {v: netFinal, s: 8});

  const sheets = [{
    name: 'Сводка по товарам',
    cols: cols.map(c=> c.width),
    rows, freeze: 4, merges
  }];

  /* Вкладка «Реклама» есть всегда: по дням периода и итог. Если расходов
     не было — так и написано, а не пустой лист. */
  const days2 = await adSpendByDay(range);
  const adRows = [
    [{v: 'Реклама по дням', s: 1}],
    [],
    [{v: 'Дата', s: 2}, {v: 'Сумма, ₽', s: 2}]
  ];
  if(days2.length){
    days2.forEach(d=>{
      const [y, m, dd] = d.key.split('-').map(Number);
      adRows.push([{v: xlsxDateSerial(new Date(y, m - 1, dd).getTime()), s: 6}, {v: d.amount, s: 4}]);
    });
    const a1 = 4, a2 = 3 + days2.length;
    adRows.push([{v: 'ИТОГО', s: 7}, {v: days2.reduce((s, d)=> s + d.amount, 0), f: `SUM(B${a1}:B${a2})`, s: 8}]);
  } else {
    adRows.push([{v: 'За этот период расходов на рекламу не было', s: 10}]);
  }
  sheets.push({name: 'Реклама', cols: [16, 16], rows: adRows, freeze: 3});

  if(owner){
    const payouts = (await getAllLive('payouts'))
      .filter(p=> !range || (p.timestamp >= range.start && p.timestamp <= range.end))
      .sort((a, b)=> a.timestamp - b.timestamp);
    if(payouts.length){
      const pRows = [
        [{v: 'Выплаты партнёрам', s: 1}],
        [],
        [{v: 'Дата', s: 2}, {v: 'Партнёр', s: 2}, {v: 'Сумма, ₽', s: 2}, {v: 'Что закрыто', s: 2}]
      ];
      payouts.forEach(p=>{
        pRows.push([
          {v: xlsxDateSerial(p.timestamp), s: 6},
          {v: p.employee || 'общий', s: 3},
          {v: p.amount, s: 4},
          {v: p.note || '', s: 3}
        ]);
      });
      const p1 = 4, p2 = 3 + payouts.length;
      pRows.push([{v: 'ИТОГО', s: 7}, {v: '', s: 7},
        {v: payouts.reduce((s, p)=> s + (Number(p.amount) || 0), 0), f: `SUM(C${p1}:C${p2})`, s: 8}, {v: '', s: 7}]);
      sheets.push({name: 'Выплаты партнёрам', cols: [16, 22, 16, 48], rows: pRows, freeze: 3});
    }
  }

  downloadFile('otchet-tovary-' + reportStamp(range) + '.xlsx', makeXlsx(sheets),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  toast('Отчёт по товарам выгружен: ' + list.length + ' тов.');
}

async function exportProductUnits(){
  const days = currentFinancePeriod;
  const range = getPeriodRange(days);
  const hist = await getAllLive('history');
  const products = await getAllLive('products');
  const inRange = ts => !range || (ts >= range.start && ts <= range.end);
  const sales = hist.filter(h=> h.type === 'Расход' && inRange(h.timestamp))
    .sort((a, b)=> (a.timestamp || 0) - (b.timestamp || 0));
  const data = [];
  sales.forEach(h=>{
    const p = products.find(x=> x.sku === h.sku) || {};
    const e = opEconomics(h, p);
    if(!e || !e.qty) return;
    const q = e.qty, per = v => v / q;
    for(let i = 0; i < q; i++){
      data.push({
        date: h.timestamp || 0, time: h.time || '',
        name: h.name || p.name || h.sku, sku: h.sku, barcode: p.barcode || '', supplier: p.supplier || '',
        price: per(e.revenue), cost: per(e.cost), comm: per(e.comm), tax: per(e.tax),
        pack: per(e.pack), deliv: per(e.delivDiscount)
      });
    }
  });
  const present = presentDeductions(data);
  const cols = [
    {title:'№', width:6, style:5, get:(d, i)=> i + 1},
    {title:'Дата продажи', width:14, style:6, get:d=> xlsxDateSerial(d.date)},
    {title:'Время', width:11, style:3, get:d=> d.time},
    {title:'Товар', width:30, style:3, get:d=> d.name},
    {title:'Цена продажи, ₽', width:14, style:4, key:'price', sum:8, get:d=> d.price},
    {title:'Закупка, ₽', width:13, style:4, key:'cost', sum:8, get:d=> d.cost}
  ];
  present.forEach(p=> cols.push({title:p.title, width:13, style:4, key:p.src, sum:8, get:d=> d[p.src]}));
  cols.push({title:'Прибыль чистая, ₽', width:14, style:4, key:'net', sum:8,
    get:d=> d.price - d.cost - present.reduce((s, p)=> s + (Number(d[p.src]) || 0), 0),
    f:(rn, L)=> [`${L.price}${rn}`, `${L.cost}${rn}`].concat(present.map(p=> `${L[p.src]}${rn}`)).join('-')});

  const {header, body, tot} = layoutSheet(cols, data, 5);
  const last = xlsxColName(cols.length - 1);
  const rows = [
    [{v: 'Продажи поштучно', s: 1}],
    [{v: 'Период: ' + reportPeriodLabel(range), s: 10}],
    [],
    header
  ].concat(body);
  rows.push(tot || [{v: 'За этот период продаж не было', s: 10}]);
  const sheets = [{
    name: 'Продажи поштучно',
    cols: cols.map(c=> c.width),
    rows, freeze: 4, merges: ['A1:' + last + '1', 'A2:' + last + '2']
  }];
  downloadFile('otchet-poshtuchno-' + reportStamp(range) + '.xlsx', makeXlsx(sheets),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  toast('Поштучный отчёт выгружен: ' + data.length + ' шт');
}

/* Учёт возвратов за выбранный период — по каждому товару: сколько вернул
   покупатель, сколько отправили снова и сколько оказалось повреждёнными.
   «Сейчас ждут» — открытые возвраты на сегодня (за всё время), их не
   отменяет смена периода. Источник тот же, что у вкладки «Возвраты». */
async function renderReturnsReport(days){
  const box = document.getElementById('financeReturns');
  if(!box) return;
  const hist = await getAllLive('history');
  const range = getPeriodRange(days);
  const inRange = ts => !range || (ts >= range.start && ts <= range.end);
  const rows = {};
  hist.forEach(h=>{
    if(h.type !== 'Корректировка' || !h.snap || !h.snap.isReturn || !inRange(h.timestamp)) return;
    const r = rows[h.sku] || (rows[h.sku] = {name: h.name || h.sku, got:0, reship:0, damaged:0});
    const q = Math.abs(Number(h.qty)) || Math.abs(Number(h.delta)) || 0;
    if(!h.snap.returnClose) r.got += q;
    else if(h.snap.returnAction === 'reship') r.reship += q;
    else if(h.snap.returnAction === 'damaged') r.damaged += q;
  });
  const waiting = await returnsBySku();
  const list = Object.entries(rows).sort((a,b)=> b[1].got - a[1].got);
  if(!list.length){
    box.innerHTML = emptyLine('i-inbox', 'За этот период возвратов не было');
    return;
  }
  const totalGot = list.reduce((s,[,r])=> s + r.got, 0);
  box.innerHTML = list.map(([sku,r])=>{
    const open = (waiting[sku] && waiting[sku].ret) || 0;
    return `<div class="row-item">
      <div class="rmain"><div class="rname">${escapeHtml(r.name)}</div>
        <div class="rmeta" style="white-space:normal;overflow:visible;text-overflow:clip;">отправили снова ${r.reship} шт · повреждены ${r.damaged} шт · сейчас ждут ${open} шт</div></div>
      <span class="rval">${r.got} шт</span>
    </div>`;
  }).join('') + `<div class="t-caption" style="margin-top:8px;color:var(--text-tertiary);">
    Всего вернули за период: ${totalGot} шт. «Вернули» — сколько штук пришло от покупателя за период.
    «Отправили снова» — ушли покупателю повторно, списаны со склада. «Повреждены» — перенесены в «Повреждённые».
    «Сейчас ждут» — возвраты, которые ещё не отправлены, за всё время.</div>`;
}

/* Ключ дня по местному времени. Через toISOString получался бы день по
   Гринвичу: ночью до трёх часов запись уходила бы во вчера. */
function dateKeyOf(d){
  const p = n=> String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}
function todayDateKey(){
  return dateKeyOf(new Date());
}

/* ============================================================
   РЕКЛАМА: ЕЖЕДНЕВНАЯ СУММА И ПОПРАВКИ
   Тратят на рекламу обычно ровно и каждый день, поэтому вносить её
   вручную по дню — лишняя работа, а забыл один раз, и отчёт врёт.
   Вместо этого хранится ставка: сумма и день, с которого она в силе.
   Поменяли — с этого дня считается новая, прошлые дни не трогаются.
   Поправка за конкретный день перебивает ставку.
   ============================================================ */
function adRates(){
  const list = Array.isArray(settings.adRates) ? settings.adRates.slice() : [];
  return list.sort((a,b)=> String(a.from).localeCompare(String(b.from)));
}
function adRateForDay(key){
  let value = 0;
  for(const r of adRates()){
    if(String(r.from) <= key) value = Number(r.amount) || 0;
    else break;
  }
  return value;
}
function currentAdRate(){
  const list = adRates();
  return list.length ? list[list.length-1] : null;
}

async function computeAdSpendForPeriod(days){
  const manual = await getAllLive('adspend');
  const byDay = {};
  manual.forEach(a=>{ byDay[a.dateKey] = Number(a.amount) || 0; });

  let range;
  if(days === null){
    // «всё время»: от самой ранней записи или начала первой ставки
    const keys = Object.keys(byDay).concat(adRates().map(r=> String(r.from))).sort();
    if(!keys.length) return 0;
    range = {start: new Date(keys[0] + 'T00:00:00').getTime(), end: Date.now()};
  } else {
    range = getPeriodRange(days);
  }

  let total = 0;
  const day = new Date(range.start);
  day.setHours(12,0,0,0);
  const last = new Date(range.end);
  /* предохранитель: перебор по дням не должен уходить в бесконечность,
     если период задан странно */
  for(let guard = 0; day <= last && guard < 4000; guard++){
    const key = dateKeyOf(day);
    total += (key in byDay) ? byDay[key] : adRateForDay(key);
    day.setDate(day.getDate() + 1);
  }
  return total;
}

async function saveAdRate(){
  const raw = document.getElementById('adRateInput').value;
  const val = Number(raw);
  if(raw === '' || isNaN(val) || val < 0){ toast('Введите сумму в рублях'); return; }

  const today = todayDateKey();
  const list = adRates().filter(r=> String(r.from) !== today);   // за сегодня ставка одна
  list.push({from: today, amount: val});
  settings.adRates = list;
  await saveAppSettings();

  renderAdRate();
  toast('С сегодняшнего дня считается по ' + val + ' ₽');
  await renderFinance(currentFinancePeriod, null);
}

function renderAdRate(){
  const box = document.getElementById('adRateNow');
  const input = document.getElementById('adRateInput');
  if(!box) return;
  const rate = currentAdRate();
  if(rate){
    if(input && document.activeElement !== input) input.value = rate.amount;
    box.textContent = 'Сейчас: ' + Math.round(rate.amount) + ' ₽ в день, с '
        + new Date(rate.from + 'T12:00:00').toLocaleDateString('ru-RU')
        + '. Поменяете — новая сумма пойдёт с сегодняшнего дня, прошлые останутся как были.';
  } else {
    box.textContent = 'Сумма не задана — реклама считается только по поправкам за конкретные дни.';
  }
}
/* День берём из поля, а не «сегодня»: расходы часто вносят на следующий
   день, и без выбора даты они падали бы не в тот отчёт. */
function selectedAdSpendKey(){
  const el = document.getElementById('adSpendDate');
  return (el && el.value) ? el.value : todayDateKey();
}
function markAdSpendDirty(){
  const mark = document.getElementById('adSpendSavedMark');
  if(mark) mark.style.display = 'none';
}
function showAdSpendSaved(saved){
  const mark = document.getElementById('adSpendSavedMark');
  if(mark) mark.style.display = saved ? 'inline' : 'none';
}

async function saveAdSpend(){
  const raw = document.getElementById('adSpendInput').value;
  const val = Number(raw);
  if(raw === '' || isNaN(val) || val < 0){ toast('Введите сумму в рублях'); return; }

  const key = selectedAdSpendKey();
  const day = new Date(key + 'T12:00:00');
  await put('adspend', {
    dateKey: key,
    dateDisplay: day.toLocaleDateString('ru-RU'),
    timestamp: day.getTime(),
    amount: val,
    deletedAt: undefined      // день могли раньше «убрать» — возвращаем
  });
  showAdSpendSaved(true);
  toast('Записано: ' + val + ' ₽ за ' + day.toLocaleDateString('ru-RU'));
  await renderFinance(currentFinancePeriod, null);
}

/* Подставляем уже записанное за выбранный день — видно, что день закрыт,
   и случайно вписать вторую сумму поверх не выйдет незаметно. */
async function loadAdSpendForDate(){
  const entry = await get('adspend', selectedAdSpendKey());
  const input = document.getElementById('adSpendInput');
  input.value = (entry && !entry.deletedAt) ? entry.amount : '';
  showAdSpendSaved(Boolean(entry && !entry.deletedAt));
}

/* Убрать поправку — значит вернуть дню обычную ежедневную сумму. */
async function clearAdSpendDay(){
  const key = selectedAdSpendKey();
  const entry = await get('adspend', key);
  if(!entry || entry.deletedAt){ toast('За этот день поправки нет'); return; }
  await softDelete('adspend', key);
  document.getElementById('adSpendInput').value = '';
  showAdSpendSaved(false);
  toast('Поправка убрана — день считается по обычной сумме');
  await renderFinance(currentFinancePeriod, null);
}

async function loadAdSpendToday(){
  const dateEl = document.getElementById('adSpendDate');
  if(dateEl && !dateEl.value) dateEl.value = todayDateKey();
  renderAdRate();
  await loadAdSpendForDate();
}
/* В журнале и смены ежедневной суммы, и поправки за отдельные дни —
   иначе непонятно, откуда в отчёте взялась цифра. */
async function renderAdSpendLog(){
  const manual = await getAllLive('adspend');
  const list = document.getElementById('adSpendLog');

  const rateRows = adRates().slice().reverse().map(r=>({
    kind: 'rate',
    key: String(r.from),
    title: 'По ' + Math.round(r.amount) + ' ₽ в день',
    meta: 'с ' + new Date(r.from + 'T12:00:00').toLocaleDateString('ru-RU'),
    amount: r.amount
  }));
  const dayRows = manual.slice().sort((a,b)=> String(b.dateKey).localeCompare(String(a.dateKey))).map(a=>({
    kind: 'day',
    key: a.dateKey,
    title: a.dateDisplay || a.dateKey,
    meta: 'поправка за день',
    amount: a.amount
  }));

  const rows = rateRows.concat(dayRows);
  if(!rows.length){
    list.innerHTML = emptyLine('i-wallet','Расходы на рекламу пока не вносились');
    return;
  }

  list.innerHTML = rows.slice(0,60).map(r=>`
    <div class="row-item">
      <div class="rmain">
        <div class="rname">${escapeHtml(r.title)}</div>
        <div class="rmeta">${escapeHtml(r.meta)}</div>
      </div>
      <div class="rside">
        <span class="rval">${Math.round(r.amount)} ₽</span>
        ${r.kind === 'day'
          ? `<button class="icon-btn" onclick="deleteAdSpend('${escapeAttr(r.key)}')" aria-label="Убрать поправку"><svg class="icon"><use href="#i-trash"/></svg></button>`
          : `<button class="icon-btn" onclick="deleteAdRate('${escapeAttr(r.key)}')" aria-label="Убрать сумму"><svg class="icon"><use href="#i-trash"/></svg></button>`}
      </div>
    </div>`).join('');
}

async function deleteAdRate(from){
  if(!confirm('Убрать эту ежедневную сумму? Дни после неё будут считаться по предыдущей.')) return;
  settings.adRates = adRates().filter(r=> String(r.from) !== String(from));
  await saveAppSettings();
  renderAdRate();
  toast('Убрано');
  await renderFinance(currentFinancePeriod, null);
}
async function deleteAdSpend(dateKey){
  if(!confirm('Удалить запись о расходах на рекламу за этот день?')) return;
  await softDelete('adspend', dateKey);
  toast('Запись удалена');
  await renderFinance(currentFinancePeriod, null);
}

/* ============================================================
   ABC-АНАЛИЗ
   ============================================================ */
/* Три карточки во «Расходах» — ПТП / ABC / РНР — показаны по одной,
   переключаются как «Сегодня/Неделя/Месяц» у периода. */
var finSubTab = 'ptp';
function switchFinSubTab(tab){
  finSubTab = tab;
  const map = {ptp:'Ptp', abc:'Abc', rnr:'Rnr', sales:'Sales', fc:'Fc'};
  Object.keys(map).forEach(key=>{
    const isActive = key === tab;
    const btn = document.getElementById('finSubBtn'+map[key]);
    const panel = document.getElementById('finSub'+map[key]);
    if(btn) btn.classList.toggle('active', isActive);
    if(panel) panel.hidden = !isActive;
  });
  renderFinSubTab();
}
/* графики и прогноз строятся только когда их видно */
function renderFinSubTab(){
  if(finSubTab === 'sales') renderSalesCharts();
  if(finSubTab === 'fc') renderForecast();
}

async function generateABC(){
  const hist = await getAllLive('history');
  const products = await getAllLive('products');
  const bySku = {};
  hist.filter(h=> h.type==='Расход' && (!abcRange || (h.timestamp>=abcRange.start && h.timestamp<=abcRange.end))).forEach(h=>{
    const p = products.find(x=>x.sku===h.sku);
    const e = opEconomics(h, p);
    if(!e) return;
    if(!bySku[h.sku]) bySku[h.sku] = {sku:h.sku, name:(p ? p.name : h.name) || h.sku, qty:0, revenue:0};
    bySku[h.sku].qty += e.qty;
    bySku[h.sku].revenue += e.revenue;
  });
  const rows = Object.values(bySku);
  const totalRevenue = rows.reduce((s,r)=>s+r.revenue, 0);
  rows.sort((a,b)=>b.revenue-a.revenue);
  let cum=0;
  rows.forEach(r=>{
    const share = totalRevenue>0 ? r.revenue/totalRevenue*100 : 0;
    cum += share;
    r.share = share.toFixed(1); r.cum = cum.toFixed(1);
    r.cls = cum<=80?'A':(cum<=95?'B':'C');
  });
  const list = document.getElementById('abcList');
  if(rows.length===0){ list.innerHTML = emptyLine('i-chart', abcRange ? 'Нет продаж за выбранный период' : 'Нет продаж — анализ появится после расходов'); return; }
  list.innerHTML = rows.map((r,idx)=>`
    <div class="row-item">
      <div class="rmain"><div class="rname">${idx+1}. ${escapeHtml(r.name)}</div><div class="rmeta">${r.qty} шт · ${Math.round(r.revenue)} ₽ · накопл. ${r.cum}%</div></div>
      <span class="tag ${r.cls}">${r.cls}</span>
    </div>`).join('');
}

