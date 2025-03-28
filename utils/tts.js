const fs = require('fs');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require("crypto-js");
require('dotenv').config();

async function generateTTS(text, index) {
  const APPID = process.env.APPID;
  const APIKey = process.env.APIKey;
  const APISecret = process.env.APISecret;
  const APIURL = process.env.APIURL;

  const body = {
    common: { app_id: APPID },
    business: {
      aue: "lame",
      sfl: 1,
      vcn: "x_xiaofeng",
      speed: 50,
      volume: 50,
      pitch: 50,
      bgs: 0
    },
    data: {
      text: Buffer.from(text).toString('base64'),
      status: 2
    }
  };

  const curTime = Math.floor(Date.now() / 1000).toString();
  const bodyStr = JSON.stringify(body);
  const md5 = CryptoJS.MD5(bodyStr).toString();
  const signatureOrigin = `host: api-dx.xf-yun.com\ndate: ${new Date().toUTCString()}\nPOST /v1/private/dts_create HTTP/1.1\ncontent-type: application/json\ncontent-length: ${bodyStr.length}\nx-appid: ${APPID}\nx-curtime: ${curTime}\nx-param: ${Buffer.from(JSON.stringify(body.business)).toString("base64")}\nx-checksum: ${md5}`;
  const signature = CryptoJS.HmacSHA256(signatureOrigin, APISecret).toString(CryptoJS.enc.Base64);

  const headers = {
    'Content-Type': 'application/json',
    'X-Appid': APPID,
    'X-CurTime': curTime,
    'X-Param': Buffer.from(JSON.stringify(body.business)).toString("base64"),
    'X-CheckSum': md5,
    'Authorization': `api_key="${APIKey}", algorithm="hmac-sha256", headers="host date request-line content-type content-length x-appid x-curtime x-param x-checksum", signature="${signature}"`
  };

  const response = await axios.post(APIURL, body, {
    headers: headers,
    responseType: 'arraybuffer'
  });

  const audioPath = path.join(__dirname, '..', 'temp', `page-${index}.mp3`);
  fs.writeFileSync(audioPath, response.data);
  return audioPath;
}

async function generateTTSAndZip(pages) {
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  // 清理旧文件
  fs.readdirSync(tempDir).forEach(file => fs.unlinkSync(path.join(tempDir, file)));

  const audioPaths = [];
  for (let i = 0; i < pages.length; i++) {
    const text = pages[i].trim();
    if (text) {
      const mp3Path = await generateTTS(text, i + 1);
      audioPaths.push(mp3Path);
    }
  }

  const zipName = uuidv4() + '.zip';
  const zipPath = path.join(tempDir, zipName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);
  audioPaths.forEach(file => {
    archive.file(file, { name: path.basename(file) });
  });

  await archive.finalize();
  return zipPath;
}

module.exports = { generateTTSAndZip };