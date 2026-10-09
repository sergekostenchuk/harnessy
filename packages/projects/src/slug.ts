const translit:Record<string,string>={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
const stop=new Set("давай давайте нужно надо сделай сделаем хочу хотим мне нам и в на с по для это что как у о а но я ты вы мы не бы же ли про из к от до за пожалуйста привет здравствуй здравствуйте есть будет будем новый новая новое проект the a an of for and in on with to let's lets make create build please hi hello new project i we want need".split(' '));
export function projectSlug(text:string,now=()=>new Date()):string {
 const words:string[]=[];for(const w of (text||'').toLowerCase().match(/[\p{L}\p{N}_'-]+/gu)??[]){if(stop.has(w)||/^\p{N}+$/u.test(w))continue;words.push([...w].map(ch=>translit[ch]??ch).join(''));if(words.length===4)break}
 const slug=words.join('-').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');if(slug)return slug;
 const d=now(),n=(v:number)=>String(v).padStart(2,'0');return 'proekt-'+n(d.getDate())+n(d.getMonth()+1)+'-'+n(d.getHours())+n(d.getMinutes())
}
export function projectNameFrom(transcript:{role?:string;text?:string}[],now?:()=>Date){return projectSlug(transcript.find(m=>m.role==='me')?.text??'',now)}
