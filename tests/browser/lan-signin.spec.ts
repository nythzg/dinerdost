import {test,expect} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';

test('the same account signs in across local hosts; untrusted write origins remain blocked',async({page,browser})=>{
  const base=String(test.info().project.use.baseURL),origin=new URL(base).origin;
  const email='lan-signin-'+randomUUID()+'@example.test',password=randomBytes(24).toString('base64url');
  await page.setViewportSize({width:390,height:844});
  await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});
  await page.goto('/signup');
  for(const [name,value] of [['Your name','LAN QA'],['Restaurant name','LAN isolated QA'],['First outlet','Main'],['Email',email],['Password',password]])await page.getByLabel(name,{exact:true}).fill(value);
  await page.getByRole('button',{name:'Create workspace',exact:true}).click();await page.waitForURL('**/app/overview');
  const before=await(await page.request.get('/api/workspace')).json();
  // A distinct browser context has no cookies from the registered device.
  const phone=await browser.newContext({viewport:{width:390,height:844}});
  try{
    const signin=await phone.newPage();await signin.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});
    await signin.goto(base+'/signin');
    await signin.getByLabel('Email',{exact:true}).fill(email);await signin.getByLabel('Password',{exact:true}).fill(password);
    await signin.getByRole('button',{name:'Sign in',exact:true}).click();await signin.waitForURL('**/app/overview');
    const after=await(await signin.request.get(base+'/api/workspace')).json();expect(after.actor.employeeId).toBe(before.actor.employeeId);
    const otherHost=new URL(base);otherHost.hostname='localhost';
    const other=await phone.request.post(otherHost.origin+'/api/auth/login',{headers:{Origin:otherHost.origin},data:{email,password}});expect(other.status()).toBe(200);
    for(const untrusted of ['https://untrusted.example',origin.replace(':5090',':5099'),origin.replace('http:','https:')]){
      if(untrusted===origin)continue;
      const rejected=await signin.request.post(base+'/api/auth/logout',{headers:{Origin:untrusted}});expect(rejected.status()).toBe(403);expect((await rejected.json()).error.code).toBe('INVALID_ORIGIN');
    }
    expect((await signin.request.get(base+'/api/workspace')).status()).toBe(200);
    await signin.screenshot({path:'verification/local-lan-signed-in-phone.png'});
  }finally{await phone.close()}
});
