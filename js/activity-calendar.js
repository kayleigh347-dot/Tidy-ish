/* Mountable UI. Owns personal-day state only; board input is always read-only. */
(function(root){'use strict';
  const C=root.TidyActivityData;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=(date,opts)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...opts}).format(new Date(date+'T12:00:00Z'));
  let instances=0;
  class ActivityCalendar {
    constructor(element,options={}){
      if(!element||!C)throw Error('Calendar needs a mount element and calendar-data.js.');
      this.el=element;this.id='activity-'+(++instances);this.opts=options;
      this.board=options.board||{features:{wins:[]}};this.today=options.today||C.today();this.selected=options.selected||this.today;
      if(!C.validDay(this.selected))throw Error('Invalid selected date');
      this.month=this.selected.slice(0,7);this.annotations=structuredClone(options.annotations||{});this.earned=[...(options.earned||[])];this.message='';this.editing=Boolean(options.autoEditBlank);
      this.click=e=>this.handleClick(e);this.submit=e=>this.handleSubmit(e);this.key=e=>this.handleKey(e);this.change=e=>this.handleChange(e);
      this.el.addEventListener('click',this.click);this.el.addEventListener('submit',this.submit);this.el.addEventListener('keydown',this.key);this.el.addEventListener('change',this.change);
      this.refresh();this.emit();
    }
    refresh(){this.data=C.analyze(this.board,{today:this.today,annotations:this.annotations,earned:this.earned,holidays:this.opts.holidays});this.earned=C.earnedMonths(this.data,this.earned);this.data.earned=this.earned;this.momentum=C.streak(this.data);this.render();}
    update({board=this.board,today=this.today}={}){this.board=board;this.today=today;this.refresh();this.emit();}
    emit(){if(this.opts.onPersonalStateChange)this.opts.onPersonalStateChange({annotations:structuredClone(this.annotations),earned:[...this.earned]});}
    roomName(id){return this.data.roomNames[id]||C.roomName(id);}
    portrait(day,large=false){
      if(!day.count)return '';
      const name=this.roomName(day.winner),art=C.artForRoom(day.winner),file=day.winner==='laundry'?'laundry.svg':art||'neutral.svg';
      const base=this.opts.assetBase||'assets/';
      return `<span class="tac-portrait tac-ring-${C.ringFor(day.count,this.opts.thresholds)}${large?' tac-large':''}"><img src="${esc(base+file)}" width="112" height="112" alt="${esc(name+(art?' sprite':day.winner==='laundry'?' washing machine':' neutral portrait'))}" loading="${large?'eager':'lazy'}" decoding="async"></span>`;
    }
    render(){
      const thresholds=this.opts.thresholds||C.RINGS;
      const m=C.monthInfo(this.data,this.month),streak=this.momentum,day=C.dayInfo(this.data,this.selected),future=this.selected>this.today;
      const monthName=label(this.month+'-01',{month:'long',year:'numeric'}),dates=C.monthDates(this.month),offset=C.monthOffset(this.month);
      const cells=dates.map(date=>{
        const d=C.dayInfo(this.data,date),isFuture=date>this.today;
        const described=[label(date,{weekday:'long',day:'numeric',month:'long',year:'numeric'}),d.occasion?.description,d.count?`${d.count} completed tasks, ${this.roomName(d.winner)}`:isFuture?'Future day':'No tasks recorded',date===this.today?'Today':''].filter(Boolean).join('. ');
        return `<button type="button" class="tac-day${d.marked&&!isFuture?' tac-marked':''}${date===this.today?' tac-today':''}${date===this.selected?' tac-selected':''}${isFuture?' tac-future':''}" data-date="${date}" aria-label="${esc(described)}" aria-pressed="${date===this.selected}" tabindex="${date===this.selected?'0':'-1'}"><span class="tac-number">${Number(date.slice(-2))}</span><span class="tac-day-icon">${d.occasion?`<span class="tac-occasion" aria-hidden="true">${esc(d.occasion.symbol)}</span>`:this.portrait(d)}</span>${d.count?`<span class="tac-count" aria-hidden="true">${d.count}</span>`:''}</button>`;
      }).join('');
      this.el.innerHTML=`<section class="tac" aria-label="Task activity calendar">
        <div class="tac-heading"><div><p class="tac-eyebrow">TASK DATA</p><h1>Your little diary</h1></div><span class="tac-sprig" aria-hidden="true">❧</span></div>
        <p class="tac-intro">Small wins, slow days, and life in between.</p>
        <div class="tac-month-nav"><button type="button" data-nav="-1" aria-label="Previous month">‹</button><h2 id="${this.id}-month">${esc(monthName)}${m.star?'<span class="tac-star" role="img" aria-label="Monthly star earned">✦</span>':''}</h2><button type="button" data-nav="1" aria-label="Next month">›</button></div>
        <div class="tac-summary"><span><strong>${m.covered}<span class="tac-denominator"> / ${m.total}</span></strong> days marked</span><span><strong>${streak.count}</strong> day momentum<br><small>${streak.count?(streak.current?'Current streak':'Most recent streak'):'A fresh place to begin'}</small></span></div>
        <div class="tac-progress" role="progressbar" aria-label="Dates marked this month" aria-valuemin="0" aria-valuemax="${m.total}" aria-valuenow="${m.covered}"><span style="width:${m.covered/m.total*100}%"></span></div>
        ${m.star?`<p class="tac-star-note">✦ ${m.retained?'Your earned star stays. Coverage reflects the latest records.':'A whole month of showing up, in your own way.'}</p>`:''}
        <div class="tac-grid" role="group" aria-labelledby="${this.id}-month"><div class="tac-weekdays" aria-hidden="true">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span>${d}</span>`).join('')}</div>${'<span class="tac-blank" aria-hidden="true"></span>'.repeat(offset)}${cells}</div>
        <div class="tac-legend"><span><i class="tac-key normal"></i>1–${thresholds.decorated-1} tasks</span><span><i class="tac-key decorated"></i>${thresholds.decorated}–${thresholds.gold-1}</span><span><i class="tac-key gold"></i>${thresholds.gold}+ ✧</span><button type="button" data-today>Today</button></div>
        <section class="tac-details" aria-label="Selected day details"><div class="tac-detail-title"><div><p class="tac-eyebrow">${this.selected===this.today?'TODAY':'YOUR DAY'}</p><h3>${esc(label(this.selected,{weekday:'long',day:'numeric',month:'long'}))}</h3></div>${this.portrait(day,true)}</div>
          ${day.occasion?`<p class="tac-occasion-detail"><span aria-hidden="true">${esc(day.occasion.symbol)}</span><span>${esc(day.occasion.description)}<small>${this.data.annotations[this.selected]?'Personal day · zero cleaning points':day.occasion.type==='christmas'?'Automatic Christmas symbol · zero cleaning points':'Configured occasion · zero cleaning points'}</small></span></p>`:''}
          <p class="tac-day-total"><strong>${day.count}</strong> ${day.count===1?'task':'tasks'} completed <span>· ${day.points} recorded ${day.points===1?'point':'points'}</span></p>
          ${day.count?`<ul class="tac-rooms">${Object.entries(day.rooms).sort((a,b)=>b[1]-a[1]).map(([room,count])=>`<li><span>${esc(this.roomName(room))}</span><strong>${count}</strong></li>`).join('')}</ul><p class="tac-fine">${day.laundry} laundry completions included.</p><details class="tac-records"><summary>Completed tasks (${day.count})</summary><ul>${day.wins.map(w=>`<li>${esc(w.title)}<small>${esc(this.roomName(w.room))} · ${w.points} recorded ${w.points===1?'point':'points'}</small></li>`).join('')}</ul></details>`:`<p class="tac-empty">${future?'This day is still ahead.':'There’s room for a rest day, an adventure, or just life.'}</p>`}
          ${!future&&(day.count===0&&(!day.occasion||this.data.annotations[this.selected])||!!this.data.annotations[this.selected])?this.editor():''}
        </section>
        <p class="tac-footnote">Rest counts towards momentum. Only recorded tasks earn points.</p>
        ${this.data.undated||this.data.missingIds||this.data.future?`<details class="tac-diagnostics"><summary>Records kept off the calendar</summary><p>${this.data.undated} undated / invalid; ${this.data.missingIds} without IDs; ${this.data.future} future records. These records are not changed. Keep them in Task Data history for review.</p></details>`:''}
        <p class="tac-status" role="status" aria-live="polite">${esc(this.message)}</p>
      </section>`;
    }
    editor(){const manual=this.data.annotations[this.selected];return `<details class="tac-editor"${this.editing?' open':''}><summary>${manual?'Edit personal day':'Add a personal day'}</summary><form><label for="${this.id}-type">Day symbol</label><select id="${this.id}-type" name="type">${Object.entries(C.OCCASIONS).map(([type,v])=>`<option value="${type}"${(manual?.type||'rest')===type?' selected':''}>${esc(v.symbol+' '+v.description)}</option>`).join('')}</select><label class="tac-custom"${manual?.type==='custom'?'':' hidden'}>Custom symbol<input name="symbol" maxlength="24" value="${esc(manual?.type==='custom'?manual.symbol:'✦')}" aria-label="Custom symbol"></label><label for="${this.id}-description">Short description <small>(optional)</small></label><input id="${this.id}-description" name="description" maxlength="80" placeholder="A little note for this day" value="${esc(manual?.description||'')}"><div class="tac-form-actions"><button type="submit">${manual?'Save changes':'Mark this day'}</button>${manual?'<button class="tac-clear" type="button" data-clear>Clear personal symbol</button>':''}</div><p class="tac-fine">Personal symbols add no task points.${this.selected.endsWith('-12-25')?' Clearing a personal symbol restores the automatic Christmas symbol.':''}</p></form></details>`;}
    select(date,focus=false,autoEdit=true){
      if(!C.validDay(date))return;
      this.selected=date;this.month=date.slice(0,7);this.message='';
      const d=C.dayInfo(this.data,date);
      this.editing=autoEdit&&date<=this.today&&d.count===0&&(!d.occasion||!!this.data.annotations[date]);
      this.render();
      if(focus)(this.editing?this.el.querySelector('.tac-editor select'):this.el.querySelector(`[data-date="${date}"]`))?.focus();
    }
    handleClick(e){
      const b=e.target.closest('button');if(!b||!this.el.contains(b))return;
      if(b.dataset.date)this.select(b.dataset.date,true);
      else if(b.hasAttribute('data-nav')){const month=C.shiftMonth(this.month,Number(b.dataset.nav));const dates=C.monthDates(month);this.select(dates[Math.min(Number(this.selected.slice(-2)),dates.length)-1]);this.el.querySelector(`[data-nav="${b.dataset.nav}"]`)?.focus();}
      else if(b.hasAttribute('data-today'))this.select(this.today,true);
      else if(b.hasAttribute('data-clear')){delete this.annotations[this.selected];this.message='Personal symbol cleared. Task records are unchanged.';this.editing=true;this.refresh();this.emit();this.el.querySelector('.tac-editor summary')?.focus();}
    }
    handleSubmit(e){if(!e.target.matches('.tac-editor form'))return;e.preventDefault();const fd=new FormData(e.target),type=fd.get('type');const day=C.dayInfo(this.data,this.selected);if(this.selected>this.today||day.count>0&&!this.data.annotations[this.selected]||day.occasion&&!this.data.annotations[this.selected])return;const symbol=String(fd.get('symbol')||'').trim();if(type==='custom'&&!symbol){e.target.elements.symbol.setCustomValidity('Choose a symbol.');e.target.elements.symbol.reportValidity();return;}
      this.annotations[this.selected]=C.annotation({type,symbol,description:fd.get('description')});this.message='Personal day saved. No cleaning points added.';this.editing=true;this.refresh();this.emit();this.el.querySelector('.tac-editor summary')?.focus();}
    handleChange(e){if(e.target.name==='type'){const custom=this.el.querySelector('.tac-custom');custom.hidden=e.target.value!=='custom';}if(e.target.name==='symbol')e.target.setCustomValidity('');}
    handleKey(e){const day=e.target.closest('[data-date]');if(!day)return;const moves={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};if(Object.hasOwn(moves,e.key)){e.preventDefault();this.select(C.plus(day.dataset.date,moves[e.key]),true);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();const offset=(new Date(day.dataset.date+'T12:00:00Z').getUTCDay()+6)%7;this.select(C.plus(day.dataset.date,e.key==='Home'?-offset:6-offset),true);}}
    destroy(){this.el.removeEventListener('click',this.click);this.el.removeEventListener('submit',this.submit);this.el.removeEventListener('keydown',this.key);this.el.removeEventListener('change',this.change);this.el.replaceChildren();}
  }
  root.TidyActivityCalendar=ActivityCalendar;
})(globalThis);
