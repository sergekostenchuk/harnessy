const {spawnSync}=require('node:child_process');
const path=require('node:path');

module.exports=async function forbiddenOutputAfterPack(context){
  const resources=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app','Contents','Resources');
  const guard=path.resolve(__dirname,'../deploy/forbidden_guard.py');
  const checked=spawnSync('python3',[guard,resources],{encoding:'utf8'});
  if(checked.stdout)process.stdout.write(checked.stdout);
  if(checked.error)throw checked.error;
  if(checked.status!==0)throw new Error((checked.stderr||'Страж приватных данных отклонил бандл').trim());
};
