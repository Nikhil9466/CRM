const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const enabled=process.env.CRM_TEST_DATABASE_URL;if(enabled)process.env.DATABASE_URL=enabled;
process.env.JWT_SECRET||='integration-secret-only-at-least-32-characters';
test('authentication regression: promotion, concurrent accounts, repeat login, password recovery and deactivation', {skip:!enabled,timeout:120000},async()=>{
 const app=require('../src/app'),p=require('../src/config/prisma'),bcrypt=require('bcrypt');
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 const orgId='auth-'+randomUUID(),foreignOrg=orgId+'-other';const password='RegressionPassword!123';let i=0;
 async function req(path,token,method='GET',body,status=200){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=response.status===204?null:await response.json();assert.equal(response.status,status,method+' '+path+': '+JSON.stringify(data));return data;}
 const login=(user,pw=password,status=200)=>req('/auth/login',null,'POST',{email:user.email,password:pw},status);
 try {
  await p.organisation.createMany({data:[{id:orgId},{id:foreignOrg}]});
  await p.stage.createMany({data:require('../src/utils/stages')(orgId)});
  // Low bcrypt cost is confined to disposable fixtures, to exercise many sign-ins quickly.
  const passwordHash=await bcrypt.hash(password,4);
  async function user(role,org=orgId){const n=++i;return p.user.create({data:{name:'Test '+n,email:randomUUID()+'@example.test',phone:'71'+String(Date.now()+n).slice(-8),orgId:org,role,passwordHash}})}
  const admin=await user('ADMIN'),employee=await user('EMPLOYEE'),inactive=await user('EMPLOYEE'),outsider=await user('EMPLOYEE',foreignOrg);
  const a=await login(admin),e=await login(employee);
  await req('/members/'+employee.id,a.token,'PATCH',{role:'ADMIN'});
  const promoted=await login(employee);assert.equal(promoted.user.role,'ADMIN');assert.equal((await req('/me',e.token)).role,'ADMIN');assert.equal((await req('/me',a.token)).id,admin.id);
  for(let n=0;n<70;n++){const result=await login(n%2?employee:admin);assert.ok(result.token)}
  const parallel=await Promise.all(Array.from({length:12},(_,n)=>login(n%2?employee:admin)));assert.equal(parallel.length,12);
  await req('/auth/login',null,'POST',{email:'  '+employee.email.toUpperCase()+'  ',password});
  await login(employee,'incorrect password',401);
  await req('/members/'+employee.id,a.token,'PATCH',{role:'EMPLOYEE'});
  assert.equal((await login(employee)).user.role,'EMPLOYEE');await req('/teams',promoted.token,'GET',null,403);
  await req('/member-passwords/'+admin.id,e.token,'PATCH',{password:'HackedPassword!123'},403);
  await req('/member-passwords/'+outsider.id,a.token,'PATCH',{password:'OtherPassword!123'},404);
  await req('/member-passwords/'+admin.id,a.token,'PATCH',{password:'SelfPassword!123'},400);
  await req('/member-passwords/'+employee.id,a.token,'PATCH',{password:'short'},400);
  await req('/member-passwords/'+employee.id,a.token,'PATCH',{password:'ChangedPassword!123'});
  await req('/me',promoted.token,'GET',null,401);await login(employee,password,401);
  const fresh=await login(employee,'ChangedPassword!123');assert.equal(fresh.user.role,'EMPLOYEE');assert.equal(fresh.user.passwordHash,undefined);
  await req('/members/'+inactive.id,a.token,'PATCH',{active:false});
  const disabled=await login(inactive,password,403);assert.match(disabled.error,/deactivated/);
  await login(inactive,'bad password',401);
  await req('/member-passwords/'+inactive.id,a.token,'PATCH',{password:'InactivePassword!123'});
  await login(inactive,'InactivePassword!123',403);
  await req('/members/'+inactive.id,a.token,'PATCH',{active:true});await login(inactive,'InactivePassword!123');
  // Roles/team IDs in a login request cannot elevate access.
  const forged=await req('/auth/login',null,'POST',{email:employee.email,password:'ChangedPassword!123',role:'ADMIN',teamId:'fake',orgId:foreignOrg});assert.equal(forged.user.role,'EMPLOYEE');
  // Existing password-change endpoint must distinguish a bad current password from an expired session.
  await req('/password',fresh.token,'POST',{currentPassword:'wrong',password:'FinalPassword!123'},400);
  await req('/password',fresh.token,'POST',{currentPassword:'ChangedPassword!123',password:'FinalPassword!123'});
  await req('/me',fresh.token,'GET',null,401);await login(employee,'FinalPassword!123');
  // Malformed/empty input returns a useful client error, not a server crash.
  for(const body of [{},{email:{}},{email:employee.email,password:[]},{email:employee.email,password:''}])await req('/auth/login',null,'POST',body,400);
 }finally{const where={orgId:{in:[orgId,foreignOrg]}};await p.task.deleteMany({where});await p.deal.deleteMany({where});await p.contact.deleteMany({where});await p.user.deleteMany({where});await p.stage.deleteMany({where});await p.organisation.deleteMany({where:{id:{in:[orgId,foreignOrg]}}});await p.$disconnect();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
