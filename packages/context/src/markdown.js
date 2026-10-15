const normalize=value=>String(value??'').replace(/\r\n?/g,'\n');
const defaultEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/**
 * Parse Harnessy Markdown once and derive both the window HTML and the exact
 * semantic text that can be selected for a trusted quote.
 *
 * @param {unknown} value
 * @param {{escape?:(value:unknown)=>string,path?:(value:string)=>string|null,artifact?:(path:string,label:string)=>string,link?:(label:string,target:string,image:boolean)=>string}} hooks
 * @returns {{html:string,visible:string}}
 */
export function renderMarkdown(value,hooks={}) {
 const escape=hooks.escape||defaultEscape,path=hooks.path||(()=>null),artifact=hooks.artifact||((_path,label)=>'<code>'+escape(label)+'</code>'),link=hooks.link||((label,target)=>escape(label||target));
 const inline=(text,depth=0)=>{
  if(depth>8)return {html:escape(text),visible:text};
  const re=/\\([\\`*_\[\]{}()#+.!|>-])|(`+)([^`]*?)\2|(!?)\[([^\]\n]*)\]\((<[^>\n]*>|[^\s)]*)(?:\s+"[^"\n]*")?\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|<((?:https?:\/\/|mailto:)[^<>\s]+)>|https?:\/\/[^\s<>]+|(?:artifacts|docs)\/[^\s<>`*|)]+/g;
  let html='',visible='',at=0;
  for(const match of text.matchAll(re)){
   const index=match.index??0,plain=text.slice(at,index);html+=escape(plain);visible+=plain;at=index+match[0].length;
   if(match[1]!==undefined){html+=escape(match[1]);visible+=match[1];continue}
   if(match[2]!==undefined){const code=match[3]||'',file=path(code);html+=file&&(file.includes('/')||/\.(?:md|txt|csv|json|pdf|png|jpe?g|gif|webp|mp4|webm|docx|xlsx|pptx)$/i.test(file))?artifact(file,code):'<code>'+escape(code)+'</code>';visible+=code;continue}
   if(match[4]!==undefined){const label=match[5]||'',target=(match[6]||'').replace(/^<|>$/g,'');html+=link(label,target,!!match[4]);visible+=label||target;continue}
   if(match[7]||match[8]){const child=inline(match[7]||match[8],depth+1);html+='<strong>'+child.html+'</strong>';visible+=child.visible;continue}
   if(match[9]||match[10]){const child=inline(match[9]||match[10],depth+1);html+='<em>'+child.html+'</em>';visible+=child.visible;continue}
   const raw=match[11]||match[0],url=raw.replace(/[.,;!?]+$/,'');html+=link(url,url,false)+escape(raw.slice(url.length));visible+=raw;
  }
  const tail=text.slice(at);return {html:html+escape(tail),visible:visible+tail};
 };
 const cells=line=>{const result=[];let cell='',code=false;line=line.trim().replace(/^\|/,'').replace(/\|$/,'');for(let index=0;index<line.length;index++){const char=line[index];if(char==='\\'&&line[index+1]==='|'){cell+='|';index++}else if(char==='`'){code=!code;cell+=char}else if(char==='|'&&!code){result.push(cell.trim());cell=''}else cell+=char}result.push(cell.trim());return result};
 const highlight=(code,language)=>{if(!/^(?:js|javascript|ts|typescript|json|py|python|sh|bash|sql|css|html|xml)$/.test(language))return escape(code);const re=/(?:\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|async|await|if|else|for|while|class|new|import|export|from|def|print|None|True|False|true|false|null|select|SELECT|where|WHERE|CREATE|TABLE)\b|\b\d+(?:\.\d+)?\b/g;let html='',at=0;for(const match of code.matchAll(re)){const index=match.index??0;html+=escape(code.slice(at,index));at=index+match[0].length;const kind=/^(\/\/|#|\/\*)/.test(match[0])?'comment':/^[\'\"]/.test(match[0])?'string':/^\d/.test(match[0])?'number':'keyword';html+='<span class="md-'+kind+'">'+escape(match[0])+'</span>'}return html+escape(code.slice(at))};
 const blocks=(lines,depth)=>{
  if(depth>12)return {html:'<p>'+escape(lines.join('\n'))+'</p>',visible:lines.join('\n')};
  let html='',visible=[],index=0;const list=/^(\s*)([-+*]|\d+[.)])\s+(.*)$/,special=line=>/^\s*(?:#{1,6}\s|>|`{3,}|~{3,}|[-+*]\s|\d+[.)]\s|(?:[-*_]\s*){3,}$)/.test(line);
  while(index<lines.length){let line=lines[index];if(!line.trim()){index++;continue}let match;
   if(match=line.match(/^\s*(`{3,}|~{3,})([^\s]*)\s*$/)){const marker=match[1][0],count=match[1].length,language=/^[a-z\d_+-]{0,32}$/i.test(match[2])?match[2].toLowerCase():'',body=[];index++;while(index<lines.length&&!new RegExp('^\\s*'+marker+'{'+count+',}\\s*$').test(lines[index]))body.push(lines[index++]);if(index<lines.length)index++;const code=body.join('\n');html+='<div class="md-code"><div class="md-code-head"><span>'+escape(language||'текст')+'</span><button type="button" data-md-copy>копировать</button></div><pre><code'+(language?' class="language-'+escape(language)+'"':'')+'>'+highlight(code,language)+'</code></pre></div>';visible.push(code);continue}
   if(match=line.match(/^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/)){const child=inline(match[2]);html+='<h'+match[1].length+'>'+child.html+'</h'+match[1].length+'>';visible.push(child.visible);index++;continue}
   if(/^\s*(?:\*\s*){3,}$|^\s*(?:-\s*){3,}$|^\s*(?:_\s*){3,}$/.test(line)){html+='<hr>';index++;continue}
   if(/^\s*>/.test(line)){const body=[];while(index<lines.length&&/^\s*>/.test(lines[index]))body.push(lines[index++].replace(/^\s*>\s?/,''));const child=blocks(body,depth+1);html+='<blockquote>'+child.html+'</blockquote>';if(child.visible)visible.push(child.visible);continue}
   if(index+1<lines.length&&line.includes('|')){const head=cells(line),separator=cells(lines[index+1]);if(head.length===separator.length&&separator.every(cell=>/^:?-{3,}:?$/.test(cell))){index+=2;const headParts=head.map(cell=>inline(cell));html+='<div class="md-table" role="region" aria-label="Таблица" tabindex="0"><table><thead><tr>'+headParts.map((cell,column)=>'<th scope="col"'+(separator[column].endsWith(':')?' class="'+(separator[column].startsWith(':')?'md-center':'md-right')+'"':'')+'>'+cell.html+'</th>').join('')+'</tr></thead><tbody>';const tableVisible=[headParts.map(cell=>cell.visible).join(' ')];while(index<lines.length&&lines[index].trim()&&lines[index].includes('|')){const row=cells(lines[index++]),parts=head.map((_,column)=>inline(row[column]||''));html+='<tr>'+parts.map((cell,column)=>'<td'+(separator[column].endsWith(':')?' class="'+(separator[column].startsWith(':')?'md-center':'md-right')+'"':'')+'>'+cell.html+'</td>').join('')+'</tr>';tableVisible.push(parts.map(cell=>cell.visible).join(' '))}html+='</tbody></table></div>';visible.push(tableVisible.join('\n'));continue}}
   if(match=line.match(list)){const indent=match[1].length,ordered=/\d/.test(match[2]),tag=ordered?'ol':'ul',start=ordered?' start="'+parseInt(match[2],10)+'"':'';html+='<'+tag+start+'>';const listVisible=[];while(index<lines.length){const item=lines[index].match(list);if(!item||item[1].length!==indent||/\d/.test(item[2])!==ordered)break;const body=[item[3]];index++;while(index<lines.length&&lines[index].trim()&&/^\s+/.test(lines[index])&&(!list.test(lines[index])||lines[index].match(list)[1].length>indent))body.push(lines[index++].slice(indent+2));const check=body[0].match(/^\[([ xX])\]\s+(.*)$/);if(check)body[0]=check[2];const child=blocks(body,depth+1);html+='<li'+(check?' class="md-check"':'')+'>'+(check?'<input type="checkbox" disabled'+(check[1]!==' '?' checked':'')+' aria-label="'+(check[1]!==' '?'Выполнено':'Не выполнено')+'">':'')+child.html+'</li>';if(child.visible)listVisible.push(child.visible)}html+='</'+tag+'>';visible.push(listVisible.join('\n'));continue}
   const body=[line];index++;while(index<lines.length&&lines[index].trim()&&!special(lines[index])&&!(index+1<lines.length&&lines[index].includes('|')&&cells(lines[index+1]).every(cell=>/^:?-{3,}:?$/.test(cell))))body.push(lines[index++]);const parts=body.map(row=>inline(row));html+='<p>'+parts.map(part=>part.html).join('<br>')+'</p>';visible.push(parts.map(part=>part.visible).join('\n'));
  }
  return {html,visible:visible.filter(Boolean).join('\n')};
 };
 return blocks(normalize(value).split('\n'),0);
}

export function markdownVisible(value){return renderMarkdown(value).visible}
