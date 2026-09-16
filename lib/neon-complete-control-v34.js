'use client';

import { neonTest } from './neon-test-client';
import { loadCompleteControlData, localToday, normalizeCompleteError } from './neon-complete-control';

const number = value => Number(value || 0);
const clean = value => String(value ?? '').trim();

async function query(table, columns='*') {
  const result = await neonTest.from(table).select(columns);
  if (result.error) throw result.error;
  return result.data || [];
}

async function rpc(name,args) {
  const result = await neonTest.rpc(name,args);
  if (result?.error) throw result.error;
  return result?.data ?? null;
}

export async function loadCompleteV34Data(activeOrganizationId=null) {
  const base = await loadCompleteControlData(activeOrganizationId);
  if (base.reload) return base;
  const [revisions,plans,members,recurringRules,recurringMembers] = await Promise.all([
    query('finance_obligation_revisions','id,organization_id,obligation_id,reason,before_data,after_data,changed_by,changed_at'),
    query('finance_installment_plans_v2','id,organization_id,direction,description,total_amount,installment_count,first_due_date,issue_date,customer_id,supplier_id,category_id,notes,status,cancelled_at,cancel_reason,created_at,updated_at'),
    query('finance_installment_members_v2','plan_id,organization_id,obligation_id,installment_no,created_at'),
    query('finance_recurring_rules_v2','id,organization_id,direction,description,amount,due_day,starts_on,ends_on,customer_id,supplier_id,category_id,notes,active,generated_through,stopped_at,stop_reason,created_at,updated_at'),
    query('finance_recurring_members_v2','recurring_id,organization_id,obligation_id,occurrence_date,created_at')
  ]);
  return {
    ...base,
    revisions,
    installmentPlans: plans.map(row=>({...row,totalAmount:number(row.total_amount),installmentCount:Number(row.installment_count||0),firstDueDate:row.first_due_date,issueDate:row.issue_date,companyId:row.organization_id,customerId:row.customer_id,supplierId:row.supplier_id,categoryId:row.category_id,cancelReason:row.cancel_reason||'',createdAt:row.created_at,updatedAt:row.updated_at})),
    installmentMembers: members.map(row=>({planId:row.plan_id,companyId:row.organization_id,obligationId:row.obligation_id,installmentNo:Number(row.installment_no||0)})),
    recurringRules: recurringRules.map(row=>({...row,companyId:row.organization_id,amount:number(row.amount),dueDay:Number(row.due_day||0),startsOn:row.starts_on,endsOn:row.ends_on,customerId:row.customer_id,supplierId:row.supplier_id,categoryId:row.category_id,generatedThrough:row.generated_through,stopReason:row.stop_reason||'',createdAt:row.created_at,updatedAt:row.updated_at})),
    recurringMembers: recurringMembers.map(row=>({recurringId:row.recurring_id,companyId:row.organization_id,obligationId:row.obligation_id,occurrenceDate:row.occurrence_date}))
  };
}

export async function updateFinanceObligationSafe({obligationId,description,issueDate,dueDate,amount,customerId=null,supplierId=null,categoryId=null,notes='',reason}) {
  return rpc('update_finance_obligation_safe',{
    p_obligation_id:obligationId,p_description:clean(description),p_issue_date:issueDate||null,p_due_date:dueDate,
    p_amount:number(amount),p_customer_id:customerId||null,p_supplier_id:supplierId||null,p_category_id:categoryId||null,
    p_notes:clean(notes),p_reason:clean(reason)
  });
}

export async function createInstallmentPlanV2({organizationId,direction,description,totalAmount,installmentCount,issueDate,firstDueDate,customerId=null,supplierId=null,categoryId=null,notes=''}) {
  return rpc('create_finance_installment_plan_v2',{
    p_organization_id:organizationId,p_direction:direction,p_description:clean(description),p_total_amount:number(totalAmount),
    p_installment_count:Number(installmentCount),p_issue_date:issueDate||null,p_first_due_date:firstDueDate,
    p_customer_id:customerId||null,p_supplier_id:supplierId||null,p_category_id:categoryId||null,p_notes:clean(notes)
  });
}

export async function cancelInstallmentRemainingV2({planId,reason}) {
  return rpc('cancel_finance_installment_remaining_v2',{p_plan_id:planId,p_reason:clean(reason)});
}

export async function createRecurringRuleV2({organizationId,direction,description,amount,dueDay,startsOn,endsOn=null,customerId=null,supplierId=null,categoryId=null,notes='',generateMonths=12}) {
  return rpc('create_finance_recurring_rule_v2',{
    p_organization_id:organizationId,p_direction:direction,p_description:clean(description),p_amount:number(amount),
    p_due_day:Number(dueDay),p_starts_on:startsOn,p_ends_on:endsOn||null,p_customer_id:customerId||null,
    p_supplier_id:supplierId||null,p_category_id:categoryId||null,p_notes:clean(notes),p_generate_months:Number(generateMonths||12)
  });
}

export async function generateRecurringV2({ruleId,through}) {
  return rpc('generate_finance_recurring_v2',{p_rule_id:ruleId,p_through:through});
}

export async function stopRecurringRuleV2({ruleId,cancelFuture=true,reason}) {
  return rpc('stop_finance_recurring_rule_v2',{p_rule_id:ruleId,p_cancel_future:Boolean(cancelFuture),p_reason:clean(reason)});
}

export async function stopRecurringRuleV3({ruleId,cancelScope='next_month',reason}) {
  if (!['keep','next_month','all_open'].includes(cancelScope)) throw new Error('Escopo de encerramento inválido.');
  return rpc('stop_finance_recurring_rule_v3',{
    p_rule_id:ruleId,
    p_cancel_scope:cancelScope,
    p_reference_date:localToday(),
    p_reason:clean(reason)
  });
}

export { normalizeCompleteError };
