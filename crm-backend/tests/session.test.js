const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../../front end/session.js'),'utf8');
function storage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};}
function tab(localStorage, sessionStorage=storage()) { const context={window:{},localStorage,sessionStorage};vm.runInNewContext(source,context);return {...context,session:context.window.crmSession}; }
test('two tabs retain different accounts when remember-me changes',()=>{
 const shared=storage(), admin=tab(shared);admin.session.save('admin','true','admin-id');
 const second=tab(shared);assert.equal(second.session.token(),'admin');
 second.session.save('employee',true,'employee-id');
 assert.equal(admin.session.token(),'admin');assert.equal(second.session.token(),'employee');
 assert.equal(tab(shared).session.token(),'employee');
});
test('signing in without remember-me does not erase another remembered account',()=>{
 const shared=storage(), admin=tab(shared);admin.session.save('admin',true,'admin-id');
 const employee=tab(shared);employee.session.save('employee',false,'employee-id');
 assert.equal(admin.session.token(),'admin');assert.equal(employee.session.token(),'employee');assert.equal(shared.getItem('token'),'admin');
});
test('logging out one account does not log out a different tab',()=>{
 const shared=storage(), admin=tab(shared), employee=tab(shared);admin.session.save('admin',true,'admin-id');employee.session.save('employee',true,'employee-id');
 admin.session.clear();assert.equal(admin.session.token(),null);assert.equal(employee.session.token(),'employee');assert.equal(shared.getItem('token'),'employee');
 // A deliberately signed-out tab must not fall back into a different remembered account.
 assert.equal(tab(shared,admin.sessionStorage).session.token(),null);
});
test('legacy remembered tokens are pinned on first read',()=>{
 const shared=storage();shared.setItem('token','old-admin');const admin=tab(shared);assert.equal(admin.session.token(),'old-admin');shared.setItem('token','other');assert.equal(admin.session.token(),'old-admin');
});
test('expired session from an old request cannot clear a newer login',()=>{
 const t=tab(storage());t.session.save('old',false,'a');t.session.save('new',false,'b');assert.equal(t.session.clear('old'),false);assert.equal(t.session.token(),'new');
});
test('remember-me opt-out removes only the same account and invalid response cannot erase a login',()=>{
 const shared=storage(),t=tab(shared);t.session.save('a',true,'id');t.session.save('b',false,'id');assert.equal(shared.getItem('token'),null);assert.equal(t.session.token(),'b');assert.throws(()=>t.session.save(undefined,true,'id'));assert.equal(t.session.token(),'b');
});
