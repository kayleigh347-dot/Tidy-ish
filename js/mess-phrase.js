/* One source for every Tidyish room mess label. A 100% mess meter must not be blank. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.TidyMessPhrase=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function cleanPercent(mess){return Math.round((100-Math.max(0,Math.min(100,Number(mess)||0)))*10)/10;}
  function messPhrase(mess){
    const clean=cleanPercent(mess);
    if(clean>=100)return '✨Spotless✨';
    if(clean>=95)return 'Tidy-no-ish';
    if(clean>=90)return 'Tidy-ish!🥳';
    if(clean>=80)return 'Lived in';
    if(clean>=60)return 'slipping-ish';
    if(clean>=50)return 'whoah Halfway there';
    if(clean>=40)return 'Messy-ish';
    if(clean>=20)return 'chaos close';
    if(clean>=5)return 'Chaos-ish 👻';
    return 'only way is up';
  }
  function isSparkling(mess){return cleanPercent(mess)>=95;}
  function barState(mess,state){if(state==='DISASTER'||state==='SPOTLESS')return state;return cleanPercent(mess)<60?'MESSY':'CLEAN';}
  return {cleanPercent,messPhrase,isSparkling,barState};
});
