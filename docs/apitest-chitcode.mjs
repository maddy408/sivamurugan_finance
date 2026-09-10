const B = process.env.API_BASE || 'http://localhost/siva-murugan-chit-fund/backend/public';
let pass=0, fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  PASS '+m)):(fail++,console.log('  FAIL '+m));};
const call=async(method,path,{token,body}={})=>{
  const h={'Content-Type':'application/json'}; if(token)h.Authorization='Bearer '+token;
  const r=await fetch(B+path,{method,headers:h,body:body?JSON.stringify(body):undefined});
  let j=null; try{j=await r.json();}catch{} return {status:r.status,j};
};
const run=async()=>{
  const AT=(await call('POST','/api/auth/login',{body:{username:'admin',password:'Admin@123'}})).j.data.token;
  const ET=(await call('POST','/api/auth/login',{body:{username:'ravi',password:'Employee@123'}})).j.data.token;
  await call('PUT','/api/settings/chit-prefix',{token:AT,body:{prefix:'jrm'}});           // lowercase -> normalize
  const pfx=(await call('GET','/api/loans/next-code',{token:AT})).j.data;
  ok(pfx.prefix==='JRM','settings prefix "jrm" normalized to JRM');
  const loc={ id: 'CC Town', name: 'CC Town' };
  const cust=(await call('POST','/api/customers',{token:AT,body:{name:'CC Cust',mobile:'9000000123',location: loc.name}})).j.data;
  const mk=(extra={})=>call('POST','/api/loans',{token:AT,body:{customer_id:cust.id,account_type:'chit',principal_amount:20000,installment_amount:3000,tenure:4,frequency:'weekly',start_date:'2026-02-01',schedule_type:'WEEKLY',...extra}});
  const a=(await mk()).j.data, b=(await mk()).j.data;
  ok(/^JRM-\d+$/.test(a.code)&&/^JRM-\d+$/.test(b.code),`auto codes clean PREFIX-N (${a.code}, ${b.code})`);
  ok(parseInt(b.code.split('-')[1])===parseInt(a.code.split('-')[1])+1,'auto increments by 1');
  // manual verbatim
  const m1=(await mk({code:'JRM-OLD-123'})).j;
  ok(m1.data?.code==='JRM-OLD-123','manual code saved verbatim (JRM-OLD-123)');
  // manual duplicate -> 409
  const dup=await mk({code:'JRM-OLD-123'});
  ok(dup.status===409&&/already exists/i.test(dup.j?.message||''),'duplicate manual -> 409 "Chit Code already exists"');
  // auto still highest+1, NOT random-suffixed, even though JRM-OLD-123 exists
  const c=(await mk()).j.data;
  ok(/^JRM-\d+$/.test(c.code),`auto after manual insert still clean (${c.code})`);
  ok(parseInt(c.code.split('-')[1])===parseInt(b.code.split('-')[1])+1,'auto = previous highest numeric + 1');
  // concurrent: fire 5 creates in parallel, expect 5 distinct sequential codes, no random suffix
  const par=await Promise.all([mk(),mk(),mk(),mk(),mk()]);
  const codes=par.map(x=>x.j?.data?.code);
  ok(par.every(x=>x.status===201),'5 concurrent creates all 201');
  ok(new Set(codes).size===5,'5 concurrent codes all distinct: '+codes.join(','));
  ok(codes.every(x=>/^JRM-\d+$/.test(x)),'no random-suffixed codes under concurrency');
  // invalid characters
  const bad=await mk({code:'JRM 1@@'});
  ok(bad.status===422,'invalid chars in manual code -> 422');
  // employee cannot change prefix
  const ep=await call('PUT','/api/settings/chit-prefix',{token:ET,body:{prefix:'XXX'}});
  ok(ep.status===403,'employee PUT /settings/chit-prefix -> 403');
  // edit: save without touching code preserves it
  const up=await call('PUT','/api/loans/'+a.id,{token:AT,body:{installment_amount:3000}});
  ok(up.j?.data?.loan?.code===a.code,'edit without code change preserves code ('+a.code+')');
  // edit: change code to duplicate -> 409
  const upd=await call('PUT','/api/loans/'+a.id,{token:AT,body:{code:b.code}});
  ok(upd.status===409,'edit to existing code -> 409');
  // restore prefix
  await call('PUT','/api/settings/chit-prefix',{token:AT,body:{prefix:'JRM'}});
  console.log(`\n  ${pass} passed / ${fail} failed`);
  process.exit(fail?1:0);
};
run();
