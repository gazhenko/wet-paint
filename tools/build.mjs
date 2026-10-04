#!/usr/bin/env node
// Bundles the game into dist/: the site as-is for GitHub Pages, and a single self-contained
// WetPaint.html that runs from a double-click with no server (file:// forbids module imports,
// so three.js and every source module are inlined into one script).
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(path.join(dist,'site'),{recursive:true});
// the site: index + src + vendor
const copy=(from,to)=>{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
for(const f of ['index.html','LICENSE','README.md'])if(fs.existsSync(path.join(root,f)))copy(path.join(root,f),path.join(dist,'site',f));
for(const dir of ['src','vendor'])for(const f of fs.readdirSync(path.join(root,dir)))copy(path.join(root,dir,f),path.join(dist,'site',dir,f));
if(fs.existsSync(path.join(root,'docs/media')))for(const f of fs.readdirSync(path.join(root,'docs/media')))copy(path.join(root,'docs/media',f),path.join(dist,'site','docs/media',f));

// the single file: each module gets its own function scope (three.core and three.module share
// private top-level names), exports become returned objects, imports become destructuring.
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const exportList=src=>{const m=/^export \{([\s\S]*?)\};?$/m.exec(src);return m?m[1].split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.split(' as ').pop().trim()):[];};
const stripExports=src=>src.replace(/^export \{[\s\S]*?\};?$/mg,'');
const core=read('vendor/three.core.js');
const mod=read('vendor/three.module.js');
const coreNames=exportList(core);
const modImport=/^import \{([^}]*)\} from '\.\/three\.core\.js';/m.exec(mod)[1];
// three.module.js has two export statements: a re-export of the core (removed) and its own list
const modBody=mod.replace(/^import \{[^}]*\} from '\.\/three\.core\.js';/m,'').replace(/^export \{[^}]*\} from '\.\/three\.core\.js';/m,'');
const modNames=exportList(modBody);
let bundle='';
bundle+=`const __core=(function(){\n${stripExports(core)}\nreturn {${coreNames.join(',')}};\n})();\n`;
bundle+=`const __three=(function(){\nconst {${modImport}}=__core;\n${stripExports(modBody)}\nreturn {${modNames.join(',')}};\n})();\n`;
bundle+='const THREE=Object.assign({},__core,__three);\n';
// the game modules: strip imports, turn exports into a shared namespace per module
const order=['util','noise','shaders','world','kiki','flight','audio','game','main'];
for(const m of order){
  let src=read(`src/${m}.js`);
  src=src.replace(/^import \* as THREE from 'three';\s*$/m,'');
  src=src.replace(/^import \{([^}]*)\} from '\.\/(\w+)\.js';\s*$/mg,(_,names,mod)=>`const {${names}}=__${mod};`);
  src=src.replace(/^export (const|let|class|function) /mg,'$1 ');
  const exported=[...src.matchAll(/^(?:const|let|class|function) (\w+)/mg)].map(x=>x[1]);
  const exportNames=[...read(`src/${m}.js`).matchAll(/^export (?:const|let|class|function) (\w+)/mg)].map(x=>x[1]);
  bundle+=`const __${m}=(function(){\n${src}\nreturn {${exportNames.join(',')}};\n})();\n`;
  void exported;
}
let html=read('index.html');
html=html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/,'');
// a function replacer: the bundle contains "$'" sequences that a replacement string would expand
const inline='<script>\n'+bundle.replace(/<\/script/g,'<\\/script')+'\n</script>';
html=html.replace(/<script type="module" src="\.\/src\/main\.js"><\/script>/,()=>inline);
fs.writeFileSync(path.join(dist,'WetPaint.html'),html);
const size=fs.statSync(path.join(dist,'WetPaint.html')).size;
console.log(`dist/WetPaint.html ${(size/1048576).toFixed(2)} MB; dist/site ready`);
