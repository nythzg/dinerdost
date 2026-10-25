import type {Page} from '@playwright/test';
export async function navigateConsole(page:Page,name:string){
 const open=page.getByRole('button',{name:'Open navigation',exact:true});
 if(await open.isVisible())await open.click();
 await page.getByRole('navigation',{name:'Superadmin navigation'}).getByRole('link',{name,exact:true}).click();
}
