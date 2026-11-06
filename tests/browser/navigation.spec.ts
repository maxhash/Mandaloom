import {test,expect} from '@playwright/test';
import {seed,makeNode,backup,assignReferences} from '../../src/lib/model';
test('unique grid URLs survive deep reload, new tabs, back/forward, rename and deletion',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const nodes=seed();const nested=makeNode('Deep objective',nodes[1],0);nodes.push(nested);const initial=backup(assignReferences(nodes).nodes);
 await page.addInitScript(data=>{if(!localStorage.getItem('mandaloom-demo'))localStorage.setItem('mandaloom-demo',JSON.stringify(data));},initial);
 await page.goto('/');await expect(page.locator('.grid-reference')).toHaveText('M001/R');const rootUrl=page.url();
 await page.locator('.cell-main').filter({has:page.getByRole('heading',{name:'Trading Strategy',exact:true})}).click();const parentUrl=page.url();expect(parentUrl).toContain('/m/M001/R.1');expect(parentUrl).not.toBe(rootUrl);
 await page.locator('.cell-main').filter({has:page.getByRole('heading',{name:'Deep objective',exact:true})}).click();const deepUrl=page.url();expect(deepUrl).toContain('/m/M001/R.1.1');
 await page.reload();await expect(page.locator('.grid-reference')).toHaveText('M001/R.1.1');expect(page.url()).toBe(deepUrl);
 await page.goBack();await expect(page.locator('.grid-reference')).toHaveText('M001/R.1');await page.goBack();await expect(page.locator('.grid-reference')).toHaveText('M001/R');await page.goForward();await page.goForward();await expect(page.locator('.grid-reference')).toHaveText('M001/R.1.1');
 await page.getByRole('button',{name:'Copy link',exact:true}).click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(deepUrl);
 const other=await context.newPage();await other.goto(deepUrl);await expect(other.locator('.grid-reference')).toHaveText('M001/R.1.1');await other.close();
 await page.getByRole('button',{name:'Edit objective',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Renamed objective');await page.getByRole('button',{name:'Save changes'}).click();expect(page.url()).toBe(deepUrl);
 await page.getByRole('button',{name:'Edit objective',exact:true}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page).toHaveURL(parentUrl);
 await page.waitForFunction(()=>!localStorage.getItem('mandaloom-draft-demo'));await page.goto(deepUrl);await expect(page.locator('.grid-reference')).toHaveText('M001/R');await expect(page.getByText('This grid is unavailable or was deleted.',{exact:false})).toBeVisible();await expect(page).toHaveURL(rootUrl);
});
test('a newly created root and imported roots receive working URLs',async({page})=>{
 await page.goto('/');await expect(page.locator('.mandala-grid')).toBeVisible();await page.getByRole('button',{name:'New Mandala',exact:true}).first().click();await page.getByLabel('Title',{exact:true}).fill('Another root');await page.getByRole('button',{name:'Save changes'}).click();const url=page.url();expect(url).toContain('/m/M002/R');await page.reload();await expect(page.getByRole('heading',{name:'Another root',level:1})).toBeVisible();expect(page.url()).toBe(url);
 await page.locator('input[type=file]').setInputFiles({name:'copy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup(seed())))});await expect(page.locator('.grid-reference')).toHaveText('M003/R');const importedUrl=page.url();expect(importedUrl).not.toBe(url);await page.reload();expect(page.url()).toBe(importedUrl);await expect(page.locator('.grid-reference')).toHaveText('M003/R');
});

test('legacy UUID links upgrade to readable references at the same grid',async({page})=>{const nodes=assignReferences(seed()).nodes;await page.addInitScript(data=>localStorage.setItem('mandaloom-demo',JSON.stringify(data)),backup(nodes));await page.goto('/?grid='+nodes[1].id);await expect(page.locator('.grid-reference')).toHaveText('M001/R.1');await expect(page).toHaveURL(/\/m\/M001\/R\.1$/);await page.reload();await expect(page.getByRole('heading',{name:'Trading Strategy',level:1})).toBeVisible();});
