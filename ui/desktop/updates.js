// Desktop-only update state. The release repository name is deliberately
// unconfirmed; no request is sent until the owner replaces the placeholder.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

const RELEASE_REPOSITORY='harnessy-releases';
const CHECK_INTERVAL_MS=6*60*60*1000;
const validChannel=value=>value==='beta'||value==='latest';
const repositoryConfigured=()=>RELEASE_REPOSITORY!=='OWNER_CONFIRM_RELEASE_REPOSITORY';
function trustedUpdateOrigin(url,origin){
  try{
    const actual=new URL(url),expected=new URL(origin);
    return actual.origin===expected.origin&&actual.protocol==='http:'&&['127.0.0.1','localhost'].includes(actual.hostname);
  }catch{return false}
}

function readChannel(file){
  try{const data=JSON.parse(fs.readFileSync(file,'utf8'));return validChannel(data.channel)?data.channel:'latest'}catch{return 'latest'}
}
function saveChannel(file,channel){
  const directory=path.dirname(file),temporary=file+'.'+randomUUID()+'.tmp';
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  try{fs.writeFileSync(temporary,JSON.stringify({channel})+'\n',{flag:'wx',mode:0o600});fs.renameSync(temporary,file)}
  finally{try{fs.unlinkSync(temporary)}catch{}}
}

class DesktopUpdates {
  constructor(options){
    this.updater=options.updater;
    this.packaged=options.packaged===true;
    this.repositoryReady=options.repositoryReady??repositoryConfigured();
    this.file=options.file;
    this.log=options.log??(()=>{});
    this.notify=options.notify??(()=>{});
    this.stopEngine=options.stopEngine??(async()=>{});
    this.resumeEngine=options.resumeEngine??(async()=>{});
    this.allowQuit=options.allowQuit??(()=>{});
    this.setInterval=options.setInterval??setInterval;
    this.clearInterval=options.clearInterval??clearInterval;
    this.channel=readChannel(this.file);
    this.readyVersion=null;
    this.checking=false;
    this.installing=false;
    this.attempt=null;
    this.error=null;
    this.generation=0;
    this.timer=null;
    this.inflight=null;
  }
  state(){return {channel:this.channel,configured:this.repositoryReady,packaged:this.packaged,readyVersion:this.readyVersion,checking:this.checking,installing:this.installing,error:this.error}}
  emit(){this.notify(this.state())}
  configure(){
    this.updater.autoDownload=true;
    this.updater.autoInstallOnAppQuit=false;
    this.updater.allowPrerelease=this.channel==='beta';
    this.updater.channel=this.channel;
    this.updater.allowDowngrade=false;
  }
  start(){
    this.configure();
    this.updater.on('update-downloaded',info=>{
      const version=typeof info?.version==='string'?info.version:'';
      if(!version||this.channel==='latest'&&version.includes('-'))return;
      this.readyVersion=version;this.error=null;this.emit();
    });
    this.updater.on('error',()=>{
      if(this.attempt){
        this.attempt.failed=true;
        if(this.attempt.phase==='native')void this.recoverInstall(this.attempt);
        return;
      }
      this.error='Не удалось проверить обновления';this.checking=false;this.emit();this.log('обновления: проверка не удалась');
    });
    this.emit();
    if(!this.packaged||!this.repositoryReady)return;
    void this.check();
    this.timer=this.setInterval(()=>void this.check(),CHECK_INTERVAL_MS);
  }
  async check(){
    if(!this.packaged||!this.repositoryReady)return null;
    if(this.inflight)return this.inflight;
    const generation=this.generation;
    this.checking=true;this.error=null;this.emit();
    const pending=Promise.resolve().then(()=>this.updater.checkForUpdates()).catch(()=>{
      if(generation===this.generation){this.error='Не удалось проверить обновления';this.log('обновления: проверка не удалась')}
      return null;
    }).finally(()=>{
      if(this.inflight===pending)this.inflight=null;
      if(generation===this.generation){this.checking=false;this.emit()}
      else void this.check();
    });
    this.inflight=pending;
    return pending;
  }
  async setChannel(channel){
    if(!validChannel(channel))throw Error('Неизвестный канал обновлений');
    if(this.installing)throw Error('Обновление уже устанавливается');
    if(channel===this.channel)return this.state();
    saveChannel(this.file,channel);
    this.channel=channel;this.generation++;this.readyVersion=null;this.error=null;this.configure();this.emit();
    if(this.packaged&&this.repositoryReady)void this.check();
    return this.state();
  }
  async install(){
    if(!this.readyVersion||this.installing||!this.packaged||!this.repositoryReady)throw Error('Обновление ещё не готово');
    const attempt={phase:'stopping',failed:false,recovering:null,nativeListeners:null};
    this.attempt=attempt;this.installing=true;this.error=null;this.emit();
    try{
      await this.stopEngine();
      if(attempt.failed)throw Error('Проверка обновления не удалась при остановке движка');
      this.allowQuit(true);
      attempt.phase='native';
      const native=this.updater.nativeUpdater;
      if(native?.listeners&&native?.removeListener)attempt.nativeListeners=native.listeners('update-downloaded');
      this.updater.quitAndInstall(false,true);
      if(attempt.failed){await this.recoverInstall(attempt);throw Error(this.error)}
      return true;
    }catch(error){
      await this.recoverInstall(attempt);
      throw Error(this.error);
    }
  }
  async recoverInstall(attempt){
    if(this.attempt!==attempt)return attempt.recovering;
    if(attempt.recovering)return attempt.recovering;
    attempt.failed=true;
    attempt.recovering=(async()=>{
      this.allowQuit(false);
      const native=this.updater.nativeUpdater;
      if(attempt.nativeListeners&&native?.listeners&&native?.removeListener){
        for(const listener of native.listeners('update-downloaded')){
          if(!attempt.nativeListeners.includes(listener))native.removeListener('update-downloaded',listener);
        }
      }
      try{await this.resumeEngine()}catch{this.log('обновления: движок не перезапустился')}
      if(this.attempt!==attempt)return;
      this.attempt=null;this.installing=false;
      this.error='Не удалось перезапустить приложение для обновления';this.log('обновления: перезапуск не удался');this.emit();
    })();
    return attempt.recovering;
  }
  dispose(){if(this.timer!==null){this.clearInterval(this.timer);this.timer=null}}
}

module.exports={CHECK_INTERVAL_MS,DesktopUpdates,RELEASE_REPOSITORY,readChannel,repositoryConfigured,saveChannel,trustedUpdateOrigin};
