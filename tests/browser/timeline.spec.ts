import {test,expect} from '@playwright/test';
import {seed,makeNode,backup,assignReferences} from '../../src/lib/model';

test.beforeEach(async({page})=>{
 const nodes=seed();
 nodes[1].title='Later task';nodes[1].dueDate='2027-01-20';
 nodes[2].title='Early task';nodes[2].dueDate='2026-01-02';nodes[2].priority='High';nodes[2].status='Blocked';
 const nested=makeNode('Completed nested task',nodes[1],0);nested.dueDate='2026-01-02';nested.status='Complete';nodes.push(nested);
 const other=makeNode('Other Mandala');other.dueDate='2026-01-01';nodes.push(other);
 await page.addInitScript(data=>{if(!localStorage.getItem('mandaloom-demo'))localStorage.setItem('mandaloom-demo',JSON.stringify(data));},backup(assignReferences(nodes).nodes));
});

test('desktop right rail shows all tasks chronologically, scopes to a Mandala and follows navigation and edits',async({page},testInfo)=>{
 await page.setViewportSize({width:1600,height:1000});await page.goto('/');
 const timeline=page.getByRole('complementary',{name:'Timeline'});
 await expect(timeline).toBeVisible();await expect(timeline.locator('.timeline-entry')).toHaveCount(11);
 await expect(timeline.locator('.timeline-group h3 time')).toHaveText(['1 Jan 2026','2 Jan 2026','20 Jan 2027']);
 await expect(timeline.locator('.timeline-group').last()).toContainText('Unscheduled');
 await expect(timeline.getByRole('button').filter({hasText:'Early task'})).toContainText('Blocked');
 await expect(timeline.getByRole('button').filter({hasText:'Early task'})).toContainText('High priority');
 await expect(timeline.getByRole('button').filter({hasText:'Completed nested task'})).toContainText('Complete');
 const mainBox=await page.locator('main.main').boundingBox(),railBox=await timeline.boundingBox();
 expect(mainBox!.x+mainBox!.width).toBeLessThanOrEqual(railBox!.x+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await timeline.getByLabel('Timeline scope').selectOption('current');await expect(timeline.locator('.timeline-entry')).toHaveCount(10);
 await timeline.getByRole('button').filter({hasText:'Completed nested task'}).click();
 await expect(page.locator('.grid-reference')).toHaveText('M001/R.1.1');
 await expect(timeline.locator('[aria-current="location"]')).toContainText('Completed nested task');
 await expect(timeline.locator('.timeline-entry')).toHaveCount(10);
 await page.getByRole('button',{name:'Edit objective',exact:true}).click();
 const editor=page.getByRole('dialog');await editor.getByLabel('Due date',{exact:true}).fill('2025-12-01');await editor.getByRole('button',{name:'Save changes'}).click();
 await expect(timeline.locator('.timeline-group h3 time').first()).toHaveText('1 Dec 2025');
 await expect(timeline.getByRole('button').filter({hasText:'Completed nested task'})).not.toContainText('Overdue');
 await page.screenshot({path:testInfo.outputPath('timeline-desktop.png'),fullPage:true});
 await page.reload();await expect(timeline.locator('.timeline-group h3 time').first()).toHaveText('1 Dec 2025');
});

test('mobile drawer is accessible, restores focus and closes when navigating',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 const trigger=page.getByRole('button',{name:'Open timeline'}),drawer=page.getByRole('dialog',{name:'Timeline'});
 await expect(trigger).toBeVisible();await expect(drawer).not.toBeVisible();
 await trigger.click();await expect(drawer).toBeVisible();await expect(trigger).toHaveAttribute('aria-expanded','true');
 await expect(drawer.locator('.timeline-entry')).toHaveCount(11);
 await page.keyboard.press('Backspace');await expect(page.locator('.grid-reference')).toHaveText('M001/R');
 await page.screenshot({path:testInfo.outputPath('timeline-mobile.png'),fullPage:true});
 await page.keyboard.press('Escape');await expect(drawer).not.toBeVisible();await expect(trigger).toBeFocused();
 await trigger.click();await drawer.getByRole('button').filter({hasText:'Early task'}).click();
 await expect(drawer).not.toBeVisible();await expect(page.locator('.grid-reference')).toHaveText('M001/R.2');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await trigger.click();await drawer.getByRole('button',{name:'Close timeline'}).click();await expect(drawer).not.toBeVisible();
 await trigger.click();await page.setViewportSize({width:1600,height:1000});
 await expect(page.getByRole('complementary',{name:'Timeline'})).toBeVisible();await expect(drawer).toHaveCount(0);
});
