#!/usr/bin/env node
// A tiny static server for development and checks: node tools/serve.mjs [port] [dir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const port=parseInt(process.argv[2]||'8713'),root=path.resolve(process.argv[3]||path.join(path.dirname(new URL(import.meta.url).pathname),'..'));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.mp4':'video/mp4','.json':'application/json','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain','.md':'text/markdown','.wasm':'application/wasm'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://x').pathname);
  if(p.endsWith('/'))p+='index.html';
  const file=path.join(root,p);
  if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);res.end('not found');return;}
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    res.end(data);
  });
}).listen(port,'127.0.0.1',()=>console.log(`serving ${root} at http://127.0.0.1:${port}/`));
