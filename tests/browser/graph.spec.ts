import {test,expect} from '@playwright/test';
import {seed,makeNode,backup,assignReferences,positions} from '../../src/lib/model';

test.beforeEach(async({page})=>{
 const nodes=seed();
 for(let i=1;i<=8;i++)for(let j=0;j<8;j++)nodes.push(makeNode(i===1&&j===0?'Setup review':`Task ${i}.${j+1}`,nodes[i],positions[j]));
 const setup=nodes.find(n=>n.title==='Setup review')!;setup.status='In progress';setup.priority='High';setup.dueDate='2026-11-11';
 nodes.push(makeNode('Deep setup review',setup,0));
 const other=makeNode('Another Mandala');nodes.push(other,makeNode('Other-root task',other,0));
 await page.addInitScript(data=>{if(!localStorage.getItem('mandaloom-demo'))localStorage.setItem('mandaloom-demo',JSON.stringify(data));},backup(assignReferences(nodes).nodes));
});

test('graph shows real hierarchy, collapses branches, navigates and edits existing objectives',async({page},testInfo)=>{
 await page.setViewportSize({width:1600,height:1000});await page.goto('/');
 await page.getByRole('button',{name:'Graph view',exact:true}).click();
 const graph=page.getByRole('region',{name:'Graph view'}),canvas=graph.getByRole('group',{name:'Objective graph',exact:true});
 await expect(graph).toBeVisible();await expect(page.locator('.mandala-grid')).toHaveCount(0);
 await expect(canvas.locator('[data-graph-node]')).toHaveCount(74);await expect(canvas.locator('.graph-edge')).toHaveCount(73);
 await expect(graph.locator('.graph-count')).toHaveText('74 of 74 objectives visible');
 await canvas.getByRole('button',{name:'Select M001/R.1 Trading Strategy',exact:true}).click();
 await expect(page.locator('.grid-reference')).toHaveText('M001/R.1');
 await graph.getByRole('button',{name:'Collapse branch',exact:true}).click();await expect(canvas.locator('[data-graph-node]')).toHaveCount(65);
 await graph.getByRole('button',{name:'Expand branch',exact:true}).click();await expect(canvas.locator('[data-graph-node]')).toHaveCount(74);
 await graph.getByRole('button',{name:'Collapse branches',exact:true}).click();await expect(canvas.locator('[data-graph-node]')).toHaveCount(9);
 await graph.getByRole('button',{name:'Expand all',exact:true}).click();await expect(canvas.locator('[data-graph-node]')).toHaveCount(74);
 await page.screenshot({path:testInfo.outputPath('graph-desktop.png'),fullPage:true});
 const setup=canvas.getByRole('button',{name:'Select M001/R.1.1 Setup review',exact:true});
 await setup.focus();await page.keyboard.press('Enter');await expect(page.locator('.grid-reference')).toHaveText('M001/R.1.1');
 await expect(graph.locator('.graph-selection')).toContainText('In progress · High priority · Due 2026-11-11');
 await graph.getByRole('button',{name:'Edit selected objective',exact:true}).click();
 const editor=page.getByRole('dialog');await editor.getByLabel('Title',{exact:true}).fill('Updated setup review');await editor.getByRole('button',{name:'Save changes'}).click();
 await expect(canvas.getByRole('button',{name:'Select M001/R.1.1 Updated setup review',exact:true})).toBeVisible();
 await graph.getByRole('button',{name:'Open Mandala view',exact:true}).click();
 await expect(page.locator('.mandala-grid')).toBeVisible();await expect(page.locator('.center-cell h2')).toHaveText('Updated setup review');
 await expect(page.locator('.center-cell')).toContainText('In progress');await expect(page.locator('.center-cell')).toContainText('High priority');
 await page.getByRole('button',{name:'Graph view',exact:true}).click();await page.reload();
 await expect(page.getByRole('button',{name:'Graph view',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.grid-reference')).toHaveText('M001/R.1.1');await expect(canvas.locator('[data-graph-node]')).toHaveCount(74);
 await page.getByRole('complementary',{name:'Timeline'}).getByRole('button').filter({hasText:'Another Mandala'}).click();
 await expect(page.locator('.grid-reference')).toHaveText('M002/R');await expect(canvas.locator('[data-graph-node]')).toHaveCount(2);
});

test('graph camera controls, labels and responsive navigation work on mobile',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'Graph view',exact:true}).click();
 const graph=page.getByRole('region',{name:'Graph view'}),canvas=graph.getByRole('group',{name:'Objective graph',exact:true});
 await expect(canvas.locator('[data-graph-node]')).toHaveCount(74);
 const camera=canvas.locator('.graph-camera'),initial=await camera.getAttribute('transform');
 await graph.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(camera).not.toHaveAttribute('transform',initial!);
 await graph.getByRole('button',{name:'Fit graph to screen'}).click();await expect(camera).toHaveAttribute('transform',initial!);
 await canvas.focus();await page.keyboard.press('ArrowRight');await expect(camera).not.toHaveAttribute('transform',initial!);await page.keyboard.press('0');await expect(camera).toHaveAttribute('transform',initial!);
 await canvas.scrollIntoViewIfNeeded();const bounds=(await canvas.boundingBox())!;
 await page.mouse.move(bounds.x+15,bounds.y+70);await page.mouse.down();await page.mouse.move(bounds.x+55,bounds.y+100);await page.mouse.up();
 await expect(camera).not.toHaveAttribute('transform',initial!);
 await graph.getByRole('button',{name:'Fit graph to screen'}).click();
 await graph.getByLabel('Labels',{exact:true}).uncheck();await expect(canvas.locator('.graph-node-label')).toHaveCount(0);
 await graph.getByLabel('Labels',{exact:true}).check();await expect(canvas.locator('.graph-node-label').first()).toBeVisible();
 await graph.getByRole('button',{name:'Collapse branches',exact:true}).click();await expect(canvas.locator('[data-graph-node]')).toHaveCount(9);
 await page.screenshot({path:testInfo.outputPath('graph-mobile.png'),fullPage:true});
 await graph.getByRole('button',{name:'Expand all',exact:true}).click();
 await page.getByRole('button',{name:'Open timeline'}).click();
 await page.getByRole('dialog',{name:'Timeline'}).getByRole('button').filter({hasText:'Deep setup review'}).click();
 await expect(page.locator('.grid-reference')).toHaveText('M001/R.1.1.1');await expect(graph).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Mandala view',exact:true}).click();await expect(page.locator('.mandala-grid')).toBeVisible();
});
