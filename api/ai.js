function workflowContract(){return require('../src/assistant/workflow.js');}
const crypto = require('node:crypto');

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEVICE_LIMIT = 50;
const GLOBAL_LIMIT = 100;

const SYSTEM_PROMPT = `你是一个严格的任务价值评分助手。依据「任务本身的结构与属性价值」评定基础价值分，范围 0 到 10 分，保留 1 位小数；完全不考虑用户最终完成质量好坏。

【三大评判维度】
1．社会契约强度：任务绑定他人、规则的约束程度，违约带来的代价高低。
2．认知摩擦系数：完成任务需要大脑切换思维模式的频次、动脑复杂程度。
3．资产沉淀可能性：做完能否留存可长期重复使用的资料、能力、内容、成品。

【标准锚点分值对照表】
0 分 打游戏。
1 分 吃饭。
2 分 通勤、排队办事。
3 分 健身、跑步。
3．5 分 聚餐。
4．5 分 约会、陪伴家人。
5．5 分 无汇报纯开会。
6 分 写日记、个人复盘。
7 分 听讲座。
8 分 运营小红书、撰写博客。
9 分 开展分享会。
10 分 独立完成 Vibe Coding 开发项目。

task 和 note 由你负责。没有地点、材料、链接、限制条件、提醒内容等附加信息时，task 尽量保留用户原话，note 必须是空字符串。有附加信息时，task 保留核心事务，note 保留附加信息，绝不把整段原话重复复制进 note。任务描述模糊宽泛时，base_score 必须为 null，vague 必须为 true，并请用户补充具体对象、动作与产出。advice 必须针对当前事务，优先给出材料准备、预约咨询、执行顺序、遗漏步骤、地点交通风险、降低执行难度或成果沉淀建议。禁止「提前做好准备」「合理安排时间」「把任务写具体」等套话。办银行卡必须建议提前电话咨询所需材料、营业时间、排队情况或预约方式。确实无需建议时写「这项事务已经很明确，可以直接执行。」严格只返回 JSON，不输出任何多余文字。字段为 task，note，base_score，vague，reason，advice，category，detected_date，detected_time。detected_date 必须结合用户消息里的今天日期返回 YYYY-MM-DD。课程名、课程编号、教室、上课、作业和学校事务优先归学业事务。

时间识别规则：只要原文出现具体时间或时间范围，detected_time 必须优先返回标准 24 小时格式 HH:MM 或 HH:MM-HH:MM，不能只返回“早上”“下午”等模糊时段。例如“早上10点到1点”返回“10:00-13:00”。

分类规则：category 只能从「日常生活、学业事务、职场工作、技能学习、金钱复盘、休闲娱乐、社交约定、旅行出行」中选择。学校课程、校招、学生证和校内流程优先归学业事务；家人一起看展、去博物馆或短途游玩优先归旅行出行；社交约定仅用于社交、人脉和约人见面；日常生活仅用于家务、采购和个人琐事。`;

