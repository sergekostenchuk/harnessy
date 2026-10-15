export type MarkdownHooks={
 escape?:(value:unknown)=>string;
 path?:(value:string)=>string|null;
 artifact?:(path:string,label:string)=>string;
 link?:(label:string,target:string,image:boolean)=>string;
};
export type MarkdownView={html:string;visible:string};
export function renderMarkdown(value:unknown,hooks?:MarkdownHooks):MarkdownView;
export function markdownVisible(value:unknown):string;
