const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { generateTTSAndZip } = require('./utils/tts');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

app.post('/api/pdf-to-audio', upload.single('file'), async (req, res) => {
  const filePath = req.file.path;
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const pages = data.text.split(/\f+/); // 用分页符分割页面

    const zipPath = await generateTTSAndZip(pages);
    res.download(zipPath, 'tts-audio.zip');
  } catch (err) {
    console.error('PDF 转语音失败:', err);
    res.status(500).json({ error: '处理失败' });
  } finally {
    fs.unlinkSync(filePath);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ 后端启动成功：http://localhost:${PORT}`));