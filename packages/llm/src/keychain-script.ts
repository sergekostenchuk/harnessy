// JXA calls Security.framework directly. Payload travels only through private stdin/stdout;
// unlike `security add-generic-password -w`, no credential is ever a process argument.
export const KEYCHAIN_SCRIPT=String.raw`
ObjC.import('Foundation'); ObjC.import('Security');
function run() {
 try {
  var data=$.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  if(Number(data.length)>16384) return JSON.stringify({ok:false,code:'key_invalid'});
  var input=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data,$.NSUTF8StringEncoding)));
  var parts=typeof input.provider==='string'?input.provider.split(':'):[];
  if(parts.length<1 || parts.length>2 || !/^[a-z][a-z0-9_-]{0,63}$/.test(parts[0]) || ['__proto__','constructor','prototype'].indexOf(parts[0])>=0 || parts.length===2&&!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(parts[1]) || ['get','put','delete'].indexOf(input.op)<0) return JSON.stringify({ok:false,code:'key_invalid'});
  var query=$.NSMutableDictionary.alloc.init;
  // Security constants bridge as Ref pointers in JXA; use the string values from SecItem.h.
  query.setObjectForKey($('genp'),$('class'));
  query.setObjectForKey($('Harnessy API key'),$('svce'));
  query.setObjectForKey($(input.provider),$('acct'));
  var status=0, value=null;
  if(input.op==='put') {
   if(typeof input.key!=='string'||! /^[\x21-\x7e]{8,4096}$/.test(input.key)) return JSON.stringify({ok:false,code:'key_invalid'});
   var row={key:input.key,updatedAt:Date.now()};
   var payload=$(JSON.stringify(row)).dataUsingEncoding($.NSUTF8StringEncoding);
   query.setObjectForKey(payload,$('v_Data'));
   status=Number($.SecItemAdd(query,null));
   if(status===-25299 && parts.length===1) {
    query.removeObjectForKey($('v_Data'));
    var update=$.NSMutableDictionary.alloc.init; update.setObjectForKey(payload,$('v_Data'));
    status=Number($.SecItemUpdate(query,update));
   }
  } else if(input.op==='delete') {
   status=Number($.SecItemDelete(query)); if(status===-25300) status=0;
  } else {
   query.setObjectForKey($.NSNumber.numberWithBool(true),$('r_Data'));
   query.setObjectForKey($('m_LimitOne'),$('m_Limit'));
   var result=Ref(); status=Number($.SecItemCopyMatching(query,result));
   if(status===-25300) status=0;
   else if(status===0) {
    var found=ObjC.castRefToObject(result[0]);
    if(Number(found.length)>16384) return JSON.stringify({ok:false,code:'keystore_invalid'});
    value=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(found,$.NSUTF8StringEncoding)));
   }
  }
  if(status!==0) return JSON.stringify({ok:false,code:[-25293,-25308,-128].indexOf(status)>=0?'keystore_locked':'keystore_failed'});
  return JSON.stringify({ok:true,value:value});
 } catch(e) { return JSON.stringify({ok:false,code:'keystore_failed'}); }
}
`;
