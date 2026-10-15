const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

function verifySignedBundles(root=path.join(__dirname,'release'),run=execFileSync){
  const apps=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    if(!entry.isDirectory()||!/^mac(?:-|$)/.test(entry.name))continue;
    for(const app of fs.readdirSync(path.join(root,entry.name),{withFileTypes:true})){
      if(app.isDirectory()&&app.name.endsWith('.app'))apps.push(path.join(root,entry.name,app.name));
    }
  }
  if(!apps.length)throw Error('Подписанная сборка не найдена: нет .app для проверки');
  for(const app of apps){
    try{
      run('codesign',['--verify','--deep','--strict',app],{stdio:'pipe'});
      run('spctl',['--assess','--type','execute',app],{stdio:'pipe'});
      run('xcrun',['stapler','validate',app],{stdio:'pipe'});
    }catch{
      throw Error('Подпись или нотаризация приложения не подтверждены');
    }
  }
  return apps.length;
}

if(require.main===module){
  try{verifySignedBundles()}catch(error){console.error(error.message);process.exitCode=1}
}
module.exports={verifySignedBundles};
