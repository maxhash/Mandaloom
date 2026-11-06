import {test,expect} from '@playwright/test';
import {seed,makeNode,backup,assignReferences} from '../../src/lib/model';
test('Backspace goes up one parent, preserves editable text and ignores modifiers or held keys',async({page})=>{
 const nodes=seed();nodes.push(makeNode('Nested keyboard test',nodes[1],0));await page.addInitScript(data=>localStorage.setItem('mandaloom-demo',JSON.stringify(data)),backup(assignReferences(nodes).nodes));
 await page.goto('/m/M001/R.1.1');await expect(page.locator('.grid-reference')).toHaveText('M001/R.1.1');await page.locator('h1').click();
 await page.keyboard.press('Shift+Backspace');await expect(page.locator('.grid-reference')).toHaveText('M001/R.1.1');
 await page.getByRole('button',{name:'Edit objective',exact:true}).click();const title=page.getByLabel('Title',{exact:true});await title.fill('AB');await title.press('End');await title.press('Backspace');await expect(title).toHaveValue('A');await expect(page).toHaveURL(/R\.1\.1$/);
 await page.getByLabel('Priority',{exact:true}).focus();await page.keyboard.press('Backspace');await expect(page.getByRole('dialog')).toBeVisible();await expect(page).toHaveURL(/R\.1\.1$/);await page.getByRole('button',{name:'Cancel',exact:true}).click();
 const search=page.getByLabel('Search objectives');await search.fill('AB');await search.press('End');await search.press('Backspace');await expect(search).toHaveValue('A');await expect(page).toHaveURL(/R\.1\.1$/);await search.fill('');
 await page.locator('h1').click();await page.keyboard.down('Backspace');await expect(page.locator('.grid-reference')).toHaveText('M001/R.1');await page.keyboard.down('Backspace');await expect(page.locator('.grid-reference')).toHaveText('M001/R.1');await page.keyboard.up('Backspace');await page.reload();await expect(page.locator('.grid-reference')).toHaveText('M001/R.1');
 await page.locator('h1').click();await page.keyboard.press('Backspace');await expect(page.locator('.grid-reference')).toHaveText('M001/R');await page.keyboard.press('Backspace');await expect(page.locator('.grid-reference')).toHaveText('M001/R');
});
