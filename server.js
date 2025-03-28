const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const AUDIO_DIR = path.join(__dirname, 'audios');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);

// 清理文件夹
function clearFolder(folderPath) {
  fs.readdirSync(folderPath).forEach(file => {
    const filePath = path.join(folderPath, file);
    fs.unlinkSync(filePath);
  });
}

// 调用讯飞 TTS
async function synthesizeSpeech(text, index) {
  const { APPID, APIKey, APISecret, APIURL } = process.env;

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

  const timestamp = Math.floor(Date.now() / 1000);
  const signatureOrigin = APIKey + timestamp;
  const CryptoJS = require("crypto-js");
  const signature = CryptoJS.HmacSHA256(signatureOrigin, APISecret).toString(CryptoJS.enc.Base64);
  const auth = Buffer.from(`${APIKey}:${timestamp}:${signature}`).toString('base64');

  const response = await axios.post(APIURL, body, {
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json'
    },
    responseType: 'arraybuffer'
  });

  const filePath = path.join(AUDIO_DIR, `page-${index + 1}.mp3`);
  fs.writeFileSync(filePath, response.data);
}

// 接收 PDF -> 合成语音 -> 打包
app.post('/api/pdf-to-zip', upload.single('file'), async (req, res) => {
  clearFolder(AUDIO_DIR);

  const pdfBuffer = fs.readFileSync(req.file.path);
  const parsed = await pdfParse(pdfBuffer);
  const pages = parsed.text.split('\n\n').filter(p => p.trim().length > 20); // 简单分页逻辑

  try {
    for (let i = 0; i < pages.length; i++) {
      await synthesizeSpeech(pages[i], i);
    }

    // 打包 ZIP
    const zipPath = path.join(__dirname, 'tts-audio.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip');

    output.on('close', () => {
      res.download(zipPath, 'tts-audio.zip', () => {
        fs.unlinkSync(zipPath);
      });
    });

    archive.pipe(output);
    archive.directory(AUDIO_DIR, false);
    archive.finalize();
  } catch (err) {
    console.error('❌ 合成失败：', err.toString());
    res.status(500).json({ error: '语音合成失败' });
  } finally {
    fs.unlinkSync(req.file.path);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ 后端已启动：http://localhost:${PORT}`));
