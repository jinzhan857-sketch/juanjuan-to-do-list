(async()=>{
 while(!window.keyboardReady)await new Promise(r=>setTimeout(r,30));
 const output=document.querySelector('#keyboard-result'),events=[];
 const snapshot=()=>DB.snapshot(['tasks','todos','chats','messages','memories','operations','kv']);
 const image={id:'keyboard-image',name:'合成附件',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
 const guards={tasks:{id:'keyboard-guard-task',title:'合成资料保护',execDate:'2000-01-01',timeType:'allday',category:'日常生活',baseScore:3,createdAt:1,note:'保留备注',status:null,images:[image],links:['https://example.com/']},todos:{id:'keyboard-guard-todo',title:'合成待办保护',kind:'recent',category:'日常生活',baseScore:3,createdAt:1,done:false,images:[image]},chats:{id:'keyboard-guard-chat',title:'合成旧聊天',createdAt:1},messages:{id:'keyboard-guard-message',chatId:'keyboard-guard-chat',role:'user',content:'合成旧消息',createdAt:1},memories:{id:'keyboard-guard-memory',content:'合成个人资料',createdAt:1},operations:{id:'keyboard-guard-operation',chatId:'keyboard-guard-chat',status:'completed',createdAt:1}};
 for(const [store,value]of Object.entries(guards))await DB.put(store,value);
 await DB.put('kv',{points:37,pet:{name:'合成宠物',level:3},images:[image]},'keyboard-guard-metadata');
 const initial=await snapshot();let sequence=0;
 const probe=document.createElement('div');probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);height:env(keyboard-inset-height,0px)';document.body.append(probe);
 const css=getComputedStyle(probe);const environmentInsets={top:css.paddingTop,bottom:css.paddingBottom,keyboard:css.height};probe.remove();
 const rectangle=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,width:r.width,height:r.height};};
 const viewportProbes={};
 for(const unit of ['dvh','svh','lvh']){const node=document.createElement('div');node.style.cssText='position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:100'+unit;document.body.append(node);viewportProbes[unit]=node;}
 const capture=label=>{
  const v=window.visualViewport,input=document.querySelector('#agent-input'),nav=document.querySelector('#nav');
  const item={sequence:sequence++,t:performance.now(),label,page:document.querySelector('.page.active')?.id,theme:document.documentElement.dataset.activeTheme,focus:document.activeElement?.id,innerWidth,innerHeight,outerWidth,outerHeight,screenWidth:screen.width,screenHeight:screen.height,clientHeight:document.documentElement.clientHeight,scrollY,pageScrollTop:document.querySelector('#page-agent').scrollTop,cssViewportHeights:Object.fromEntries(Object.entries(viewportProbes).map(([unit,node])=>[unit,node.getBoundingClientRect().height])),visual:{width:v.width,height:v.height,top:v.offsetTop,pageTop:v.pageTop,scale:v.scale},keyboardClass:document.body.classList.contains('agent-keyboard-open'),inlineHeight:document.querySelector('#page-agent').style.height,navInlineBottom:nav.style.bottom,touchInput:UI.agentTouchInput,restingGap:UI.agentViewportGap,navVisibility:getComputedStyle(nav).visibility,nav:rectangle(nav),input:rectangle(input),pageRect:rectangle(document.querySelector('#page-agent'))};events.push(item);return item;
 };
 const save=async(label,cases)=>{
  capture(label);const unchanged=JSON.stringify(initial)===JSON.stringify(await snapshot());
  const response=await fetch('/evidence',{method:'POST',body:JSON.stringify({sourceSha256:window.KEYBOARD_SOURCE_HASH,testBuild:window.KEYBOARD_TEST_BUILD,time:new Date().toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,userAgent:navigator.userAgent,viewportPolicy:document.querySelector('meta[name=viewport]').content,capabilities:{secure:isSecureContext,virtualKeyboard:'virtualKeyboard' in navigator,availableHeight:screen.availHeight,availableTop:screen.availTop,screenHeight:screen.height,pixelRatio:devicePixelRatio,environmentInsets},events,cases,protectedStores:Object.keys(initial),protectedCounts:Object.fromEntries(Object.entries(initial).map(([store,rows])=>[store,rows.length])),protectedDatabaseUnchanged:unchanged})});
  if(!response.ok){output.textContent='记录未保存，请打开本轮最新版本地址';return;}
  output.textContent='已自动保存 '+events.length+' 条事件\n保护数据不变：'+unchanged+(cases?'\n桌面通过：'+cases.filter(x=>x.pass).length+'/'+cases.length:'');
 };
 let timer;for(const [target,type] of [[document,'focusin'],[document,'focusout'],[window,'resize'],[window.visualViewport,'resize'],[window.visualViewport,'scroll']])target.addEventListener(type,()=>{capture(type);clearTimeout(timer);timer=setTimeout(()=>save('settled'),600);});
 new MutationObserver(()=>{capture('appearance');clearTimeout(timer);timer=setTimeout(()=>save('settled'),600);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-active-theme']});
 document.querySelector('#keyboard-save').onclick=()=>save('manual');
 document.querySelector('#keyboard-leave').onclick=()=>{UI.switchPage('home');capture('leave-agent');};
 document.querySelector('#keyboard-desktop').onclick=async()=>{
  const cases=[],wait=()=>new Promise(r=>setTimeout(r,350)),input=document.querySelector('#agent-input');
  const check=label=>{const s=capture(label);cases.push({label,pass:s.navVisibility==='visible'&&!s.keyboardClass});};
  UI.switchPage('agent');await wait();const bottom=capture('before-focus').input.bottom;
  input.focus();await wait();check('desktop-focus');cases.push({label:'input-position',pass:Math.abs(capture('focused-position').input.bottom-bottom)<1});
  input.blur();await wait();check('desktop-blur');
  await UI.createAgentChat();await wait();check('desktop-new-chat');
  for(const button of document.querySelectorAll('[data-agent-role]')){button.click();await wait();check('desktop-role');}
  UI.switchPage('home');await wait();check('desktop-leave');UI.switchPage('agent');await wait();check('desktop-return');
  const page=document.querySelector('#page-agent');UI.setAgentKeyboard(true);page.style.height='219px';page.scrollTop=page.scrollHeight-page.clientHeight;await wait();
  const short=capture('short-keyboard-layout');cases.push({label:'short-keyboard-input-visible',pass:short.input.top>=short.pageRect.top&&short.input.bottom<=short.pageRect.bottom});
  UI.setAgentKeyboard(false);cases.push({label:'short-keyboard-scroll-cleared',pass:page.scrollTop===0&&!page.style.height});
  await save('desktop-complete',cases);
 };
 UI.switchPage('agent');await save('ready');
})();
