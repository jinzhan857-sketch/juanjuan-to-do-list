// Development-only regression module. No application imports this file.
export const browserOnly=['13','14','15','16','20'];
export async function runChecks(api,{dom=false,failAt=null}={}){
  const {ScoreEngine,UI,S,AIService,DB,Date,todayStr,addDays,parseDate,taskDeadline,foodForScore,todoScore,normalizeTodoLinks,recognizePublishTime,parseNaturalDate,mapTag,$,document,getComputedStyle,AbortController}=api;
  const results=[];
  const check=(id,ok,detail)=>{results.push({id,ok:!!ok,detail:String(detail)});if(failAt===id)throw Error('Injected interruption at '+id);};
  const numeric=(id,name,got,want)=>check(id,Math.abs(got-want)<.01,name+': '+got+' expected '+want);

    const mk = o => ({id:'t', title:'x', baseScore:10, createdAt:Date.now(), execDate:todayStr(), timeType:'allday', slot:null, startTime:null, endTime:null, category:'成长学习', isBackfill:false, timeChangeMul:null, ...o});
    const yest = addDays(todayStr(),-1);
    // 提前1天 + 晚上时段 + 完成目标 = 10×(80%+10%)×70% = 6.3
    const t1 = mk({createdAt: parseDate(yest).getTime()+10*3600e3, execDate: todayStr(), timeType:'slot', slot:'evening'});
    numeric('01','提前1天+晚上+完成', ScoreEngine.compute(t1,'done', taskDeadline(t1)).score, 6.3);
    // 半夜时段 +0%：10×80%×70% = 5.6
    const t2 = mk({createdAt: parseDate(yest).getTime()+10*3600e3, timeType:'slot', slot:'midnight'});
    numeric('02','提前1天+半夜+完成', ScoreEngine.compute(t2,'done',taskDeadline(t2)).score, 5.6);
    // 精确时间 = 时段+5%：10×(80%+15%)×70% = 6.65 → 6.7
    const t3 = mk({createdAt: parseDate(yest).getTime()+10*3600e3, timeType:'exact', startTime:'14:00', endTime:'15:00'});
    numeric('03','提前1天+精确+完成', ScoreEngine.compute(t3,'done',taskDeadline(t3)).score, 6.7);
    // 超24h确认+正在完成中：10×80%×50%×50% = 2
    const t4 = mk({createdAt: parseDate(addDays(todayStr(),-3)).getTime()+10*3600e3, execDate: addDays(todayStr(),-2)});
    numeric('04','超时24h+进行中', ScoreEngine.compute(t4,'doing', taskDeadline(t4)+30*3600e3).score, 2.0);
    // 补录昨日金钱：10×(5%+10%)×70% = 1.05 → 1.1
    const t5 = mk({isBackfill:true, execDate:yest, category:'金钱复盘'});
    numeric('05','补录昨日金钱', ScoreEngine.compute(t5,'done', taskDeadline(t5)).score, 1.1);
    // 改内容升分 (10-2)*0.8+2 = 8.4
    numeric('06','改内容升分', ScoreEngine.mergeBaseScore(2,10), 8.4);
    // 当日18点后创建：10×30%×70% = 2.1
    const d18 = new Date(); d18.setHours(19,0,0,0);
    const t6 = mk({createdAt:d18.getTime()});
    numeric('07','当日晚建+完成', ScoreEngine.compute(t6,'done', taskDeadline(t6)).score, 2.1);
    // 食物拆分：13分 → 三文鱼(10)+面包(3)
    const f = foodForScore(13);
    check('08', f.length===2 && f[0].value===10 && f[1].value===3, '13分食物');
    // 回归：具体时间必须压过模糊时段，且支持中文“点”表达。
    const recognizedTime=recognizePublishTime('早上10点到1点');
    const exactTimeOk=recognizedTime.start==='10:00'&&recognizedTime.end==='13:00';
    check('09', exactTimeOk, '[自测] 具体时间优先: '+exactTimeOk);
    // 回归：状态更新必须刷新当前可见页面，而不是固定刷新首页。
    const refreshOk = typeof UI.refreshActivePage === 'function';
    check('10', refreshOk, `[自测] 当前页面即时刷新: ${refreshOk?'✓':'✗'}`);
    numeric('11','待办完成积分', todoScore(10), 7);
    const linksOk = normalizeTodoLinks('example.com\njavascript:alert(1)\nhttps://openai.com').length===2;
    check('12', linksOk, `[自测] 待办链接过滤: ${linksOk?'✓':'✗'}`);
    if(dom){
    const choice=$('#theme-choices [data-theme="blue"]');
    const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const lum=c=>{const v=c.map(x=>{x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)});return .2126*v[0]+.7152*v[1]+.0722*v[2]};
    const cs=getComputedStyle(choice), l1=lum(rgb(cs.color)), l2=lum(rgb(cs.backgroundColor));
    const previewContrast=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
    check('13', previewContrast>=4.5, `[自测] 白蓝主题卡可读性: ${previewContrast.toFixed(2)} ${previewContrast>=4.5?'✓':'✗'}`);
    const petSummaryPadding=parseFloat(getComputedStyle($('#row-pet-detail')).paddingTop);
    const petSummaryCompact=petSummaryPadding<=10;
    check('14', petSummaryCompact, `[自测] 卷卷信息栏视觉高度: ${petSummaryPadding}px ${petSummaryCompact?'✓':'✗'}`);
    const darkThemeLabel=$('#theme-choices .theme-group-label');
    const darkThemeGap=parseFloat(getComputedStyle(darkThemeLabel).marginTop);
    const darkThemeGapOk=darkThemeGap<=4;
    check('15', darkThemeGapOk, `[自测] 深色外观上方间距: ${darkThemeGap}px ${darkThemeGapOk?'✓':'✗'}`);
    const agentStores=['chats','messages','memories','operations'].every(name=>DB._db.objectStoreNames.contains(name));
    check('16', agentStores, `[自测] Agent 本地数据基础: ${agentStores?'✓':'✗'}`);
    }
    const relativeDateReady=typeof parseNaturalDate==='function';
    const tomorrowOk=relativeDateReady&&parseNaturalDate('明天晚上',todayStr())===addDays(todayStr(),1);
    check('17', tomorrowOk, `[自测] 明天日期换算: ${tomorrowOk?'✓':'✗'}`);
    const courseCategoryOk=mapTag(AIService._localCategory('计算机开发与应用'))==='学业事务';
    check('18', courseCategoryOk, `[自测] 课程名称分类: ${courseCategoryOk?'✓':'✗'}`);
    const draftReady=typeof UI.saveCreateDraft==='function'&&typeof UI.restoreCreateDraft==='function';
    check('19', draftReady, `[自测] 发布草稿恢复: ${draftReady?'✓':'✗'}`);
    if(dom){
    const calendarIndependent=$('#c-calendar-block').parentElement===$('#c-result-panel').parentElement&&$('#c-calendar-block').parentElement!==$('#c-result-panel');
    check('20', calendarIndependent, `[自测] 日程日历独立显示: ${calendarIndependent?'✓':'✗'}`);
    }
    const agentUiReady=['createAgentChat','sendAgentMessage','renderChatList','deleteAgentChat'].every(name=>typeof UI[name]==='function');
    check('21', agentUiReady, `[自测] Agent 聊天记录能力: ${agentUiReady?'✓':'✗'}`);
    const activeController=AIService.activeAgentController, testController=new AbortController();
    AIService.activeAgentController=testController; AIService.cancelAgentRequest();
    const stopRequestOk=testController.signal.aborted&&testController.userCancelled===true;
    AIService.activeAgentController=activeController;
    if(dom){
    UI.setAgentKeyboard(true); const keyboardClassOk=document.body.classList.contains('agent-keyboard-open'); UI.setAgentKeyboard(false);
    const mobileAgentControlReady=['setAgentKeyboard','cancelAgentMessage'].every(name=>typeof UI[name]==='function')&&stopRequestOk&&keyboardClassOk;
    check('22', mobileAgentControlReady, `[自测] 手机输入与中止处理: ${mobileAgentControlReady?'✓':'✗'}`);
    }else check('22',stopRequestOk && ['setAgentKeyboard','cancelAgentMessage'].every(name=>typeof UI[name]==='function'),'取消控制器与手机处理方法');
    const weatherHongKong=AIService.weatherLocation('今天天气怎么样？',{memories:[{content:'我住在香港上环。'}]})?.name==='香港';
    const weatherNeedsLocation=AIService.weatherLocation('今天天气怎么样？',{memories:[]})===null;
    const weatherExplicitLocation=AIService.weatherLocation('我在新加坡，今天天气怎么样。',{})?.name==='新加坡';
    const weatherIntent=AIService.isWeatherRequest('明天会下雨吗？')&&AIService.weatherLabel(63)==='中雨';
    const weatherWorkflowOk=weatherHongKong&&weatherNeedsLocation&&weatherExplicitLocation&&weatherIntent;
    check('23', weatherWorkflowOk, `[自测] 天气地点识别与追问: ${weatherWorkflowOk?'✓':'✗'}`);
    const weatherFollowupContext={history:[{role:'user',content:'今天天气怎么样？'},{role:'assistant',content:'你想查哪个城市或地区的天气？'}],memories:[]};
    const weatherFollowupOk=typeof AIService.isWeatherFollowup==='function'&&AIService.isWeatherFollowup('香港',weatherFollowupContext);
    check('24', weatherFollowupOk, `[自测] 天气城市续答识别: ${weatherFollowupOk?'✓':'✗'}`);
    const exactRejected=!UI.validateAgentAction({kind:'create_schedule',target_id:null,item:{title:'测试课程',exec_date:todayStr(),time_type:'exact',start_time:'10:00',end_time:null}}).ok;
    check('25', exactRejected, `[自测] Agent 缺失具体时间拦截: ${exactRejected?'✓':'✗'}`);
    const missingTargetRejected=!UI.validateAgentAction({kind:'delete_schedule',target_id:'missing',item:{}}).ok;
    check('26', missingTargetRejected, `[自测] Agent 不存在目标拦截: ${missingTargetRejected?'✓':'✗'}`);
    const queryTask={id:'agent_query_test',title:'卷卷查询测试',note:'',execDate:todayStr(),timeType:'allday',slot:null,startTime:null,endTime:null,status:null};
    S.tasks.push(queryTask);
    const queryOk=UI.queryAgentItems({entity:'schedule',date_from:todayStr(),date_to:todayStr(),status:'open',keyword:'卷卷查询测试'}).some(x=>x.id===queryTask.id);
    S.tasks=S.tasks.filter(x=>x.id!==queryTask.id);
    check('27', queryOk, `[自测] Agent 本地查询: ${queryOk?'✓':'✗'}`);
    const agentActionsReady=['validateAgentAction','queryAgentItems','executeAgentAction','undoAgentOperation'].every(name=>typeof UI[name]==='function');
    check('28', agentActionsReady, `[自测] Agent 单条事务操作: ${agentActionsReady?'✓':'✗'}`);
    const allWeek=[1,2,3,4,5,6,7], batchAction={kind:'create_schedule_batch',rule:{date_from:todayStr(),date_to:addDays(todayStr(),6),weekdays:allWeek,title:'批量测试',note:'',time_type:'exact',slot:null,start_time:'10:00',end_time:'13:00',category:'学业事务',base_score:7}};
    const batchExpanded=UI.expandBatchSchedule(batchAction), batchOk=batchExpanded.length===7&&batchExpanded.every(item=>item.start_time==='10:00'&&item.end_time==='13:00');
    check('29', batchOk, `[自测] 批量日程日期展开: ${batchExpanded.length} 条 ${batchOk?'✓':'✗'}`);
    const seriesWeekday=parseDate(todayStr()).getDay()||7, seriesNext=addDays(todayStr(),7), seriesId='agent_series_test';
    const seriesTaskOne={id:'agent_series_one',seriesId,title:'整组课程一',execDate:todayStr(),timeType:'exact',startTime:'10:00',endTime:'11:00'};
    const seriesTaskTwo={id:'agent_series_two',seriesId,title:'整组课程二',execDate:seriesNext,timeType:'exact',startTime:'10:00',endTime:'11:00'};
    S.tasks.push(seriesTaskOne,seriesTaskTwo);
    const seriesDeleteAction={kind:'delete_schedule_batch',rule:{series_id:seriesId,date_from:todayStr(),date_to:seriesNext,weekdays:[seriesWeekday],match_title:'不参与组身份匹配',match_start_time:null,match_end_time:null},item:{}};
    const seriesDeleteOk=UI.resolveBatchUpdateTargets(seriesDeleteAction).length===2&&UI.validateAgentAction(seriesDeleteAction).ok;
    S.tasks=S.tasks.filter(task=>task.id!==seriesTaskOne.id&&task.id!==seriesTaskTwo.id);
    check('30', seriesDeleteOk, `[自测] 整组身份删除定位: ${seriesDeleteOk?'✓':'✗'}`);
    const vagueBatchRejected=!UI.validateAgentAction({kind:'create_schedule_batch',rule:{...batchAction.rule,time_type:'allday',start_time:null,end_time:null}}).ok;
    check('31', vagueBatchRejected, `[自测] 批量日程具体时间保护: ${vagueBatchRejected?'✓':'✗'}`);
    const unsafeEndpointRejected=AIService.validEndpoint('https://api.example.com/v1/chat/completions')&&!AIService.validEndpoint('http://example.com/v1/chat/completions');
    check('32', unsafeEndpointRejected, `[自测] 自定义 API 地址保护: ${unsafeEndpointRejected?'✓':'✗'}`);
    let emptyReplyRetryable=false;
    try{AIService.parseJson('');}catch(error){emptyReplyRetryable=error?.code==='retryable_model_reply';}
    check('33', emptyReplyRetryable, `[自测] 空模型回复可重试: ${emptyReplyRetryable?'✓':'✗'}`);
    const normalizedBatch=AIService.normalizeAgent({type:'batch_proposal',reply:'测试',action:{rule:batchAction.rule}});
    const batchNormalizeOk=normalizedBatch.action?.kind==='create_schedule_batch'&&normalizedBatch.action.rule.weekdays.length===7;
    check('34', batchNormalizeOk, `[自测] 批量模型结果校验: ${batchNormalizeOk?'✓':'✗'}`);
    const savedRole=UI.agentSelectedRole;
    UI.agentSelectedRole='auto';
    const routingOk=UI.resolveAgentRole('建立多个日程，每周五晚上上课')==='auto'&&UI.resolveAgentRole('我想减肥，帮我规划并排进日历')==='auto'&&UI.resolveAgentRole('给我讲个笑话')==='auto'&&['chat','planning','task'].every(hint=>{UI.agentSelectedRole=hint;return UI.resolveAgentRole('不，是16点到17点')===hint});
    UI.agentSelectedRole=savedRole;
    check('35', routingOk, `[自测] 意图提示不按关键词分流: ${routingOk?'✓':'✗'}`);
    const roleTestText='9-11月每个周五晚上19.00-21.30，都设置日程叫：IDAT7224工程技术中的深度学习，KK201教室 教授Dr. C.K. Chan';
    const taskRoleResult=AIService._localAgent(roleTestText,{tasks:[],todos:[]},'task');
    const planningRoleResult=AIService._localAgent(roleTestText,{tasks:[],todos:[]},'planning');
    const roleWorkflowOk=taskRoleResult.type==='batch_proposal'&&taskRoleResult.action?.rule?.title.includes('IDAT7224')&&taskRoleResult.action?.rule?.note.includes('KK201')&&planningRoleResult.type==='recommendation'&&planningRoleResult.recommendations?.[0]?.action?.kind==='create_schedule_batch';
    check('36', roleWorkflowOk, `[自测] 规划交接事务确认卡: ${roleWorkflowOk?'✓':'✗'}`);
    const taskWorkflowFirst=typeof AIService.taskWorkflowResult==='function'&&AIService.taskWorkflowResult(roleTestText,{tasks:[],todos:[]})?.type==='batch_proposal';
    check('37', taskWorkflowFirst, `[自测] 完整事务优先走工作流: ${taskWorkflowFirst?'✓':'✗'}`);
    const planningInside={id:'planning_inside_test',title:'规划范围内日程',execDate:todayStr(),createdAt:0};
    const planningOutside={id:'planning_outside_test',title:'规划范围外日程',execDate:addDays(todayStr(),14),createdAt:0};
    S.tasks.push(planningInside,planningOutside);
    const planningData=UI.planningData('减肥计划');
    const planningScopeOk=planningData.tasks.some(item=>item.id===planningInside.id)&&!planningData.tasks.some(item=>item.id===planningOutside.id);
    S.tasks=S.tasks.filter(task=>task.id!==planningInside.id&&task.id!==planningOutside.id);
    check('38', planningScopeOk, `[自测] 规划只参考近期日程: ${planningScopeOk?'✓':'✗'}`);
    const planningInsights=UI.planningInsights([{title:'规划冲突一',execDate:todayStr(),timeType:'exact',startTime:'10:00',endTime:'12:00'},{title:'规划冲突二',execDate:todayStr(),timeType:'exact',startTime:'11:00',endTime:'13:00'},{title:'规划负荷',execDate:todayStr(),timeType:'exact',startTime:'14:00',endTime:'17:00'},{title:'规划未定时',execDate:todayStr(),timeType:'allday',startTime:null,endTime:null}],[{title:'高价值规划待办',baseScore:8}]);
    const planningFactsOk=planningInsights.conflict_count===1&&planningInsights.busy_days.length===1&&planningInsights.candidate_gaps.length===1&&planningInsights.unscheduled_count===1&&planningInsights.high_value_todos[0]==='高价值规划待办';
    check('39', planningFactsOk, `[自测] 规划事实计算: ${planningFactsOk?'✓':'✗'}`);
    const savedMemoryEnabled=S.pet.memoryEnabled, savedMemories=S.memories; S.pet.memoryEnabled=true; S.memories=[];
    const planningMemoryOk=UI.planningMemoryCandidate('我想减肥，帮我做两周计划。')?.category==='目标和优先事项';
    S.pet.memoryEnabled=savedMemoryEnabled; S.memories=savedMemories;
    check('40', planningMemoryOk, `[自测] 规划记忆需确认: ${planningMemoryOk?'✓':'✗'}`);
    const source={id:'handoff-source',chatId:UI.agentChatId,role:'assistant',type:'recommendation',createdAt:Date.now(),meta:{agentRole:'planning',recommendations:planningRoleResult.recommendations}};
    S.messages.push({id:'handoff-request',chatId:UI.agentChatId,role:'user',content:roleTestText,createdAt:Date.now()-1},source);
    await UI.prepareAgentRecommendation(source.id,0);
    const proposalRoleKept=S.messages.some(m=>m.type==='proposal'&&m.meta?.agentRole==='task'&&m.meta?.status==='pending') && (await DB.all('messages')).some(m=>m.type==='proposal'&&m.meta?.agentRole==='task');
    check('41', proposalRoleKept, `[自测] 事务确认卡身份标签: ${proposalRoleKept?'✓':'✗'}`);
    const conflictTask={id:'agent_conflict_test',title:'已有日程',execDate:todayStr(),timeType:'exact',startTime:'10:00',endTime:'11:00'};
    S.tasks.push(conflictTask);
    const conflictOk=UI.findAgentScheduleConflicts({kind:'create_schedule',item:{title:'冲突测试',exec_date:todayStr(),time_type:'exact',start_time:'10:30',end_time:'11:30'}}).length===1;
    S.tasks=S.tasks.filter(task=>task.id!==conflictTask.id);
    check('42', conflictOk, `[自测] 事务时间冲突提醒: ${conflictOk?'✓':'✗'}`);
  return results;
}

// A successful run must also persist its matching evidence successfully.
export async function saveEvidence(report,send){
  const response=await send('/evidence',{method:'POST',body:JSON.stringify(report)});
  if(!response.ok)throw Error('Evidence save failed: '+response.status);
  return report;
}
