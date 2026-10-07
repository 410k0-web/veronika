import {transitionScene, crossfadePhoto, animateFooter, captureMotionOrigin} from '/motion.js?v=2';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const app = $('#app');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const button = (label, action, cls = '', disabled = false) => `<button class="button ${cls}" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let session = {unlocked:false,admin:false,completed:[]};
let content = null;
let currentView = 'welcome';
let sceneId = 0;
let timers = [];
let frameId = 0;
let navBusy = false;
let actionBusy = false;
let toastTimer;
let letterPage = 0;
let letterOpenedAt = 0;
let nextTaps = [];
let readingReview = false;
let questionMode = 'quiz';
let questionIndex = 0;
let selectedAnswer = null;
let questionBusy = false;
let questionTimerPaused = false;
let retryTimedOutAnswer = false;
let currentQuestion = null;
let quizHistory = [];
let blitzHistory = [];
let heart = null;
let adminSessions = [];
let telegramStatus = {};
let serverOffset = 0;

function later(fn, ms) { const id = setTimeout(fn, ms); timers.push(['timeout',id]); return id; }
function every(fn, ms) { const id = setInterval(fn, ms); timers.push(['interval',id]); return id; }
function cleanup() { for (const [type,id] of timers) (type === 'interval' ? clearInterval : clearTimeout)(id); timers=[]; cancelAnimationFrame(frameId); }
function toast(text, ms=2300) { clearTimeout(toastTimer); $('#toast').textContent=text; $('#toast').classList.add('visible'); toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),ms); }
function photo(index) { crossfadePhoto(index, session.unlocked); }
function setFooter(text='Каждый момент здесь о тебе') { animateFooter(text); }
function remember(view) { try { sessionStorage.setItem('gift-view',view); } catch {} }
function remembered() { try { return sessionStorage.getItem('gift-view'); } catch { return null; } }
function completed(task) { return session.completed?.includes(task); }
async function api(path, body, method) {
  const response=await fetch(path,{method:method || (body !== undefined ? 'POST' : 'GET'),credentials:'same-origin',headers:body!==undefined?{'Content-Type':'application/json'}:{},body:body!==undefined?JSON.stringify(body):undefined,cache:'no-store'});
  const invalidResponse=()=>{
    const error=new Error(response.status===404?'Сайт ещё не готов к открытию. Попробуй чуть позже.':'Сайт временно недоступен. Попробуй ещё раз.');
    error.status=response.status;
    error.code='invalid_api_response';
    return error;
  };
  let data;
  try { data=await response.json(); } catch { throw invalidResponse(); }
  if(!data||typeof data!=='object'||Array.isArray(data))throw invalidResponse();
  const clock=data.serverTimeUtc||data.session?.serverTimeUtc;
  if(clock)serverOffset=new Date(clock).getTime()-Date.now();
  if (!response.ok) { const error=new Error(data.error || data.message || 'Не удалось сохранить. Попробуй ещё раз.'); error.status=response.status; error.data=data; throw error; }
  return data;
}
async function event(type,data={}) { if(!session.hasVisited||!session.unlocked) return; try { return await api('/api/events',{type,data}); } catch { /* The primary action remains visible and can be retried. */ } }
async function sync() { session=await api('/api/session'); return session; }
function deviceMeta() {
  const ua=navigator.userAgent;
  let browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Другой браузер';
  let platform=/Android/.test(ua)?'Android':/iPhone|iPad|iPod/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Не определена';
  return {browser,platform,device:/Mobi|Android|iPhone/.test(ua)?'Телефон':/iPad/.test(ua)?'Планшет':'Компьютер',language:navigator.language,screenWidth:screen.width,screenHeight:screen.height,viewportWidth:innerWidth,viewportHeight:innerHeight,pixelRatio:devicePixelRatio,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,touchPoints:navigator.maxTouchPoints,referrer:document.referrer};
}
async function scene(html,view,photoIndex=0) {
  if (navBusy) return false;
  navBusy=true;
  if(currentView==='letter') leaveLetter();
  cleanup();
  sceneId++;
  try {
    await transitionScene(app,html,currentView,view,()=>{
      currentView=view;
      remember(view);
      photo(photoIndex);
    });
    return true;
  } finally { navBusy=false; }
}
function envelope() { return `<div class="welcome-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="letter-object"><div class="envelope-lines"></div><span class="letter-caption">только для тебя</span><div class="wax-seal">${icon('heart')}</div></div><span class="art-note">Есть вещи, которые хочется<br>сохранить навсегда.</span><span class="floating-spark spark-one">✧</span><span class="floating-spark spark-two">✦</span></div>`; }
const publicIntro=['Привет.','Если ты сюда зашла, значит сейчас я один из самых счастливых людей на планете.','Но чтобы убедиться, что ты здесь не случайно...','Введи код, который у тебя в письме.'];
async function welcome() {
  const html=`<section class="welcome-layout"><div class="welcome-copy"><span class="eyebrow"><span class="tiny-star">✧</span> ПОСЛАНИЕ, КОТОРОЕ ЖДАЛО ТЕБЯ</span><div id="intro-step" class="intro-step first"></div><div class="intro-controls"><div class="story-dots" aria-hidden="true">${publicIntro.map((_,i)=>`<i ${i===0?'class="active"':''}></i>`).join('')}</div><button class="quiet-button" data-action="pin">У меня есть код</button></div></div>${envelope()}</section>`;
  if(!await scene(html,'welcome')) return;
  setFooter('Некоторые вещи проще сказать вот так');
  const token=sceneId;
  for(let i=0;i<publicIntro.length;i++) {
    if(token!==sceneId) return;
    const text=publicIntro[i], area=$('#intro-step');
    area.className=`intro-step ${i===0?'first':''}`;
    area.innerHTML=text.split(' ').map((w,j)=>`<span class="intro-word" style="animation-delay:${Math.min(j*.09,1.8)}s">${esc(w)}</span>`).join(' ');
    $$('.story-dots i').forEach((dot,j)=>dot.classList.toggle('active',j===i));
    await wait(i===0?2200:i===1?6300:i===2?3800:3300);
    if(token!==sceneId) return;
    area.classList.add('departing'); await wait(580);
  }
  if(token===sceneId) pin();
}
async function pin() {
  const html=`<section class="center-stage"><div class="emblem">${icon('lock')}</div><span class="eyebrow">ТОЛЬКО ДЛЯ ТЕБЯ</span><h1 class="display">У каждого письма<br>есть свой <em class="copper">секрет.</em></h1><p class="lead">Введи восемь символов из письма.<br>И маленький мир станет твоим.</p><form id="pin-form" autocomplete="off"><div class="pin-boxes" role="group" aria-label="Код из восьми символов">${Array.from({length:8},(_,i)=>`<input aria-label="Символ ${i+1} из 8" data-pin="${i}" type="text" inputmode="text" maxlength="1" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="${i===0?'one-time-code':'off'}">`).join('')}</div><div id="pin-error" class="pin-error" role="alert"></div><button id="unlock-button" class="button" type="submit" disabled>Открыть послание ${icon('arrow')}</button></form><p class="pin-footnote">Можно вставить код целиком.<br>Этот подарок сохраняет прогресс и ответы для автора.</p></section>`;
  if(!await scene(html,'pin'))return;
  setFooter('Этот момент только для тебя');
  const fields=$$('[data-pin]');
  const update=()=>{ $('#pin-error').textContent=''; $('.pin-boxes').classList.remove('has-error'); $('#unlock-button').disabled=fields.some(x=>!x.value)||actionBusy; };
  for(const [i,input] of fields.entries()) {
    input.addEventListener('input',()=>{ input.value=input.value.slice(-1); update(); if(input.value && fields[i+1]) fields[i+1].focus(); });
    input.addEventListener('focus',()=>input.select());
    input.addEventListener('keydown',e=>{ if(e.key==='Backspace'&&!input.value&&i>0){fields[i-1].focus();fields[i-1].value='';update();} else if(e.key==='ArrowLeft'&&i>0){e.preventDefault();fields[i-1].focus();} else if(e.key==='ArrowRight'&&i<7){e.preventDefault();fields[i+1].focus();} });
    input.addEventListener('paste',e=>{ const raw=e.clipboardData?.getData('text').trim(); if(!raw)return; e.preventDefault(); const start=raw.length>=8?0:i; [...raw].slice(0,8-start).forEach((c,j)=>fields[start+j].value=c); fields[Math.min(7,start+raw.length)].focus(); update(); });
  }
  $('#pin-form').addEventListener('submit',async e=>{
    e.preventDefault();if(actionBusy||fields.some(x=>!x.value))return;
    actionBusy=true;$('#unlock-button').disabled=true;$('#unlock-button').innerHTML='Открываю…';
    try {
      session=await api('/api/unlock',{code:fields.map(x=>x.value).join('')});
      fields.forEach(x=>x.blur());
      content=await api('/api/content');
      actionBusy=false;
      await event('pin_success');
      session.admin?admin():session.heartResult?menu():heartIntro();
    } catch(error) {
      actionBusy=false;$('#pin-error').textContent=error.message;$('.pin-boxes').classList.add('has-error');
      $('#unlock-button').innerHTML=`Открыть послание ${icon('arrow')}`;$('#unlock-button').disabled=false;
      fields[0].focus();fields[0].select();
    }
  });
}
async function heartIntro() {
  await scene(`<section class="center-stage"><div class="emblem">${icon('heart')}</div><span class="eyebrow">ДЛЯ НАЧАЛА НЕМНОГО МАГИИ</span><h1 class="display">Поймай моё <em class="copper">сердце.</em></h1><p class="lead">Лови сердечки, пока они убегают.<br>А разбитые лучше отпустить.</p><div class="game-rules"><div class="rule"><strong>15</strong>секунд на всё</div><div class="rule"><strong>❤️ +1</strong>за каждое сердце</div><div class="rule"><strong>💔 −1</strong>если не повезло</div></div><p class="pin-footnote" style="margin:0 0 25px">С каждым попаданием сердце чуть меньше и быстрее.<br>Жми, как только увидишь его.</p>${button(`Я готова ${icon('heart')}`,'heart-start')}</section>`,'heart-intro',4);
  setFooter('Моё сердце уже на твоей стороне');
  await event('heart_instructions');
}
async function heartGame() {
  if(!await scene(`<section class="heart-wrap"><div class="game-hud"><div class="hud-value"><span id="heart-score">0</span><small>пойманных сердец</small></div><div class="time-badge">${icon('clock')}<span id="heart-time">15</span> с</div></div><div id="heart-arena" class="heart-arena"><div id="countdown" class="arena-caption">3</div><button id="heart-target" class="heart-target" aria-label="Поймать сердце" hidden>${icon('heart')}</button></div><div class="timer-track" aria-hidden="true"><span id="heart-track"></span></div><p class="game-note">❤️ лови · 💔 пропускай · каждый момент на счету</p></section>`,'heart-game',4))return;
  setFooter('Попробуй удержать моё сердце');
  const token=sceneId;
  heart={score:0,hits:0,misses:0,broken:false,running:false,jumpTimer:0,end:0};
  for(let n=3;n>0;n--) { if(token!==sceneId)return; $('#countdown').textContent=n; await wait(700); }
  if(token!==sceneId)return;
  $('#countdown').remove();$('#heart-target').hidden=false;heart.running=true;heart.end=performance.now()+15000;
  await event('heart_start');
  if(token!==sceneId)return;
  jumpHeart();
  every(()=>{ if(!heart?.running)return; const remaining=Math.max(0,heart.end-performance.now());$('#heart-time').textContent=Math.ceil(remaining/1000);$('#heart-track').style.width=`${remaining/150}%`;if(remaining<=0)finishHeart(); },50);
  $('#heart-target').addEventListener('pointerdown',e=>{e.preventDefault();hitHeart();});
  $('#heart-target').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();hitHeart();}});
}
function jumpHeart() {
  if(!heart?.running)return;
  clearTimeout(heart.jumpTimer);
  const target=$('#heart-target'),arena=$('#heart-arena');if(!target||!arena)return;
  heart.broken=Math.random()<.22;
  const size=Math.max(47,68-heart.hits*.7);
  target.style.width=`${size}px`;target.style.height=`${size}px`;target.style.fontSize=`${size*.61}px`;
  target.style.left=`${14+Math.random()*Math.max(0,arena.clientWidth-size-28)}px`;
  target.style.top=`${14+Math.random()*Math.max(0,arena.clientHeight-size-28)}px`;
  target.classList.toggle('broken',heart.broken);target.innerHTML=heart.broken?'💔':icon('heart');target.setAttribute('aria-label',heart.broken?'Разбитое сердце, не нажимай':'Поймать сердце');
  heart.jumpTimer=setTimeout(jumpHeart,Math.max(540,850-heart.hits*17));
  timers.push(['timeout',heart.jumpTimer]);
}
function hitHeart() {
  if(!heart?.running)return;
  if(performance.now()>=heart.end){finishHeart();return;}
  const target=$('#heart-target'),arena=$('#heart-arena');
  const broken=heart.broken;
  if(broken){heart.misses++;heart.score--;}else{heart.hits++;heart.score++;}
  $('#heart-score').textContent=heart.score;
  const point=document.createElement('span');point.className=`hit-number ${broken?'negative':''}`;point.textContent=broken?'−1':'+1';point.style.left=target.style.left;point.style.top=target.style.top;arena.append(point);later(()=>point.remove(),750);
  event('heart_hit',{broken,score:heart.score});
  jumpHeart();
}
async function finishHeart() {
  if(!heart?.running)return;
  heart.running=false;clearTimeout(heart.jumpTimer);$('#heart-target').hidden=true;
  const result={score:heart.score,hits:heart.hits,misses:heart.misses};
  try { await api('/api/heart-result',result);await sync();heartResult(result); }
  catch(error){await scene(`<section class="notice-stage"><h1>Сердца пойманы.</h1><p>Сейчас не получилось сохранить результат. ${esc(error.message)}</p>${button('Сохранить ещё раз','heart-save')}</section>`,'heart-save',4);heart=result;}
}
async function heartResult(result=session.heartResult) {
  const score=result?.score??0;
  const text=score<=5?'Видимо, тебя игра не особо заинтересовала':score<=10?'Неплохо, заслуживает похвалы':score<=15?'Ого, да ты похитительница сердец. Моё сердце и так было похищено тобой':'Моё сердце официально твоё ❤️';
  await scene(`<section class="center-stage"><span class="eyebrow">В ЛЮБОМ СЛУЧАЕ ОНО ТВОЁ</span><div class="result-score">${score}<small>${declension(score,['сердце','сердца','сердец'])}</small></div><h1 class="display" style="font-size:clamp(29px,4vw,45px)">${esc(text)}</h1>${button(`Дальше ${icon('arrow')}`,'interlude')}</section>`,'heart-result',2);
  setFooter('Твой счёт ничего не меняет между нами');
}
function declension(n,forms){n=Math.abs(n)%100;const d=n%10;return n>10&&n<20?forms[2]:d===1?forms[0]:d>=2&&d<=4?forms[1]:forms[2];}
async function interlude() {
  const veil=document.createElement('div');veil.className='interlude';veil.innerHTML=`<p>${esc(content.interludeText||'Ну, с СДВГ-моментом пока закончим')}</p>`;document.body.append(veil);
  const token=sceneId;
  event('interlude');
  try { await wait(1800);if(token!==sceneId)return;await menu();veil.classList.add('departing');await wait(reducedMotion?0:800); }
  finally { veil.remove(); }
}
async function menu() {
  await sync();
  const n=session.completed?.length||0;
  const card=(id,number,title,desc,symbol,cls='')=>{
    const done=completed(id);const disabled=id==='finale'?!session.finaleUnlocked:id==='letter'?done&&session.letter?.skipped:done;
    const status=done?(id==='letter'&&session.letter?.skipped?'Пропущено':id==='letter'?'Прочитано · можно перечитать':'Завершено'):desc;
    return `<button class="chapter-card ${cls} ${done?'completed':''}" data-action="${id}" ${disabled?'disabled':''}><div class="card-top"><span class="card-number">0${number}</span><span class="card-symbol">${icon(done?'check':symbol)}</span></div><h2>${title}</h2><p>${esc(status)}</p>${icon(id==='finale'&&!session.finaleUnlocked?'lock':'arrow','card-arrow')}</button>`;
  };
  await scene(`<section class="menu-layout"><div class="menu-heading"><span class="eyebrow"><span class="tiny-star">✧</span> НАША МАЛЕНЬКАЯ ИСТОРИЯ</span><h1>Теперь<br>о самом <em>важном.</em></h1><p class="lead">Несколько слов, немного вопросов<br>и кое-что в самом конце.</p><div class="menu-progress"><div class="progress-seeds" aria-hidden="true">${[0,1,2].map(i=>`<span ${i<n?'class="done"':''}></span>`).join('')}</div><span>${n} из 3 заданий завершено</span></div></div><div><div class="menu-grid">${card('letter',1,'Душнота','То, что хочется тебе сказать','letter')}${card('quiz',2,'Викторина','10 вопросов обо мне','spark')}${card('blitz',3,'Блитц','10 вопросов. Только не думай долго','bolt')}${card('finale',4,'Концовка',session.finaleUnlocked?'Твой последний маленький шаг':`Откроется после 3 заданий · ${n}/3`,'gift','finale')}</div><p class="fine-note">Всё здесь создано ради твоей улыбки.</p></div></section>`,'menu',1);
  setFooter('Можно выбрать любой порядок');
  event('menu_open');
}
function leaveLetter() { if(letterOpenedAt) { event('letter_page_leave',{index:letterPage,durationMs:Math.round(performance.now()-letterOpenedAt)});letterOpenedAt=0; } }
async function letter(index) {
  if(completed('letter')&&session.letter?.skipped){toast('Эта часть уже завершена');return;}
  if(currentView==='letter')leaveLetter();
  if(index===undefined) { readingReview=completed('letter');letterPage=readingReview?0:Math.min(4,session.letter?.lastPage??0);nextTaps=[]; }
  else letterPage=Math.max(0,Math.min(4,index));
  const text=content.letterPages[letterPage];
  const sentences=text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[text];
  const title=letterPage===0?'Вероника,':letterPage===4?'Всем сердцем.':'Ещё кое-что…';
  if(!await scene(`<section class="reading-wrap"><div class="section-topline"><button class="text-button" data-action="menu">${icon('back')}В меню</button><span class="chapter-label">ДУШНОТА · ${letterPage+1} / 5</span></div><article class="letter-paper"><h1>${title}</h1><p class="letter-text">${sentences.map((s,i)=>`<span class="line-reveal" style="animation-delay:${i*.28}s">${esc(s)}</span>`).join(' ')}</p><div class="reading-signature">с любовью, 410k0</div></article><div class="reading-actions">${button('Назад','letter-back','secondary',letterPage===0)}<div class="page-counter" aria-label="Страница ${letterPage+1} из 5">${[0,1,2,3,4].map(i=>`<span ${i===letterPage?'class="active"':''}></span>`).join('')}</div>${button(letterPage===4?'Завершить':'Далее','letter-next')}</div></section>`,'letter',letterPage===2?5:letterPage===3?2:letterPage===4?5:3))return;
  letterOpenedAt=performance.now();setFooter('Эти слова можно читать в своём темпе');
  await event('letter_page',{index:letterPage});
}
async function letterNext() {
  if(navBusy||actionBusy)return;
  const now=performance.now();nextTaps=nextTaps.filter(t=>now-t<5000);nextTaps.push(now);
  const elapsed=now-letterOpenedAt;
  if(!readingReview && nextTaps.length>=2 && elapsed<1900){skipDialog();return;}
  if(letterPage<4){await letter(letterPage+1);return;}
  actionBusy=true;
  try { if(!readingReview)await api('/api/complete',{task:'letter',skipped:false});await sync();await scene(`<section class="center-stage"><div class="emblem">${icon('letter')}</div><h1 class="display">${esc(content.letterThanksText||'Спасибо, что прочитала это')}</h1><p class="lead">Теперь ты знаешь немного больше о том,<br>что у меня внутри.</p></section>`,'letter-thanks',2);setFooter('Иногда самое важное помещается в нескольких словах');later(()=>menu().catch(showError),2600); }
  catch(error){toast(error.message);}
  finally{actionBusy=false;}
}
function skipDialog() {
  if($('#modal').open)return;
  $('#modal-content').innerHTML=`<h2>Ты хочешь всё это пропустить?</h2><p>Можно. Я не обижусь.<br>Эта глава завершится, и вернуться к ней уже не получится.</p><div class="modal-actions">${button('Нет, я прочитаю','letter-no','secondary')}${button('Да','letter-skip')}</div>`;
  $('#modal').showModal();event('letter_skip_prompt',{index:letterPage});
}
async function skipLetter() {
  if(actionBusy)return;actionBusy=true;
  try {await api('/api/complete',{task:'letter',skipped:true});$('#modal').close();await sync();await menu();}
  catch(error){toast(error.message);}
  finally{actionBusy=false;}
}
async function quizIntro(mode) {
  if(completed(mode)){toast('Ты уже прошла эту главу');return;}
  questionMode=mode;
  const status=session[mode];
  if(status?.answered>0){if(status.finished)await questionResult(mode);else await question(mode,status.answered);return;}
  const blitz=mode==='blitz';
  await scene(`<section class="center-stage"><div class="emblem">${icon(blitz?'bolt':'spark')}</div><span class="eyebrow">${blitz?'БЫСТРО, НО С ЛЮБОВЬЮ':'НАСКОЛЬКО ХОРОШО ТЫ МЕНЯ ЗНАЕШЬ'}</span><h1 class="display">${blitz?'Первое, что<br>приходит <em class="copper">в голову.</em>':'Десять вопросов.<br><em class="copper">Один человек.</em>'}</h1><p class="lead">${blitz?'На каждый вопрос от 10 до 15 секунд.<br>Выбери один вариант и нажми «Ответить».':'Выбирай один ответ на каждый вопрос.<br>Здесь можно думать сколько захочешь.'}</p>${button(`Начать ${icon(blitz?'bolt':'spark')}`,blitz?'blitz-start':'quiz-start')}<div style="margin-top:14px"><button class="text-button" data-action="menu">${icon('back')}В меню</button></div></section>`,`${mode}-intro`,blitz?3:5);
  setFooter(blitz?'Не думай долго. Просто чувствуй.':'Мне интересно, что ты выберешь');
  await event(`${mode}_instructions`);
}
function shuffled(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
async function startQuestions(mode) {
  if(actionBusy)return;actionBusy=true;
  try {if(mode==='blitz'){await api('/api/events',{type:'blitz_start',data:{}});await sync();}await question(mode,session[mode]?.answered||0);}
  catch(error){toast(error.message);}
  finally{actionBusy=false;}
}
async function question(mode,index) {
  questionMode=mode;questionIndex=index;selectedAnswer=null;questionBusy=false;questionTimerPaused=false;retryTimedOutAnswer=false;
  const list=mode==='quiz'?content.quizQuestions:content.blitzQuestions;
  if(index>=list.length){questionResult(mode);return;}
  currentQuestion=list[index];
  const options=shuffled(currentQuestion.options);
  const blitz=mode==='blitz';
  const html=`<section class="question-wrap"><div class="question-top"><button class="text-button" data-action="question-menu">${icon('back')}В меню</button><span class="question-counter"><strong>${String(index+1).padStart(2,'0')}</strong> / 10</span>${blitz?'<span id="blitz-time" class="question-timer">12 с</span>':'<span class="chapter-label">ВИКТОРИНА</span>'}</div><div class="question-progress" aria-label="Вопрос ${index+1} из 10">${list.map((_,i)=>`<span class="${i<index?'passed':i===index?'current':''}"></span>`).join('')}</div><h1>${esc(currentQuestion.prompt)}</h1><div class="answers" role="group" aria-label="Варианты ответа">${options.map((o,i)=>`<button class="answer" data-answer="${esc(o.id)}" aria-pressed="false"><span class="answer-letter">${['A','B','C','D'][i]}</span><span>${esc(o.text)}</span></button>`).join('')}</div><div class="question-actions"><span id="answer-hint" class="answer-hint">Выбери один ответ</span><button id="answer-button" class="button" data-action="answer" disabled>Ответить ${icon('arrow')}</button></div>${blitz?'<div class="timer-track" aria-hidden="true"><span id="blitz-track"></span></div>':''}</section>`;
  if(!await scene(html,mode,blitz?(index===3?5:3):2))return;
  setFooter(blitz?'Первый ответ часто самый честный':'Ты уже знаешь больше, чем кажется');
  const opened=await event('question_open',{mode,index});
  if(blitz&&opened?.session)session=opened.session;
  if(blitz) {
    let deadline=session.blitz?.deadlineUtc;
    if(!deadline){await api('/api/events',{type:'blitz_start',data:{}});await sync();deadline=session.blitz?.deadlineUtc;}
    const end=new Date(deadline).getTime();
    const duration=(currentQuestion.timeLimitSeconds||12)*1000;
    const token=sceneId;
    const tick=()=>{if(token!==sceneId||questionBusy||questionTimerPaused)return;const remaining=Math.max(0,end-(Date.now()+serverOffset));const el=$('#blitz-time');if(!el)return;el.textContent=`${Math.min(currentQuestion.timeLimitSeconds||12,Math.ceil(remaining/1000))} с`;el.classList.toggle('urgent',remaining<=4000);$('#blitz-track').style.width=`${Math.min(100,remaining/duration*100)}%`;if(remaining<=0)submitAnswer(true);};
    every(tick,100);tick();
  }
}
function chooseAnswer(id) {
  if(questionBusy)return;
  selectedAnswer=id;
  $$('.answer').forEach(el=>{const chosen=el.dataset.answer===id;el.classList.toggle('selected',chosen);el.setAttribute('aria-pressed',chosen?'true':'false');});
  $('#answer-button').disabled=false;$('#answer-hint').textContent='Можно изменить свой выбор';
  event('answer_selected',{mode:questionMode,index:questionIndex,answer:id});
}
async function submitAnswer(timedOut=false) {
  if(questionBusy||(!timedOut&&selectedAnswer===null))return;
  questionBusy=true;const token=sceneId;const mode=questionMode,index=questionIndex,q=currentQuestion,answer=timedOut?null:selectedAnswer;
  $('#answer-button').disabled=true;$('#answer-button').textContent=timedOut?'Время вышло':'Сохраняю…';$$('.answer').forEach(el=>el.disabled=true);
  try {
    const result=await api('/api/answers',{mode,index,answer});
    if(result.serverTimeUtc)serverOffset=new Date(result.serverTimeUtc).getTime()-Date.now();
    if(token!==sceneId)return;
    const correctIds=result.correctAnswers||result.correctIndices?.map(String)||[];
    const history={index,prompt:q.prompt,answer,selectedText:q.options.find(o=>o.id===answer)?.text||'Время вышло',correct:result.correct,correctTexts:q.options.filter(o=>correctIds.includes(o.id)).map(o=>o.text),timedOut:result.timedOut};
    (mode==='quiz'?quizHistory:blitzHistory).push(history);
    session[mode]={...(session[mode]||{}),answered:result.answered,score:result.score,finished:result.finished,deadlineUtc:result.deadlineUtc};
    $$('.answer').forEach(el=>{const right=correctIds.includes(el.dataset.answer);el.classList.remove('selected');el.classList.add(right?'correct':'wrong');if(!right&&el.dataset.answer===answer)el.classList.add('chosen-wrong');});
    $('#answer-hint').textContent=result.timedOut?'Время вышло. Вот правильный ответ.':result.correct?'Да, именно так ❤️':'Теперь ты знаешь';
    $('#answer-button').innerHTML=result.correct?`${icon('check')} Верно`:'Идём дальше';
    if($('#blitz-time'))$('#blitz-time').textContent=result.timedOut?'0 с':'✓';
    await wait(1550);if(token!==sceneId)return;
    if(result.finished){await sync();await questionResult(mode);}else await question(mode,index+1);
  } catch(error) {
    if(token!==sceneId)return;
    questionBusy=false;questionTimerPaused=true;retryTimedOutAnswer=timedOut;$$('.answer').forEach(el=>el.disabled=timedOut);$('#answer-button').disabled=!timedOut&&selectedAnswer===null;$('#answer-button').innerHTML='Сохранить ещё раз';$('#answer-hint').textContent='Ответ не сохранился. Нажми, чтобы повторить.';toast(error.message);
    if(error.status===409){await sync();await question(mode,session[mode].answered);}
  }
}
async function questionResult(mode) {
  const status=session[mode],score=status?.score||0;
  const blitz=mode==='blitz';
  await scene(`<section class="center-stage"><span class="eyebrow">${blitz?'МГНОВЕНИЕ ИСТИНЫ':'ТЫ ДОШЛА ДО КОНЦА'}</span><h1 class="display">${blitz?'Это было <em class="copper">быстро.</em>':'Ты знаешь меня<br>вот <em class="copper">настолько.</em>'}</h1><div id="score-stage" class="score-stage"><div id="score-slip" class="score-slip"><span class="score-label">ТВОЙ РЕЗУЛЬТАТ</span><div class="result-score">${score}<small>из 10</small></div></div></div>${blitz?`<div class="result-summary"><span><strong>${score}</strong>правильных</span><span><strong>${10-score}</strong>неправильных</span></div><div id="review-area"></div><div class="result-actions">${button('Посмотреть ответы','blitz-review','secondary')}${button(`Далее ${icon('arrow')}`,'blitz-finish')}</div>`:'<div id="quiz-result-actions" class="result-actions"></div>'}</section>`,`${mode}-result`,blitz?4:2);
  setFooter('Для меня у тебя всегда самый высокий балл');
  await event(`${mode}_result_viewed`,{score});
  if(!blitz){const token=sceneId;if(score===10){await wait(500);if(token!==sceneId)return;showComic('Ты права)',true);later(()=>finishTask('quiz').catch(showError),2200);}else{await wait(1200);if(token!==sceneId)return;stealScore();later(()=>{if(token!==sceneId)return;$('#quiz-result-actions').innerHTML=button(`Далее ${icon('arrow')}`,'quiz-finish');},2600);}}
}
function comicText(text) { return [...text].map((char,i)=>char===' '?' ':`<span class="comic-letter" style="animation-delay:${i*.026}s">${esc(char)}</span>`).join(''); }
function showComic(text,perfect=false) {
  const stage=$('#score-stage');if(!stage)return;
  if(perfect){const slip=$('#score-slip');if(slip)slip.style.visibility='hidden';}
  const bubble=document.createElement('div');bubble.className='comic-bubble';bubble.innerHTML=`<strong>${comicText(text)}</strong>${perfect?'':'<small>10 из 10. И точка ❤️</small>'}`;stage.append(bubble);
}
function stealScore() {
  const stage=$('#score-stage');if(!stage)return;
  const hand=document.createElement('div');hand.className='comic-hand';hand.setAttribute('aria-hidden','true');hand.textContent='🤚';stage.append(hand);$('#score-slip').classList.add('stolen');
  later(()=>{const perfect=document.createElement('div');perfect.className='perfect-score';perfect.innerHTML='<div class="result-score">10<small>из 10</small></div>';stage.append(perfect);showComic('Ты права)');},1300);
}
async function reviewBlitz() {
  const area=$('#review-area');if(!area)return;
  if(area.innerHTML){area.innerHTML='';return;}
  let records=blitzHistory;
  try {const data=await api('/api/results/blitz');records=Array.isArray(data)?data:data.answers||records;}catch{records=session.blitz?.answers||records;}
  const wrong=records.filter(r=>!r.correct);
  if(!records.length){toast('Ответы ещё загружаются. Попробуй снова.');return;}
  const normal=r=>{const q=content.blitzQuestions[r.index];const selected=r.selectedText||q?.options?.find(o=>o.id===String(r.answer))?.text||'Время вышло';const keys=r.correctTexts||q?.options?.filter(o=>(r.correctAnswers||r.correctIndices?.map(String)||[]).includes(o.id)).map(o=>o.text)||[];return {prompt:r.prompt||q?.prompt,selected,keys};};
  area.innerHTML=`<div class="error-review">${wrong.length?wrong.map(r=>{const v=normal(r);return `<article class="review-item"><h3>${r.index+1}. ${esc(v.prompt)}</h3><p class="wrong-text">Твой ответ: ${esc(v.selected)}</p><p class="correct-text">Правильно: ${v.keys.map(esc).join(' / ')}</p></article>`;}).join(''):'<article class="review-item"><h3>Все десять ответов верные ❤️</h3><p>Здесь не к чему придраться.</p></article>'}</div>`;
  await event('blitz_errors_viewed',{incorrect:wrong.length});
}
async function blitzFinish() {
  if(actionBusy)return;
  const score=session.blitz?.score||0;
  if(score===10){await finishTask('blitz');return;}
  actionBusy=true;$$('.result-actions button').forEach(el=>el.disabled=true);
  const stage=$('#score-stage'),foot=document.createElement('div');foot.className='comic-foot';foot.setAttribute('aria-hidden','true');foot.textContent='🦶';stage.append(foot);$('#score-slip').classList.add('kicked');
  await event('blitz_score_kicked',{realScore:score});
  const token=sceneId;
  later(()=>{if(token!==sceneId)return;showComic('Ты не можешь быть меньше 10 из 10');},1000);
  later(async()=>{actionBusy=false;try{await finishTask('blitz');}catch(error){toast(error.message);if($('.result-actions'))$$('.result-actions button').forEach(el=>el.disabled=false);}},3500);
}
async function finishTask(task) { if(actionBusy)return;actionBusy=true;try{await api('/api/complete',{task});await sync();await menu();}finally{actionBusy=false;} }
async function finale() {
  if(!session.finaleUnlocked){toast('Сначала заверши все три главы');return;}
  const ending=await api('/api/finale');
  const text=ending.endingText||ending.text||content.endingText;
  await scene(`<section class="finale-layout"><div><span class="eyebrow"><span class="tiny-star">✧</span> ПОСЛЕДНЯЯ ГЛАВА. НАЧАЛО ЧЕГО-ТО БОЛЬШЕГО.</span><h1>А теперь<br>открой <em class="copper">коробочку.</em></h1><p class="lead">${esc(text)}</p><div class="reading-signature" style="text-align:inherit">Люблю тебя. Всем сердцем.</div><div style="margin-top:26px">${button('Вернуться к нашей истории','menu','secondary')}</div></div><div class="photo-stack"><div class="memory-photo back"><img src="/api/photos/5" alt="Твои глаза" loading="eager"><span>мои любимые глаза</span></div><div class="memory-photo front"><img src="/api/photos/2" alt="Один из наших моментов" style="object-position:66% 45%"><span>хочу запомнить этот момент</span></div><span class="floating-spark">✧</span></div></section>`,'finale',2);
  setFooter('Продолжение этой истории уже за пределами экрана');
  await event('finale_open');
  if(!reducedMotion)for(let i=0;i<20;i++)later(()=>{const petal=document.createElement('span');petal.className='petal';petal.setAttribute('aria-hidden','true');petal.textContent=i%4===0?'♡':'✧';petal.style.left=`${Math.random()*100}%`;petal.style.animationDuration=`${5+Math.random()*3}s`;document.body.append(petal);setTimeout(()=>petal.remove(),8500);},i*140);
}
function formatTime(value,full=false) { if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('ru-RU',full?{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}:{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
function humanEvent(type){return ({visit:'Вход на сайт',pin_success:'Верный код',pin_failed:'Неверный код',heart_start:'Начала ловить сердца',heart_hit:'Нажатие на сердце',heart_result:'Результат игры',menu_open:'Открыла меню',letter_page:'Открыла страницу письма',letter_page_leave:'Время на странице письма',letter_skip_prompt:'Предложено пропустить письмо',letter_skip_declined:'Отказалась пропускать',letter_skipped:'Пропустила письмо',letter_completed:'Завершила письмо',quiz_answer:'Ответ викторины',blitz_answer:'Ответ блица',answer_selected:'Выбрала вариант',question_open:'Открыла вопрос',quiz_completed:'Завершила викторину',blitz_completed:'Завершила блиц',blitz_errors_viewed:'Посмотрела ошибки',finale_open:'Открыла концовку',visibility:'Видимость вкладки',heartbeat:'Открытая вкладка'})[type]||type;}
async function admin() {
  if(!session.admin)return;
  const [sessionsData,telegram]=await Promise.all([api('/api/admin/sessions'),api('/api/admin/telegram')]);
  adminSessions=Array.isArray(sessionsData)?sessionsData:sessionsData.sessions||[];telegramStatus=telegram;
  const finished=adminSessions.filter(s=>s.finaleUnlocked||s.completed?.length===3).length;
  const skipped=adminSessions.filter(s=>s.letter?.skipped).length;
  const online=adminSessions.filter(s=>Date.now()-new Date(s.lastSeenUtc||s.lastSeenAt||0).getTime()<90000).length;
  const rows=adminSessions.map(s=>`<tr><td><strong>${formatTime(s.createdUtc||s.createdAt,true)}</strong><br><span class="chapter-label">${esc((s.id||'').slice(0,8))}</span></td><td>${esc(s.metadata?.device||s.device?.device||s.device?.platform||s.platform||'Устройство')}<br><span class="chapter-label">${esc(s.metadata?.browser||s.device?.browser||s.browser||'')}</span></td><td><span class="badge ${s.letter?.skipped?'copper':!s.letter?.completed?'muted':''}">${s.letter?.skipped?'Пропущено':s.letter?.completed?'5 страниц · завершено':`${s.letter?.pagesSeen?.length||0} / 5 страниц`}</span></td><td>${s.quizAnswered?`${s.quizScore} / ${s.quizAnswered}`:'—'}</td><td>${s.blitzAnswered?`${s.blitzScore} / ${s.blitzAnswered}`:'—'}</td><td><span class="badge ${s.completed?.length===3?'':'muted'}">${s.completed?.length||0} / 3</span></td><td><button class="text-button" data-session="${esc(s.id)}">Подробнее ${icon('arrow')}</button></td></tr>`).join('');
  await scene(`<section class="admin-wrap"><div class="admin-heading"><div><span class="eyebrow">ЗА КУЛИСАМИ НАШЕЙ ИСТОРИИ</span><h1>Панель автора</h1><p>Настоящие результаты, ответы и путь каждого посетителя.</p></div><div class="admin-toolbar">${button('Обновить','admin-refresh','secondary')}${button('Выйти','logout','secondary')}</div></div><div class="admin-stats"><div class="admin-stat"><strong>${adminSessions.length}</strong><span>посещений</span></div><div class="admin-stat"><strong>${online}</strong><span>вкладок недавно активно</span></div><div class="admin-stat"><strong>${finished}</strong><span>завершили три главы</span></div><div class="admin-stat"><strong>${skipped}</strong><span>пропустили письмо</span></div></div><div class="telegram-panel"><div><h2>Уведомления в Telegram</h2><p id="telegram-note">${esc(telegram.statusMessage||telegram.message||(telegram.connected?'Подключено. Новые посещения приходят в Telegram.':'Открой чат с ботом и отправь /start, затем нажми «Подключить».'))}</p><label class="telegram-id-label" for="telegram-chat-id">Числовой Chat ID, если известен<input id="telegram-chat-id" type="text" inputmode="numeric" value="${esc(telegram.chatId||'')}" placeholder="Например, 123456789" autocomplete="off"></label></div><div class="telegram-actions">${button('Подключить','telegram-connect','secondary')}${button('Проверить уведомление','telegram-test','secondary',!telegram.connected)}</div></div><div class="table-scroll">${rows?`<table class="admin-table"><thead><tr><th>Посещение</th><th>Устройство</th><th>Душнота</th><th>Викторина</th><th>Блитц</th><th>Задания</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="admin-empty">Пока здесь тихо.<br>Первое посещение появится, когда кто-то откроет подарок.</div>'}</div><p class="admin-note">Итоговые оценки в играх украшены анимацией, а здесь сохраняется исходный счёт. «Завершено» означает, что все страницы были открыты и нажата кнопка завершения. Сайт видит устройство и действия, но не определяет настоящее имя человека.</p></section>`,'admin');
  setFooter('Панель видна только по коду автора');
}
async function adminDetail(id) {
  const s=await api(`/api/admin/sessions/${encodeURIComponent(id)}`);
  const meta=s.metadata||s.device||{};
  const answers=(mode)=>{
    const records=s[mode]?.answers||s[`${mode}Answers`]||[];
    return records.length?records.map(r=>`<div class="review-item"><h3>${Number(r.index)+1}. ${esc(r.prompt||r.question||'Вопрос')}</h3><p class="${r.correct?'correct-text':'wrong-text'}">${esc(r.selectedText||r.answerText|| (r.answer===null?'Время вышло':r.answer))} ${r.correct?'✓':'✗'}</p><p>${r.correctTexts?.length?'Верно: '+r.correctTexts.map(esc).join(' / '):''}</p></div>`).join(''):'<p>Пока нет ответов.</p>';
  };
  const events=s.events||[];
  const scoreOf=mode=>(s[`${mode}Answers`]||[]).filter(r=>r.correct).length;
  await scene(`<section class="admin-detail"><button class="text-button" data-action="admin-refresh">${icon('back')}Все посещения</button><h1>Посещение ${esc(id.slice(0,8))}</h1><div class="detail-grid"><div class="detail-box"><h2>Устройство</h2><p>${esc(meta.device||'')} · ${esc(meta.platform||'')} · ${esc(meta.browser||'')}<br>Экран: ${esc(meta.screenWidth||'—')} × ${esc(meta.screenHeight||'—')}<br>Язык: ${esc(meta.language||'—')}<br>Часовой пояс: ${esc(meta.timezone||'—')}<br>IP: ${esc(s.ipAddress||s.ip||'—')}<br>Вход: ${formatTime(s.createdUtc||s.createdAt,true)}<br>Последнее действие: ${formatTime(s.lastSeenUtc||s.lastSeenAt,true)}</p></div><div class="detail-box"><h2>Путь по истории</h2><p>Сердца: ${esc(s.heartResult?.score??'—')}<br>Письмо: ${s.letter?.skipped?'пропущено':s.letter?.completed?'все 5 страниц открыты, завершено':'ещё не завершено'}<br>Страницы: ${s.letter?.pagesSeen?.map(x=>Number(x)+1).join(', ')||'—'}<br>Завершено заданий: ${s.completed?.length||0} / 3<br>Концовка: ${s.finaleOpenedUtc||events.some(e=>e.type==='finale_open')?'открыта':s.completed?.length===3?'доступна':'закрыта'}</p></div><div class="detail-box"><h2>Викторина · ${scoreOf('quiz')} / 10</h2>${answers('quiz')}</div><div class="detail-box"><h2>Блитц · ${scoreOf('blitz')} / 10</h2>${answers('blitz')}</div></div><div class="detail-box"><h2>Хронология</h2><div class="event-feed">${[...events].reverse().map(e=>`<div class="event-row"><time>${formatTime(e.atUtc||e.timestampUtc||e.createdUtc||e.at)}</time><span><strong>${esc(humanEvent(e.type))}</strong><br>${esc(typeof e.data==='string'?e.data:JSON.stringify(e.data||{}))}</span></div>`).join('')||'<p>Нет событий.</p>'}</div></div></section>`,'admin-detail');
  setFooter('История действий сохраняется на сервере');
}
async function telegramAction(test=false) {
  if(actionBusy)return;actionBusy=true;
  try{const chatId=$('#telegram-chat-id')?.value.trim();if(!test&&chatId&&!/^\d{1,20}$/.test(chatId))throw new Error('В Chat ID нужны только цифры.');const result=await api(`/api/admin/telegram/${test?'test':'connect'}`,test?{}:chatId?{chatId}:{});if(test&&!result.sent)throw new Error(result.telegram?.message||'Уведомление пока не отправлено.');toast(result.message||result.statusMessage||(test?'Уведомление отправлено':'Telegram подключён'));await admin();}
  catch(error){toast(error.message,5000);}
  finally{actionBusy=false;}
}
async function logout() { await api('/api/logout',{});session=await api('/api/visit',deviceMeta());content=null;remember('welcome');await pin(); }
async function showError(error) {
  if(currentView==='pin'){toast(error.message);return;}
  const status=Number(error.status);
  const statusNote=Number.isInteger(status)&&status>=100&&status<=599?`<p class="error-status">Код ответа: HTTP ${status}</p>`:'';
  await scene(`<section class="notice-stage"><div class="emblem">${icon('heart')}</div><h1>Маленькая пауза.</h1><p>${esc(error.message||'Не удалось связаться с сайтом. Проверь подключение и попробуй ещё раз.')}</p>${statusNote}${button('Попробовать снова','reload','secondary')}</section>`,'error');
}
const actions={
  pin,menu,letter:()=>letter(),quiz:()=>quizIntro('quiz'),blitz:()=>quizIntro('blitz'),finale,
  'heart-start':heartGame,'heart-save':async()=>{await api('/api/heart-result',heart);await sync();await heartResult(heart);},interlude,
  'letter-back':()=>letter(letterPage-1),'letter-next':letterNext,'letter-skip':skipLetter,'letter-no':async()=>{$('#modal').close();nextTaps=[];toast('Спасибо',1000);await event('letter_skip_declined',{index:letterPage});},
  'quiz-start':()=>startQuestions('quiz'),'blitz-start':()=>startQuestions('blitz'),answer:()=>submitAnswer(retryTimedOutAnswer),
  'question-menu':async()=>{if(questionBusy)return;await event('question_pause',{mode:questionMode,index:questionIndex});await menu();},
  'quiz-finish':()=>finishTask('quiz'),'blitz-finish':blitzFinish,'blitz-review':reviewBlitz,
  'admin-refresh':admin,'telegram-connect':()=>telegramAction(false),'telegram-test':()=>telegramAction(true),logout,reload:()=>location.reload()
};
document.addEventListener('click',async e=>{
  if(navBusy && e.target.closest('#app'))return;
  const answer=e.target.closest('[data-answer]');if(answer&&!answer.disabled){chooseAnswer(answer.dataset.answer);return;}
  const row=e.target.closest('[data-session]');if(row){try{await adminDetail(row.dataset.session);}catch(error){toast(error.message);}return;}
  const target=e.target.closest('[data-action]');if(!target||target.disabled)return;
  captureMotionOrigin(target);
  const action=actions[target.dataset.action];if(action)try{await action();}catch(error){toast(error.message,4000);}
});
$('#modal').addEventListener('cancel',()=>{nextTaps=[];event('letter_skip_declined',{index:letterPage,via:'escape'});});
document.addEventListener('visibilitychange',()=>{event('visibility',{visible:!document.hidden});if(currentView==='letter'&&document.hidden)leaveLetter();else if(currentView==='letter'&&!document.hidden)letterOpenedAt=performance.now();});
window.addEventListener('pagehide',()=>{if(currentView==='letter'&&letterOpenedAt){const payload=JSON.stringify({type:'letter_page_leave',data:{index:letterPage,durationMs:Math.round(performance.now()-letterOpenedAt)}});navigator.sendBeacon('/api/events',new Blob([payload],{type:'application/json'}));}});
setInterval(()=>{if(session.hasVisited&&!document.hidden)event('heartbeat',{view:currentView});},30000);
async function boot() {
  try {
    session=await api('/api/visit',deviceMeta());
    if(new URLSearchParams(location.search).has('login')){await pin();return;}
    if(!session.unlocked){await welcome();return;}
    content=await api('/api/content');
    if(session.admin){await admin();return;}
    if(!session.heartResult){await heartIntro();return;}
    const view=remembered();
    if(view==='letter'&&!session.letter?.skipped){await letter();return;}
    if((view==='quiz'||view==='quiz-result')&&!completed('quiz')){session.quiz?.finished?await questionResult('quiz'):await question('quiz',session.quiz?.answered||0);return;}
    if((view==='blitz'||view==='blitz-result')&&!completed('blitz')){session.blitz?.finished?await questionResult('blitz'):await question('blitz',session.blitz?.answered||0);return;}
    if(view==='finale'&&session.finaleUnlocked){await finale();return;}
    await menu();
  } catch(error) { await showError(error); }
}
boot();
