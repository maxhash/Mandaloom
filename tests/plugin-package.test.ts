import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {parse} from 'yaml';

test('private plugin package metadata, registered app binding, skill and assets are self-contained',async()=>{
 const root=resolve('plugin/mandaloom');const manifest=JSON.parse(await readFile(resolve(root,'plugin.json'),'utf8'));
 assert.equal(manifest.$schema,'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');assert.equal(manifest.name,'mandaloom');assert.match(manifest.version,/^\d+\.\d+\.\d+$/);
 const ui=manifest.extensions['com.openai'].interface;assert.ok(ui.shortDescription.length<=30);assert.equal(ui.category,'Business & Operations');
 assert.equal(manifest.mcpServers,undefined);assert.equal(manifest.skills,undefined);
 for(const asset of [ui.logo,ui.composerIcon]){const path=resolve(root,asset);assert.ok(path.startsWith(root+sep));assert.ok((await stat(path)).size>0);}
 const config=JSON.parse(await readFile(resolve(root,'mcp.json'),'utf8'));assert.equal(config.$schema,'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');assert.deepEqual(config.mcpServers,{});
 assert.equal(manifest.extensions['com.openai'].apps,'./.app.json');
 const apps=JSON.parse(await readFile(resolve(root,'.app.json'),'utf8'));assert.equal(apps.apps['dev-6aee4a78df248191b643e2f22f5f9b95'].id,'asdk_app_6aee4a78df248191b643e2f22f5f9b95');
 const skill=await readFile(resolve(root,'skills/manage-mandalas/SKILL.md'),'utf8');const match=skill.match(/^---\r?\n([\s\S]*?)\r?\n---/);assert.ok(match);const metadata=parse(match[1]);assert.equal(metadata.name,'manage-mandalas');assert.equal(typeof metadata.description,'string');assert.ok(metadata.description.length>0);
});
