'use strict';

// Give the opening a clearer emotional arc without changing its structure.
Story.splice(0, Story.length,
  { face: 'smile', text: '……ここが、噂の洞窟か。\n思ったより静かだ。少し拍子抜けだな。' },
  { face: 'neutral', text: '村の人たちは、戻ってきた者が少ないと言っていた。\nでも、入口付近は普通の洞窟に見える。' },
  { face: 'angry', text: '……なんだ？\n入口の方で、崩れるような音がする……？' },
  { face: 'collapse', text: 'ゴゴゴゴゴ……！\n振り返った道が、岩と土砂で塞がれていく。' },
  { face: 'cry', text: 'う、嘘だろ……。\n入口が……完全に塞がった……？' },
  { face: 'angry', text: '……泣いている場合じゃない。\nここで止まっていても、何も変わらない。' },
  { face: 'smile', text: '大丈夫。まだ道はある。\n先に進もう。生きて帰るんだ。' },
);
