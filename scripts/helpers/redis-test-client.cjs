'use strict';
const net=require('node:net');
function parse(buffer,start=0){
 if(start>=buffer.length)return null;const end=buffer.indexOf('\r\n',start);if(end<0)return null;
 const type=String.fromCharCode(buffer[start]),head=buffer.toString('utf8',start+1,end),n=Number(head);let next=end+2;
 if(type==='+')return {value:head,next};if(type==='-')throw Error(head);if(type===':')return {value:n,next};
 if(type==='$'){if(n===-1)return {value:null,next};if(buffer.length<next+n+2)return null;return {value:buffer.toString('utf8',next,next+n),next:next+n+2};}
 if(type==='*'){if(n===-1)return {value:null,next};const value=[];for(let i=0;i<n;i++){const part=parse(buffer,next);if(!part)return null;value.push(part.value);next=part.next;}return {value,next};}
 throw Error('Unexpected Redis response');
}
function redisCommand(command){
 const port=Number(process.env.REDIS_TEST_PORT);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('REDIS_TEST_PORT must point to the isolated loopback test container');
 return new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port});let buffer=Buffer.alloc(0);socket.setTimeout(4000,()=>socket.destroy(Error('test Redis timeout')));socket.on('error',reject);socket.on('connect',()=>{const values=command.map(String);socket.write('*'+values.length+'\r\n'+values.map(v=>'$'+Buffer.byteLength(v)+'\r\n'+v+'\r\n').join(''));});socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);try{const result=parse(buffer);if(result){socket.end();resolve(result.value)}}catch(e){socket.destroy();reject(e)}});});
}
module.exports={redisCommand};
