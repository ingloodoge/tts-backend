const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const AUDIO_DIR = path.join(__dirname, 'audios');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);

// 清空文件夹
function clearFolder(folderPath) {
  fs.readdirSync(folderPath).forEach(file => {
    const filePath = path.join(folderPath, file);
    fs.unlinkSync(filePath);
  });
}

// 调用讯飞 TTS 合成音频
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
  const CryptoJS = require("crypto-js");
  const signatureOrigin = APIKey + timestamp;
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

// 上传 PDF -> 合成语音 -> 打包 ZIP
app.post('/api/pdf-to-zip', upload.single('file'), async (req, res) => {
  try {
    clearFolder(AUDIO_DIR);

    const pdfBuffer = fs.readFileSync(req.file.path);
    const parsed = await pdfParse(pdfBuffer);
    const pages = parsed.text
      .split('\n\n')
      .filter(p => p.trim().length > 20);

    for (let i = 0; i < pages.length; i++) {
      await synthesizeSpeech(pages[i], i);
    }

    // 打包成 zip
    const archiver = require('archiver');
    const zipFilename = 'output.zip';
    const zipPath = path.join(AUDIO_DIR, zipFilename);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip');

    archive.pipe(output);
    fs.readdirSync(AUDIO_DIR).forEach(file => {
      if (file !== zipFilename) {
        archive.file(path.join(AUDIO_DIR, file), { name: file });
      }
    });
    await archive.finalize();

    output.on('close', () => {
      res.json({
        success: true,
        downloadUrl: `${req.protocol}://${req.get('host')}/download/${zipFilename}`
      });
    });

  } catch (err) {
    console.error('🔥 TTS ERROR >>>', err.response?.data?.toString() || err.message || err.toString());
    res.status(500).json({ success: false, message: '服务器错误' });
  }  
});

// 提供 zip 下载接口
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(AUDIO_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('文件未找到');
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});