// Public quota uses a trusted Beijing calendar day, captured once per request.
function quotaDay() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function json(res, code, body) {
  res.status(code).json(body);
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少 ${name}`);
  return value;
}

function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function requestJSON(url, options={}, timeoutMs=20000){
  const {transport = fetch, ...requestOptions} = options;
  const controller=new AbortController(), external=options.signal;
  let timer, stop;
  try{
    const aborted=new Promise((_,reject)=>{
      stop=()=>{controller.abort();reject(external?.reason||new DOMException('请求已取消','AbortError'));};
      if(external?.aborted){stop();return;}
      external?.addEventListener('abort',stop,{once:true});
      timer=setTimeout(()=>{controller.abort();const error=new Error('请求超时，请稍后重试');error.code='request_timeout';reject(error);},timeoutMs);
    });
    if(external?.aborted)return await aborted;
    return await Promise.race([aborted,(async()=>{const response=await transport(url,{...requestOptions,signal:controller.signal});if(!response.ok){const error=new Error(response.status===429?'公共次数已用完':'服务请求失败');error.status=response.status;throw error;}const data=await response.json();return {response,data};})()]);
  }finally{clearTimeout(timer);external?.removeEventListener('abort',stop);controller.abort();}
}

async function redis(command) {
  const {response,data:payload} = await requestJSON(required('KV_REST_API_URL'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${required('KV_REST_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  },3000);
  if (!response.ok) throw new Error('统计服务暂不可用');
  return payload.result;
}

async function increaseDaily(key) {
  const count = Number(await redis(['INCR', key]));
  if (count === 1) await redis(['EXPIRE', key, '86400']);
  return count;
}

async function increaseMetric(name, date) {
  await increaseDaily(`metric:${date}:${name}`);
}

function parseBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body || {};
}

function parseModelResult(content) {
  const text = String(content || '').replace(/```json|```/g, '').trim();
  const data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const vague = Boolean(data.vague) || data.base_score === null || data.base_score === undefined;
  const score = vague ? null : Number(data.base_score);
  if (!vague && (!Number.isFinite(score) || score < 0 || score > 10)) {
    throw new Error('模型返回的分数不合法');
  }
  return {
    task: String(data.task || '').slice(0, 300),
    note: String(data.note || '').slice(0, 1500),
    base_score: vague ? null : Math.round(score * 10) / 10,
    vague,
    reason: String(data.reason || '').slice(0, 60),
    advice: String(data.advice || '').slice(0, 120),
    category: String(data.category || '生活事务'),
    detected_date: validDate(data.detected_date),
    detected_time: data.detected_time || null,
    model_raw: text,
    source: 'ai',
  };
}

function parseJsonContent(content) {
  const text = String(content || '').replace(/```json|```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('模型没有返回有效结果');
  return JSON.parse(text.slice(start, end + 1));
}

function shortText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function validDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : null;
}

function sanitizeAgentItem(input = {}) {
  const categories = ['日常生活', '学业事务', '职场工作', '技能学习', '金钱复盘', '休闲娱乐', '社交约定', '旅行出行'];
  const timeTypes = ['allday', 'slot', 'exact'];
  const slots = ['midnight', 'dawn', 'early', 'morning', 'noon', 'afternoon', 'dusk', 'evening'];
  const score = Number(input.base_score);
  const item = {};
  if (input.title !== undefined) item.title = shortText(input.title, 300);
  if (input.append_note !== undefined) item.append_note = input.append_note;
  if (input.note !== undefined) item.note = shortText(input.note, 500);
  if (input.exec_date !== undefined) item.exec_date = validDate(input.exec_date);
  if (input.time_type !== undefined) item.time_type = timeTypes.includes(input.time_type) ? input.time_type : 'allday';
  if (input.slot !== undefined) item.slot = slots.includes(input.slot) ? input.slot : null;
  if (input.start_time !== undefined) item.start_time = validTime(input.start_time);
  if (input.end_time !== undefined) item.end_time = validTime(input.end_time);
  if (input.category !== undefined) item.category = categories.includes(input.category) ? input.category : '日常生活';
  if (input.base_score !== undefined) item.base_score = Number.isFinite(score) ? Math.max(0, Math.min(10, Math.round(score * 10) / 10)) : 3;
  return item;
}

function sanitizeBatchRule(input = {}) {
  const item = sanitizeAgentItem(input);
  return {
    date_from: validDate(input.date_from),
    date_to: validDate(input.date_to),
    weekdays: [...new Set((Array.isArray(input.weekdays) ? input.weekdays : []).map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b),
    title: item.title || '',
    note: item.note || '',
    time_type: item.time_type || 'allday',
    slot: item.slot || null,
    start_time: item.start_time || null,
    end_time: item.end_time || null,
    category: item.category || '日常生活',
    base_score: item.base_score ?? 3,
  };
}

// Group IDs are opaque: never coerce, trim or truncate them into another ID.
function validSeriesId(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 80 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function sanitizeBatchUpdateRule(input = {}) {
  const categories = ['日常生活', '学业事务', '职场工作', '技能学习', '金钱复盘', '休闲娱乐', '社交约定', '旅行出行'];
  return {
    date_from: validDate(input.date_from),
    date_to: validDate(input.date_to),
    weekdays: [...new Set((Array.isArray(input.weekdays) ? input.weekdays : []).map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b),
    match_title: shortText(input.match_title || input.title, 120),
    match_start_time: validTime(input.match_start_time),
    match_end_time: validTime(input.match_end_time),
    series_id: input.series_id ?? null,
    category: categories.includes(input.category) ? input.category : null,
  };
}

function parseAgentResult(content, context, input) {
  const data = parseJsonContent(content);
  if(input!==undefined&&['workflow','proposal','batch_proposal'].includes(data.type)){const guarded=workflowContract().guard(data,context,input);if(data.type==='workflow'||guarded.type!==data.type)return guarded;}
  if(data.type==='workflow')return workflowContract().parse(data);
  const type = ['chat', 'clarify', 'query', 'proposal', 'batch_proposal', 'recommendation'].includes(data.type) ? data.type : 'clarify';
  const fields = type === 'batch_proposal' && !['update_schedule_batch', 'delete_schedule_batch'].includes(data.action?.kind) ? data.action?.rule : data.action?.item;
  if (['proposal', 'batch_proposal'].includes(type) && fields?.title !== undefined && String(fields.title ?? '').trim().length > 300) return {type: 'clarify', reply: '任务定义超过300字，请缩短后再确认，内容未截断保存。'};
  if (['proposal', 'batch_proposal'].includes(type) && fields?.note !== undefined && String(fields.note ?? '').trim().length > 500) return {type: 'clarify', reply: '模型备注超过500字，请缩短后重试，或在发布表单中核对完整备注；内容未截断保存。'};
  const reply = shortText(data.reply, 600) || '我需要再确认一下你的意思。';
  const usedEvidence = (Array.isArray(data.used_evidence) ? data.used_evidence : []).slice(0, 5).map(item => ({
    kind: ['schedule', 'todo', 'memory', 'insight'].includes(item?.kind) ? item.kind : '',
    id: shortText(item?.id, 120),
  })).filter(item => item.kind && item.id);
  if (type === 'chat' || type === 'clarify') return { type, reply, used_evidence: usedEvidence };
  if (type === 'query') {
    const query = data.query || {};
    return {
      type,
      reply,
      used_evidence: usedEvidence,
      query: {
        entity: query.entity === 'todo' ? 'todo' : 'schedule',
        date_from: validDate(query.date_from),
        date_to: validDate(query.date_to),
        status: ['open', 'done', 'all'].includes(query.status) ? query.status : 'all',
        keyword: shortText(query.keyword, 80),
      },
    };
  }
  if (type === 'batch_proposal') {
    const kind = ['update_schedule_batch', 'delete_schedule_batch'].includes(data.action?.kind) ? data.action.kind : 'create_schedule_batch';
    const seriesId = data.action?.rule?.series_id;
    if (kind !== 'create_schedule_batch' && seriesId != null && (!validSeriesId(seriesId) || (context && !context.tasks.some(task => task.series_id === seriesId)))) {
      return {type: 'clarify', reply: '日程组编号无效或不在提供的资料中，请重新明确目标。'};
    }
    return {
      type,
      reply,
      used_evidence: usedEvidence,
      action: { kind, target_id: null, rule: kind === 'create_schedule_batch' ? sanitizeBatchRule(data.action?.rule) : sanitizeBatchUpdateRule(data.action?.rule), item: kind === 'update_schedule_batch' ? sanitizeAgentItem(data.action?.item) : {} },
    };
  }
  if (type === 'recommendation') {
    const recommendations = Array.isArray(data.recommendations) ? data.recommendations.slice(0, 3) : [];
    return {
      type,
      reply,
      used_evidence: usedEvidence,
      recommendations: recommendations.map((item) => ({
        evidence: shortText(item?.evidence, 240),
        label: shortText(item?.label, 30) || '交给卷卷事务创建',
        action: item?.action || null,
      })).filter((item) => item.action),
    };
  }
  const action = data.action || {};
  const allowed = ['create_schedule', 'create_todo', 'update_schedule', 'update_schedule_batch', 'delete_schedule_batch', 'update_todo', 'delete_schedule', 'delete_todo', 'convert_schedule_to_todo'];
  if (!allowed.includes(action.kind)) return { type: 'clarify', reply: '我还不能确定要执行哪一种操作，请换一种说法。' };
  return {
    type,
    reply,
    used_evidence: usedEvidence,
    action: {
      kind: action.kind,
      target_id: shortText(action.target_id, 80) || null,
      item: sanitizeAgentItem(action.item),
    },
  };
}

function compactAgentContext(context = {}) {
  const tasks = Array.isArray(context.tasks) ? context.tasks.slice(0, 100) : [];
  const todos = Array.isArray(context.todos) ? context.todos.slice(0, 100) : [];
  const history = Array.isArray(context.history) ? context.history.slice(-12) : [];
  const memories = Array.isArray(context.memories) ? context.memories.slice(0, 30) : [];
  const planning = context.planning && typeof context.planning === 'object' ? context.planning : {};
  const examples = value => Array.isArray(value) ? value.slice(0, 3).map(item => shortText(item, 160)).filter(Boolean) : [];
  return {
    candidate_cards: context.candidate_cards===undefined?[]:workflowContract().contextCards(context.candidate_cards),
    tasks: tasks.map(item => ({
      id: shortText(item.id, 80), series_id: validSeriesId(item.series_id) ? item.series_id : null, title: shortText(item.title, 120), note: shortText(item.note, 160),
      exec_date: validDate(item.exec_date), time_type: shortText(item.time_type, 20), slot: shortText(item.slot, 20),
      start_time: validTime(item.start_time), end_time: validTime(item.end_time), end_day_offset: item.end_day_offset===1?1:0, category: shortText(item.category, 20), status: shortText(item.status, 20),
    })),
    todos: todos.map(item => ({
      id: shortText(item.id, 80), title: shortText(item.title, 120), note: shortText(item.note, 160),
      category: shortText(item.category, 20), done: Boolean(item.done),
    })),
    selection: {
      tasks_total: Math.max(tasks.length, Math.min(1000000, Number(context.selection?.tasks_total) || 0)),
      todos_total: Math.max(todos.length, Math.min(1000000, Number(context.selection?.todos_total) || 0)),
      tasks_selected: tasks.length, todos_selected: todos.length, partial: true,
    },
    memories: memories.map(item => ({ id: shortText(item?.id, 80), category: shortText(item?.category, 40), content: shortText(item?.content || item, 300) })).filter(item => item.content),
    history: history.map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: shortText(item.content, 500) })),
    planning: {
      date_from: validDate(planning.date_from), date_to: validDate(planning.date_to),
      schedule_count: Math.max(0, Math.min(100, Number(planning.schedule_count) || 0)),
      todo_count: Math.max(0, Math.min(100, Number(planning.todo_count) || 0)),
      memory_count: Math.max(0, Math.min(30, Number(planning.memory_count) || 0)),
      schedule_examples: examples(planning.schedule_examples), todo_examples: examples(planning.todo_examples), memory_examples: examples(planning.memory_examples),
      insights: planning.insights && typeof planning.insights === 'object' ? {
        conflict_count: Math.max(0, Math.min(20, Number(planning.insights.conflict_count) || 0)),
        busy_days: Array.isArray(planning.insights.busy_days) ? planning.insights.busy_days.slice(0, 5).map(item => ({ date: validDate(item?.date), occupied_hours: Math.max(0, Math.min(24, Number(item?.occupied_hours) || 0)) })) : [],
        candidate_gaps: Array.isArray(planning.insights.candidate_gaps) ? planning.insights.candidate_gaps.slice(0, 5).map(item => ({ date: validDate(item?.date), start: validTime(item?.start), end: validTime(item?.end) })) : [],
        unscheduled_count: Math.max(0, Math.min(100, Number(planning.insights.unscheduled_count) || 0)),
        high_value_todos: examples(planning.insights.high_value_todos),
      } : {},
    },
  };
}

async function stats(req, res, quotaDate) {
  const ownerToken = req.headers['x-owner-token'];
  if (!safeEqual(String(ownerToken || ''), required('OWNER_STATS_TOKEN'))) {
    return json(res, 401, { error: '管理口令不正确' });
  }
  const date = validDate(req.query?.date) || quotaDate;
  const [active, calls, failures, blocked] = await Promise.all([
    redis(['PFCOUNT', `active:${date}`]),
    redis(['GET', `metric:${date}:calls`]),
    redis(['GET', `metric:${date}:failures`]),
    redis(['GET', `metric:${date}:blocked`]),
  ]);
  return json(res, 200, {
    date,
    active_devices: Number(active || 0),
    calls: Number(calls || 0),
    failures: Number(failures || 0),
    blocked: Number(blocked || 0),
  });
}

module.exports = async function handler(req, res) {
  const cloud = process.env.VERCEL === '1';
  if (cloud && require('./cloud.cjs').prepare(req, res, process.env)) return;
  const quotaDate = quotaDay();
  const quota = require('./quota.cjs').createQuota(redis);
  let receipt = null;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 45000);
  const usage = {model_requests: 0, search_requests: 0, fetch_requests: 0, prompt_tokens: 0, completion_tokens: 0, complete: true};
  try {
    if (req.method === 'GET' && req.query?.stats === '1') return await stats(req, res, quotaDate);
    if (req.method !== 'POST') return json(res, 405, { error: '请求方式不支持' });

    const body = parseBody(req);
    const agentMode = body.mode === 'agent';
    const deviceId = body.device_id;
    const requestId = body.request_id;
    if (!/^[A-Za-z0-9]{24,64}$/.test(String(deviceId || ''))) {
      return json(res, 400, { error: '设备编号不合法' });
    }
    if (typeof requestId !== 'string' || !/^[a-f0-9]{32}$/.test(requestId)) return json(res, 400, { error: '请求编号不合法' });
    if (body.mode === 'cancel') {
      await quota.finish(deviceId, requestId, 'cancelled', Date.now());
      return json(res, 200, { released: true });
    }
    const input = String(agentMode ? body.message : body.title || '').trim();
    if (!input || input.length > (agentMode ? 10000 : 300)) return json(res, 400, { error: agentMode ? '消息内容不合法' : '任务内容不合法' });
    if (body.context?.selected_images?.length || body.images?.length) return json(res, 400, {error: '云端AI暂不支持图片，请发送文字或公开网页链接', code: 'images_unsupported'});

    const modelDate = validDate(body.client_date) || quotaDate;
    // Record identity before admission: a lost Redis response may already have reserved quota.
    receipt = { deviceId, requestId };
    const admission = await quota.reserve({device:deviceId, id:requestId, day:quotaDate,
      deviceLimit:DEVICE_LIMIT, globalLimit:GLOBAL_LIMIT, now:Date.now()});
    if (['device','global'].includes(admission)) {
      receipt = null;
      return json(res, 429, { error: '今日免费AI次数已达上限。', limit_scope: admission });
    }
    if (admission !== 'reserved') {
      receipt = null;
      return json(res, 409, { error: '请求已处理或已取消，请重新尝试。' });
    }
    await redis(['PFADD', `active:${quotaDate}`, deviceId]);
    await redis(['EXPIRE', `active:${quotaDate}`, '2678400']);
    const context = agentMode ? compactAgentContext(body.context) : null;
    const agentRole = ['auto','chat','planning','task'].includes(body.agent_role) ? body.agent_role : 'auto';
    const materials = agentMode ? require('../src/assistant/materials.js') : null;
    const agentPrompt = agentMode ? materials.researchPrompt(workflowContract().assistantPrompt(agentRole)) : '';
    const messages = agentMode ? [
      { role: 'system', content: agentPrompt + '\n上下文只含按问题选择的有限资料，selection.partial始终为true，不能声称查过完整数据库。查询返回query条件由程序核对；资料不足或目标不唯一时追问。' },
      { role: 'user', content: `今天是${modelDate}。以下是当前设备中的事务数据和最近对话，仅用于理解用户请求：\n${JSON.stringify(context)}\n\n用户刚刚说：${input}` },
    ] : [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `今天是${modelDate}。待办任务：${input}` },
    ];
    const provider = async (url, options) => {
      if (controller.signal.aborted) throw new Error('请求已过期');
      if (cloud && await redis(['HGET', `quota-request:${deviceId}:${requestId}`, 'state']) !== 'pending') throw new Error('请求已取消');
      if (controller.signal.aborted) throw new Error('请求已过期');
      if (url === DEEPSEEK_URL) usage.model_requests++;
      else if (url === 'https://api.deepseek.com/v1/tools/search') usage.search_requests++;
      else if (url === 'https://api.deepseek.com/v1/tools/fetch') usage.fetch_requests++;
      else throw new Error('不支持的服务地址');
      return fetch(url, {...options, signal: options.signal || controller.signal, redirect: 'error'});
    };
    const ask = async () => {
    const {response,data:output} = await requestJSON(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${required('DEEPSEEK_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-flash',
        messages,
        temperature: 0.1,
        max_tokens: agentMode ? 6000 : 300,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: controller.signal,
      transport: provider,
    });
    if (!response.ok) throw new Error(`模型服务返回 ${response.status}`);
    if (output.error || cloud && output.choices?.[0]?.finish_reason !== 'stop') throw new Error('模型回答未完整返回');
    if (Number.isSafeInteger(output.usage?.prompt_tokens) && output.usage.prompt_tokens >= 0 && Number.isSafeInteger(output.usage?.completion_tokens) && output.usage.completion_tokens >= 0) {
      usage.prompt_tokens += output.usage.prompt_tokens; usage.completion_tokens += output.usage.completion_tokens;
    } else usage.complete = false;
    return output.choices?.[0]?.message?.content;
    };
    let external = null;
    let result;
    if (agentMode) {
      const config = {endpoint: DEEPSEEK_URL, model: 'deepseek-flash', key: required('DEEPSEEK_API_KEY')};
      if (materials.links(input).length) external = await materials.collect({text: input}, config, controller.signal, provider);
      else external = materials.selectPrevious(input, materials.previous(body.context?.previous_materials));
      const append = () => { if (external) messages.push({role: 'user', content: materials.externalText(external)}); };
      append();
      let raw = await ask();
      const first = parseJsonContent(raw);
      if (first.type === 'research') {
        const searched = await materials.collect({text: '', query: first.query}, config, controller.signal, provider);
        external = external ? materials.combine(external, searched) : searched;
        if (messages.length === 3) messages.pop();
        append(); raw = await ask();
        if (parseJsonContent(raw).type === 'research') throw new Error('搜索未形成完整回答');
      }
      result = {...parseAgentResult(raw, context, input), ...(external ? {materials: external} : {})};
    } else {
      result = parseModelResult(await ask());
    }
    const completed = await quota.finish(deviceId, requestId, 'success', Date.now());
    if (completed !== 'success') {
      receipt = null;
      return json(res, 409, { error: '请求已取消或已过期，请重新尝试。' });
    }
    const sent = json(res, 200, {...result, provider_usage: usage});
    receipt = null;
    return sent;
  } catch (error) {
    try {
      if (receipt) await quota.finish(receipt.deviceId, receipt.requestId, 'failed', Date.now());
      else await increaseMetric('failures', quotaDate);
    } catch (_) { /* Client keeps the receipt until release is confirmed. Pending leases also expire. */ }
    return json(res, 503, { error: 'AI 服务暂时不可用，请稍后再试' });
  } finally {
    clearTimeout(deadline); controller.abort();
  }
};
