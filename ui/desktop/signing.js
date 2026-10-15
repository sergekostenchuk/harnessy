const fs=require('node:fs');

const REQUIRED=['CSC_LINK','CSC_KEY_PASSWORD','APPLE_API_KEY','APPLE_API_KEY_ID','APPLE_API_ISSUER'];
function requireSigningEnvironment(env=process.env,exists=fs.existsSync){
  const missing=REQUIRED.filter(name=>typeof env[name]!=='string'||!env[name].trim());
  if(missing.length)throw Error('Подписанная сборка остановлена: задайте '+missing.join(', '));
  if(!exists(env.APPLE_API_KEY))throw Error('Подписанная сборка остановлена: APPLE_API_KEY должен указывать на доступный файл .p8');
  return true;
}
if(require.main===module){
  try{requireSigningEnvironment()}catch(error){console.error(error.message);process.exitCode=1}
}
module.exports={REQUIRED,requireSigningEnvironment};
