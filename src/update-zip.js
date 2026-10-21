// A deliberately small ZIP reader for the code-update format we publish.
// It accepts only bounded regular files declared by the authenticated download
// manifest; general-purpose archives, links and ZIP64 are not supported.
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const MAX_ZIP_BYTES=4*1024*1024;
const MAX_EXPANDED_BYTES=8*1024*1024;
const MAX_FILE_BYTES=1024*1024;
const MAX_FILES=128;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function codePath(value) {
  if(typeof value!=='string'||value.length>160||!value.startsWith('src/')||value.includes('\\')||value.includes('\0'))return false;
  const parts=value.split('/');
  return parts.every(part=>/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)&&part!=='.'&&part!=='..')&&/\.(?:js|json|html|css|svg|png|ico)$/.test(value)&&value!=='src/bootstrap.js';
}
let crcTable;
function crc32(bytes) {
  crcTable ||= Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;
}
function unzipCode(bytes,files) {
  if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.length>MAX_ZIP_BYTES)throw new Error('Invalid code-update archive size.');
  const expected=new Map(files.map(file=>[file.path,file]));
  if(!expected.size||expected.size>MAX_FILES||expected.size!==files.length)throw new Error('Invalid code-update file list.');
  let end=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(bytes.readUInt32LE(at)===0x06054b50&&at+22+bytes.readUInt16LE(at+20)===bytes.length){end=at;break;}
  if(end<0)throw new Error('Invalid code-update ZIP directory.');
  const count=bytes.readUInt16LE(end+10),centralSize=bytes.readUInt32LE(end+12),centralOffset=bytes.readUInt32LE(end+16);
  if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==count||count!==expected.size||count>MAX_FILES||centralOffset+centralSize!==end)throw new Error('Unsupported code-update ZIP layout.');
  const result=new Map(),ranges=[];let cursor=centralOffset,total=0;
  for(let n=0;n<count;n++){
    if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)throw new Error('Invalid code-update ZIP entry.');
    const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),crc=bytes.readUInt32LE(cursor+16),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24);
    const nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),disk=bytes.readUInt16LE(cursor+34),attributes=bytes.readUInt32LE(cursor+38),local=bytes.readUInt32LE(cursor+42);
    if(cursor+46+nameLength+extra+comment>end)throw new Error('Truncated code-update entry.');
    const rawName=bytes.subarray(cursor+46,cursor+46+nameLength),name=rawName.toString('utf8');
    const declared=expected.get(name),mode=(attributes>>>16)&0xf000;
    if(!Buffer.from(name,'utf8').equals(rawName)||!codePath(name)||!declared||result.has(name)||disk||flags&~0x808||![0,8].includes(method)||mode===0xa000||(attributes&0x10)||[compressed,size,local].includes(0xffffffff))throw new Error('Unapproved path or unsupported code-update entry.');
    if(size!==declared.bytes||size>MAX_FILE_BYTES||(total+=size)>MAX_EXPANDED_BYTES)throw new Error('Code-update expanded size does not match its manifest.');
    if(local+30>centralOffset||bytes.readUInt32LE(local)!==0x04034b50)throw new Error('Invalid code-update local entry.');
    const localFlags=bytes.readUInt16LE(local+6),localMethod=bytes.readUInt16LE(local+8),localNameLength=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28);
    const start=local+30+localNameLength+localExtra,finish=start+compressed;
    if(localFlags!==flags||localMethod!==method||finish>centralOffset||!bytes.subarray(local+30,local+30+localNameLength).equals(rawName)||ranges.some(([a,b])=>local<b&&finish>a))throw new Error('Inconsistent code-update local entry.');
    ranges.push([local,finish]);
    const body=method===0?Buffer.from(bytes.subarray(start,finish)):zlib.inflateRawSync(bytes.subarray(start,finish),{maxOutputLength:size+1});
    if(body.length!==size||crc32(body)!==crc||hash(body)!==declared.sha256)throw new Error('Code-update file integrity check failed.');
    result.set(name,body);cursor+=46+nameLength+extra+comment;
  }
  if(cursor!==end||result.size!==expected.size)throw new Error('Code-update file list is incomplete.');
  return result;
}
module.exports={unzipCode,codePath,hash,crc32,MAX_ZIP_BYTES,MAX_EXPANDED_BYTES,MAX_FILE_BYTES,MAX_FILES};
