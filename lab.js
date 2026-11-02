import { randomInt, randomUUID } from 'node:crypto';
export function enrich(d){
 if(d.metaVersion)return d;
 const iphone=/iPhone/.test(d.model),retro=/Ретро/.test(d.model),pc=/ПК|ноутбук/i.test(d.model),console=/консол/i.test(d.model);
 d.family=iphone?'ios':retro?'retro':pc?'pc':console?'console':'android';
 d.catalogId=d.model.toLowerCase().replace(/[^a-z0-9а-я]+/gi,'-');
 d.storage=d.storage||'256 ГБ';d.os=iphone?'Игровая iOS':pc?'Игровая система':console?'Console OS':'Android';d.osVersion=iphone?'18':d.model.includes('Poco X4')?'13':'14';
 d.firmware='Стоковая';d.lockState=d.condition==='Заблокировано'?'locked':'unlocked';
 d.appearance={color:['#aab4bf','#817899','#639a8c','#c9bca8'][randomInt(4)],camera:iphone?'triple':d.model.includes('Samsung')?'vertical':'square'};
 d.defects=Array.from({length:d.condition==='Отличное'?0:2},(_,i)=>({id:randomUUID(),side:i?'back':'front',x:25+randomInt(50),y:25+randomInt(45),kind:i?'Царапина корпуса':'Дефект экрана'}));d.metaVersion=1;return d;
}
export function newDevice(d){enrich(d);d.lockState=randomInt(8)===0?'locked':'unlocked';if(d.lockState==='locked')d.condition='Заблокировано';return d;}
const paths={android:['developer','settings','terminal','firmware','boot','diagnostic'],ios:['diagnostic','firmware','sequence','boot'],console:['service','storage','firmware','signals'],pc:['bios','diagnostic','system','boot'],retro:['cartridge','contacts','storage','service']};
export function stepsFor(d){return paths[d.family]||paths.android;}
export function labAction(s,type,p,entry){
 const d=s.inventory.find(x=>x.id===p.deviceId);if(!d)throw Error('Устройство отсутствует в инвентаре. Обновите список; прогресс сохранён.');enrich(d);
 const t=Date.now();const requireFree=()=>{if(d.status!=='warehouse')throw Error('Снимите устройство с продажи и дождитесь завершения других операций.');};
 if(type==='inspect'){
  requireFree();if(d.inspection?.readyAt>t)return 'Осмотр продолжается';
  if(t-d.acquiredAt>600000)throw Error('Начать осмотр можно в течение 10 минут после покупки');
  if((d.inspection?.attempts||0)>=4)throw Error('Все четыре попытки осмотра использованы');
  d.inspection={...d.inspection,attempts:(d.inspection?.attempts||0)+1,readyAt:t+30000,found:d.inspection?.found||[],checks:d.inspection?.checks||[],revealed:false};return 'Осмотр начался';
 }
 if(type==='inspect_hit'){
  requireFree();const x=d.inspection;if(!x||t>x.readyAt)throw Error('Время осмотра закончилось');
  if(p.defectId){const defect=d.defects.find(v=>v.id===p.defectId);if(!defect)throw Error('Такой дефект не найден');if(!x.found.includes(defect.id))x.found.push(defect.id);}
  if(['screen','buttons'].includes(p.check)&&!x.checks.includes(p.check))x.checks.push(p.check);return 'Проверка сохранена';
 }
 if(type==='inspection_result'){
  const x=d.inspection;if(!x)throw Error('Сначала начните осмотр');x.revealed=true;
  const newly=d.defects.filter(v=>x.found.includes(v.id)&&!v.compensated);if(newly.length){const amount=Math.round(d.cost*.06*newly.length);entry(s,'compensation',amount,d.id,{deviceId:d.id});d.compensation=(d.compensation||0)+amount;newly.forEach(v=>v.compensated=true);}return `Осмотр завершён. Найдено дефектов: ${x.found.length}`;
 }
 if(type==='parts_sell'){
  requireFree();if(d.lockState!=='failed')throw Error('Продажа на запчасти доступна только после окончательного провала');const amount=Math.round(d.market*.25);d.status='sold';entry(s,'device_sale',amount,d.id,{deviceId:d.id,profit:amount-d.cost-d.repair-d.parts});return `Продано на запчасти за ${amount} ₽`;
 }
 if(type==='lab_start'){
  requireFree();if(d.inspection?.readyAt>t&&!d.inspection.revealed)throw Error('Сначала завершите осмотр');if(d.lockState==='failed')throw Error('Окончательная поломка: доступна продажа на запчасти');
  if(d.lab?.status==='active')return 'Операция продолжена';
  if(d.lab?.status==='success'&&d.lockState==='unlocked'&&d.modified)throw Error('Модификация уже выполнена');
  const purpose=d.lockState==='locked'?'unlock':'modify';
  d.lab={id:randomUUID(),deviceId:d.id,purpose,operation:p.operation==='root'?'root':'firmware',status:'active',step:0,errors:0,taps:0,lastTap:0,toggles:[],sequence:[2,1,3,2],cursor:0,checks:[],logs:[`Подключён экземпляр ${d.id}`,`${d.model} · ${d.os} ${d.osVersion}`],finalFailure:randomInt(8)===0};return 'Устройство подключено';
 }
 if(type==='lab_step'){
  requireFree();const x=d.lab;if(!x||x.status!=='active'||x.deviceId!==d.id||x.id!==p.sessionId)throw Error('Сессия операции не найдена');const stage=stepsFor(d)[x.step];
  const error=()=>{x.errors++;x.taps=0;x.cursor=0;x.toggles=[];x.checks=[];x.logs.push('Ошибка. Повторите текущий этап.');return 'Ошибка этапа';};
  const advance=()=>{x.logs.push(`Этап ${x.step+1} завершён`);x.step++;x.checks=[];x.cursor=0;if(x.step===stepsFor(d).length){x.status=x.finalFailure?'failed':'success';if(x.finalFailure){d.lockState='failed';d.condition='Неудачная разблокировка';x.logs.push('Окончательный провал. Доступна продажа на запчасти за 25%.');}else{d.lockState='unlocked';if(d.condition==='Заблокировано')d.condition='Хорошее';if(x.purpose==='modify'&&!d.modified){d.market=Math.round(d.market*1.06);d.modified=true;d.firmware=x.operation==='root'?'Рут-права':'Кастомная';}x.logs.push('Устройство успешно восстановлено');}}return 'Этап завершён';};
  if(stage==='developer'){x.taps=t-x.lastTap>1000?1:x.taps+1;x.lastTap=t;if(x.taps>=7)return advance();return `Нажатий: ${x.taps}/7`;}
  if(stage==='settings'){if(p.choice==='done'){if(x.toggles.includes('oem')&&x.toggles.includes('usb'))return advance();return error();}if(!['oem','usb'].includes(p.choice))return error();if(!x.toggles.includes(p.choice))x.toggles.push(p.choice);return 'Переключатель включён';}
  if(stage==='firmware'){if(p.choice!==d.catalogId)return error();x.installEndsAt||=t+5000;if(p.choice===d.catalogId&&t>=x.installEndsAt)return advance();return 'Установка запущена';}
  if(['sequence','signals'].includes(stage)){if(Number(p.choice)!==x.sequence[x.cursor])return error();x.cursor++;return x.cursor===x.sequence.length?advance():'Верно';}
  if(stage==='diagnostic'){if(!['Экран','Память','Аккумулятор','Система','Подключение'].includes(p.choice))return error();if(!x.checks.includes(p.choice))x.checks.push(p.choice);return x.checks.length===5?advance():'Компонент проверен';}
  const answers={terminal:'sim connect',boot:'Запустить систему',service:'Сервисное меню',storage:'Проверить накопитель',bios:'Проверить загрузку',system:'Восстановить систему',cartridge:'Проверить картридж',contacts:'Очистить контакты'};
  if(p.choice!==answers[stage])return error();return advance();
 }
 throw Error('Неизвестная операция');
}
export function publicState(s){const copy=structuredClone(s);for(const d of copy.inventory){if(d.lab)delete d.lab.finalFailure;}return copy;}
