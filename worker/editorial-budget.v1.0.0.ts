import { body, HttpError, json, type Env } from "./core";

interface Period {id:number;operation_id:string;previous_id:number|null;baseline_usd:number;allowance_usd:number;created_at:string}
function resetAmount(env:Env):number|null {
  const amount=Number(env.EDITORIAL_BUDGET_RESET_USD);
  return Number.isFinite(amount) && amount>=0.000001 && amount<=1000 &&
    Math.round(amount*1e6)===amount*1e6 ? amount : null;
}
const rounded=(n:number)=>Math.round(n*1e6)/1e6;
export async function editorialBudgetStatus(env:Env){
  // One statement gives a consistent view while resets and reservations race.
  const row=await env.DB.prepare(`SELECT p.id AS period_id,p.allowance_usd,p.created_at,
    COALESCE((SELECT sum(reserved_usd) FROM editorial_budget_usage),0) AS used_usd,
    COALESCE((SELECT sum(reserved_usd) FROM editorial_usage),0) AS lifetime_usd
    FROM (SELECT 1) LEFT JOIN editorial_budget_current p ON 1=1`)
    .first<{period_id:number|null;allowance_usd:number|null;created_at:string|null;used_usd:number;lifetime_usd:number}>();
  if(!row)throw new HttpError(503,"Contatore del budget non disponibile");
  const totals=[env.REAL_DISCOVERY_TOTAL_USD,env.TOPIC_EMBEDDING_TOTAL_USD].map(Number).filter(n=>Number.isFinite(n)&&n>0);
  const limit=row.allowance_usd ?? (totals.length?Math.min(...totals):null);
  const history=await env.DB.prepare("SELECT id,previous_id,baseline_usd,allowance_usd,created_at FROM editorial_budget_periods ORDER BY id DESC LIMIT 10").all();
  return {period_id:row.period_id,limit_usd:limit,used_usd:rounded(row.used_usd),
    remaining_usd:limit===null?null:rounded(Math.max(0,limit-row.used_usd)),
    lifetime_usd:rounded(row.lifetime_usd),reset_amount_usd:resetAmount(env),history:history.results};
}
export async function resetEditorialBudget(request:Request,env:Env):Promise<Response>{
  const data=await body(request,500),amount=resetAmount(env);
  if(amount===null)throw new HttpError(503,"Reset del budget non configurato sul server");
  if(Object.keys(data).sort().join(',')!=='amount_usd,expected_period_id,operation_id' ||
    typeof data.operation_id!=='string' || !/^[a-f0-9-]{36}$/i.test(data.operation_id) ||
    (data.expected_period_id!==null && (!Number.isSafeInteger(data.expected_period_id) || Number(data.expected_period_id)<1)) ||
    data.amount_usd!==amount)throw new HttpError(400,"Conferma del budget non valida: aggiorna la dashboard");
  const prior=await env.DB.prepare("SELECT * FROM editorial_budget_periods WHERE operation_id=?").bind(data.operation_id).first<Period>();
  if(prior){
    if(prior.previous_id!==data.expected_period_id || prior.allowance_usd!==amount)throw new HttpError(409,"Richiesta di reset già usata con parametri diversi");
    return json({reset:true,already_reset:true,period_id:prior.id,budget:await editorialBudgetStatus(env),paid_calls_started:false});
  }
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO editorial_budget_periods
    (operation_id,previous_id,baseline_usd,allowance_usd,created_at)
    SELECT ?,?,round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage),0),6),?,?
    WHERE COALESCE((SELECT id FROM editorial_budget_current),0)=? AND
      NOT EXISTS(SELECT 1 FROM editorial_workspace_jobs WHERE status IN ('prepared','submitting')) AND
      NOT EXISTS(SELECT 1 FROM editorial_topic_description_jobs WHERE status IN ('prepared','submitting')) AND
      NOT EXISTS(SELECT 1 FROM editorial_topic_semantics WHERE embedding_status='submitting') AND
      NOT EXISTS(SELECT 1 FROM editorial_topic_suggestion_semantics WHERE embedding_status='submitting')`)
    .bind(data.operation_id,data.expected_period_id,amount,new Date().toISOString(),data.expected_period_id ?? 0).run();
  // A simultaneous replay of the same request succeeds without creating a second period.
  const saved=await env.DB.prepare("SELECT * FROM editorial_budget_periods WHERE operation_id=?").bind(data.operation_id).first<Period>();
  if(!saved)throw new HttpError(409,"Budget aggiornato altrove oppure operazione AI in corso: aggiorna la dashboard prima di riprovare");
  if(saved.previous_id!==data.expected_period_id || saved.allowance_usd!==amount)throw new HttpError(409,"Richiesta di reset già usata con parametri diversi");
  return json({reset:true,already_reset:inserted.meta.changes!==1,period_id:saved.id,budget:await editorialBudgetStatus(env),paid_calls_started:false});
}
