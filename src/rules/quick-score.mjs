export const version = '1.0.2';
const routineReason='常规任务';
const sustainedHours=s=>{
  if(!/^(?:学习|复习|整理|处理|训练)/.test(s))return false;
  const duration=s.match(/(?:两|(\d+(?:\.\d+)?))小时/);
  return !!duration&&(duration[1]?Number(duration[1]):2)>=2;
};
// Explicit action gates, priority and evidence. Category never enters this table.
export const rules = [
  {id:'simple', priority:40, score:2, reason:'明确简单操作', match:s=>/^(?:取|拿|领取)(?:一下)?快递/.test(s)||/^(?:买|购买|采购)(?!计划|方案).+/.test(s)||/^(?:提交|发送|上传)(?:已准备好|已完成|准备好)的?.*(?:材料|文件|报告)/.test(s)},
  {id:'delivery', priority:30, score:5, reason:'明确完整成果交付', match:s=>/^(?:完成|交付).*项目.*(?:交付|验收|完整成果)/.test(s)||/^(?:撰写|编写|完成)正式报告/.test(s)||/^(?:开发|完成|构建)完整(?:系统|项目)/.test(s)},
  {id:'sustained', priority:20, score:4, reason:'明确持续范围或完整准备', match:s=>/^(?:整理|准备|编写)(?:完整|全套).*(?:资料|材料|方案)/.test(s)||sustainedHours(s)},
  {id:'routine',priority:0,score:3,reason:routineReason,match:()=>true},
];
export function quickScore({title='',description=''}={}) {
  const text=String(title).trim();
  if(!text||/^(?:做事|任务|处理|事情|不要做|待办)[。！!？?]*$/.test(text)) throw new Error('请补充具体事务');
  const clauses=text.split(/[，,；;。\n]|然后|并且|并(?=完成|开发|取|买|整理|准备|撰写|复习|学习)/).map(s=>s.trim())
    .filter(s=>s&&!/^(?:不要|不用|无需|不必|别|已完成|已经完成)/.test(s))
    .map(s=>s.replace(/^(?:(?:今天|明天|后天|上午|下午|晚上|请|帮我|一下)\s*)+/,''));
  const candidates=clauses.map(s=>rules.filter(r=>r.match(s)).sort((a,b)=>b.priority-a.priority)[0]).filter(Boolean);
  const distinct=new Set(candidates.map(r=>r.score));
  const rule=distinct.size===1?candidates[0]:null;
  return {base_score:rule?.score??3,ruleId:rule?.id??'routine',reason:rule?.reason??routineReason,version,fallback:!rule||rule.id==='routine',source:'rule'};
}
export function shortCopy(text) {
  const value=String(text), body=value.replace(/[。.]$/u,'');
  if(/https?:|`|\n/.test(value)) return value;
  return Array.from(body).length<8?body:value;
}
