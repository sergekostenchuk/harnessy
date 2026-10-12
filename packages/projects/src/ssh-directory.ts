import {lstatSync,realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

/** Shared by SSH settings validation and the tunnel launch; never follows a substituted root. */
export function trustedSshDirectory(home=homedir(),uid=process.getuid?.()){
 const directory=join(home,'.ssh'),stat=lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||uid===undefined||stat.uid!==uid||(stat.mode&0o022)!==0)throw Error('SSH directory is not trusted');
 const path=realpathSync(directory),after=lstatSync(directory);
 if(!after.isDirectory()||after.isSymbolicLink()||after.uid!==uid||(after.mode&0o022)!==0||after.dev!==stat.dev||after.ino!==stat.ino)throw Error('SSH directory changed');
 return {path,stat:after};
}
