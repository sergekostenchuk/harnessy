import {renderMarkdown,markdownVisible} from '../../context/src/markdown.js';

// Small DOM/event surface for exercising the shipped UI handlers together, without a browser dependency.
type Listener={fn:(e:any)=>any;capture:boolean};
const decode=(s:string)=>s.replace(/&(amp|lt|gt|quot);/g,(_,v)=>({amp:'&',lt:'<',gt:'>',quot:'"'}[v as 'amp']));
const encode=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
const key=(s:string)=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
export class DomNode {
 tagName:string;attributes:Record<string,string>={};dataset:Record<string,string>={};style:Record<string,string>={};children:DomNode[]=[];parentElement:DomNode|null=null;private _value='';text='';selectionStart=0;selectionEnd=0;selectionDirection='none';scrollTop=0;listeners=new Map<string,Listener[]>();owner:DomNode;activeElement:DomNode|null=null;defaultView:any=null;HARNESS_MARKDOWN:any=null;
 constructor(tag='div',owner?:DomNode){this.tagName=tag.toUpperCase();this.owner=owner??this}
 get value(){return this._value}set value(v:string){this._value=String(v);this.selectionStart=this.selectionEnd=this._value.length}
 get className(){return this.attributes.class??''}set className(v:string){this.attributes.class=v}
 get id(){return this.attributes.id??''}set id(v:string){this.attributes.id=v}
 get title(){return this.attributes.title??''}set title(v:string){this.attributes.title=v}
 get classList(){return {contains:(v:string)=>this.className.split(/\s+/).includes(v),add:(...vs:string[])=>{for(const v of vs)this.classList.toggle(v,true)},remove:(...vs:string[])=>{for(const v of vs)this.classList.toggle(v,false)},toggle:(v:string,on?:boolean)=>{const values=new Set(this.className.split(/\s+/).filter(Boolean)),want=on??!values.has(v);if(want)values.add(v);else values.delete(v);this.className=[...values].join(' ');return want}}}
 get isConnected():boolean{return this===this.owner||!!this.parentElement?.isConnected}
 get firstElementChild():DomNode|null{return this.children.find(n=>n.tagName!=='#TEXT')??null}
 get firstChild():DomNode|null{return this.children[0]??null}
 get previousElementSibling():DomNode|null {const siblings=this.parentElement?.children.filter(n=>n.tagName!=='#TEXT')??[];return siblings[siblings.indexOf(this)-1]??null}
 get checked(){return this.hasAttribute('checked')}set checked(on:boolean){if(on)this.setAttribute('checked','');else delete this.attributes.checked}
 get disabled(){return this.hasAttribute('disabled')}set disabled(on:boolean){if(on)this.setAttribute('disabled','');else delete this.attributes.disabled}
 get textContent():string{return this.tagName==='#TEXT'?this.text:this.children.map(n=>n.textContent).join('')}
 set textContent(v:string){this.children=[];const n=new DomNode('#text',this.owner);n.text=v;this.appendChild(n)}
 get innerHTML():string{return this.children.map(n=>n.outerHTML).join('')}
 set innerHTML(html:string){for(const n of this.children)n.parentElement=null;this.children=[];const stack:DomNode[]=[this];for(const token of html.match(/<[^>]*>|[^<]+/g)??[]){if(token.startsWith('<!--'))continue;if(token.startsWith('</')){const closed=stack.pop();if(closed?.tagName==='TEXTAREA')closed.value=closed.textContent;continue}const parent=stack.at(-1)??this;
  if(token.startsWith('<')){const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const n=new DomNode(tag,this.owner);for(const a of token.slice(tag.length+1).matchAll(/([\w:-]+)(?:="([^"]*)"|='([^']*)'|=([^\s>]+))?/g)){if(a[1]==='/')continue;n.setAttribute(a[1]!,decode(a[2]??a[3]??a[4]??''))}n.value=n.attributes.value??'';parent.appendChild(n);if(!/\/$/.test(token.slice(0,-1))&&!/^(input|br|hr|img|meta|link)$/i.test(tag))stack.push(n)}
  else {const n=new DomNode('#text',this.owner);n.text=decode(token);parent.appendChild(n)}}}
 get outerHTML():string{if(this.tagName==='#TEXT')return encode(this.text);const tag=this.tagName.toLowerCase();return '<'+tag+Object.entries(this.attributes).map(([k,v])=>' '+k+'="'+encode(v)+'"').join('')+'>'+this.innerHTML+(/^(input|br|hr|img|meta|link)$/.test(tag)?'':'</'+tag+'>')}
 set outerHTML(v:string){const parent=this.parentElement;if(!parent)return;const temp=new DomNode('div',this.owner);temp.innerHTML=v;const at=parent.children.indexOf(this);for(const n of temp.children)n.parentElement=parent;parent.children.splice(at,1,...temp.children);this.parentElement=null}
 setAttribute(name:string,v:string){this.attributes[name]=v;if(name.startsWith('data-'))this.dataset[key(name.slice(5))]=v;if(name==='style')for(const [k,value] of v.split(';').map(s=>s.split(':')))if(k?.trim())this.style[key(k.trim())]=value?.trim()??''}
 removeAttribute(name:string){delete this.attributes[name];if(name.startsWith('data-'))delete this.dataset[key(name.slice(5))]}
 getAttribute(name:string){return this.attributes[name]??null}hasAttribute(name:string){return name in this.attributes}
 appendChild(n:DomNode){n.parentElement=this;this.children.push(n);return n}
 insertBefore(n:DomNode,anchor:DomNode|null){if(!anchor)return this.appendChild(n);const at=this.children.indexOf(anchor);if(at<0)throw Error('missing anchor');n.remove();n.parentElement=this;this.children.splice(at,0,n);return n}
 before(n:DomNode){this.parentElement?.insertBefore(n,this)}
 after(n:DomNode){const parent=this.parentElement;if(!parent)return;const at=parent.children.indexOf(this);n.remove();n.parentElement=parent;parent.children.splice(at+1,0,n)}
 replaceWith(n:DomNode){this.before(n);this.remove()}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null}
 contains(n:DomNode):boolean{return n===this||this.children.some(c=>c.contains(n))}
 matches(selector:string):boolean{return selector.split(',').some(s=>this.matchChain(s.trim()))}
 private matchSimple(s:string):boolean{if(this.tagName==='#TEXT')return false;for(const m of s.matchAll(/:not\(([^)]+)\)/g))if(this.matchSimple(m[1]!))return false;s=s.replace(/:not\([^)]+\)/g,'');for(const a of s.matchAll(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/g)){const v=this.getAttribute(a[1]!);if(v===null||a[2]!==undefined&&v!==a[2])return false}s=s.replace(/\[[^\]]+\]/g,'');for(const c of s.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(c[1]!))return false;for(const id of s.matchAll(/#([\w-]+)/g))if(this.id!==id[1])return false;const tag=s.match(/^[\w-]+/)?.[0];return !tag||tag.toUpperCase()===this.tagName}
 private matchChain(selector:string):boolean{const tokens=selector.replace(/\s*>\s*/g,' > ').split(/\s+(?![^\[]*\])/);let node:DomNode|null=this;if(!node.matchSimple(tokens.pop()!))return false;while(tokens.length){const t=tokens.pop()!;if(t==='>'){node=node.parentElement;if(!node||!node.matchSimple(tokens.pop()!))return false}else {node=node.parentElement;while(node&&!node.matchSimple(t))node=node.parentElement;if(!node)return false}}return true}
 closest(selector:string):DomNode|null{let node:DomNode|null=this;while(node){if(node.matches(selector))return node;node=node.parentElement}return null}
 querySelectorAll(selector:string):DomNode[]{return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)])}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null}
 createElement(tag:string){return new DomNode(tag,this.owner)}
 getElementById(id:string){return this.querySelector('#'+id)}
 insertAdjacentHTML(where:string,html:string){const temp=new DomNode('div',this.owner);temp.innerHTML=html;for(const n of [...temp.children]){if(where==='beforeend')this.appendChild(n);else throw Error('unsupported position '+where)}}
 focus(){this.owner.activeElement=this}setSelectionRange(start:number,end:number,direction='none'){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction}
 showModal(){this.setAttribute('open','')}close(){this.removeAttribute('open')}
 offsetWidth=1000;offsetHeight=800;
 getBoundingClientRect(){return {left:0,top:0,width:this.offsetWidth,height:this.offsetHeight}}
 addEventListener(type:string,fn:(e:any)=>any,capture=false){const listeners=this.listeners.get(type)??[];listeners.push({fn,capture});this.listeners.set(type,listeners)}
 removeEventListener(type:string,fn:(e:any)=>any,capture=false){this.listeners.set(type,(this.listeners.get(type)??[]).filter(l=>l.fn!==fn||l.capture!==capture))}
 async emit(type:string,fields:Record<string,any>={}){const path:DomNode[]=[];for(let n:DomNode|null=this;n;n=n.parentElement)path.push(n);let stopped=false,immediate=false,prevented=false;const e={type,target:this,...fields,preventDefault(){prevented=true},stopPropagation(){stopped=true},stopImmediatePropagation(){stopped=immediate=true}};const pending:any[]=[];
  const invoke=(n:DomNode,capture:boolean)=>{for(const l of [...n.listeners.get(type)??[]]){if(l.capture!==capture)continue;pending.push(l.fn(e));if(immediate)break}};
  for(const n of [...path].reverse()){invoke(n,true);if(stopped)break}if(!stopped)for(const n of path){invoke(n,false);if(stopped)break}await Promise.all(pending);return {prevented,stopped}
 }
}
export function dom(html:string){const document=new DomNode('#document'),window=new DomNode('#window',document);document.parentElement=window;document.defaultView=window;window.HARNESS_MARKDOWN={renderMarkdown,markdownVisible};document.innerHTML='<html><body>'+html+'</body></html>';return {document,window,html:document.querySelector('html')!,body:document.querySelector('body')!}}
