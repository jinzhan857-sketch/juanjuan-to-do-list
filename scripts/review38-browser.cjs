'use strict';
const fs=require('node:fs'),path=require('node:path');
require('./quota-refund-browser.cjs')({
 port:4214,database:'juanjuan-review38-synthetic',
 controlsExtra:'<button id="review38-run">运行离页复查</button><button id="review38-reload">准备进行中刷新</button>',
 extra:fs.readFileSync(path.join(__dirname,'helpers/review38-browser.js'),'utf8'),
});
