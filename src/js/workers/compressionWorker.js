// src/js/workers/compressionWorker.js
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

// 递归获取目录大小
const getDirectorySize = (dirPath) => {
    let size = 0;
    try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) size += getDirectorySize(filePath);
            else size += stats.size;
        }
    } catch(e) {}
    return size;
};

parentPort.on('message', async (msg) => {
    try {
        if (msg.type === 'compress') await handleEncryption(msg.data);
        else if (msg.type === 'decompress') await handleDecryption(msg.data);
    } catch (error) {
        parentPort.postMessage({ status: 'error', error: error.message });
    }
});

// --- 加密压缩逻辑 (AES-256-CBC + 独立密钥文件) ---
async function handleEncryption({ files, output }) {
    // 1. 生成随机密钥 (32字节 Key + 16字节 IV)
    parentPort.postMessage({ status: 'log', message: '正在生成高强度随机密钥...' });
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    // 2. 准备输出 .ymenc 文件
    const outputStream = fs.createWriteStream(output);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    // 3. 准备密钥文件 .ymkey (与 output 同目录)
    // 格式：[YMHUT_KEY_HEADER (8 bytes)] + [IV (16 bytes)] + [Key (32 bytes)]
    // 这是一个简单的二进制混淆格式，非文本明文
    const keyPath = output.replace(/\.ymenc$/, '.ymkey');
    const keyHeader = Buffer.from('YMKEY001'); // 8字节头
    const keyBuffer = Buffer.concat([keyHeader, iv, key]);
    
    fs.writeFileSync(keyPath, keyBuffer);
    parentPort.postMessage({ status: 'log', message: `密钥文件已生成: ${path.basename(keyPath)}` });

    // 4. 创建压缩流
    const archive = archiver('zip', { zlib: { level: 9 } });

    let totalBytes = 0;
    files.forEach(f => {
        try {
            const stat = fs.statSync(f);
            if (stat.isDirectory()) totalBytes += getDirectorySize(f);
            else totalBytes += stat.size;
        } catch(e) {}
    });

    archive.on('progress', (progress) => {
        const percent = totalBytes > 0 ? (progress.fs.processedBytes / totalBytes) * 100 : 0;
        parentPort.postMessage({ status: 'progress', percent: percent.toFixed(1) });
    });
    
    archive.on('warning', (err) => parentPort.postMessage({ status: 'log', message: `[警告] ${err.message}` }));
    archive.on('error', (err) => { throw err; });

    // 5. 管道连接： archiver -> cipher -> outputStream
    // .ymenc 文件内容全是密文，没有头部信息，必须依赖 .ymkey 解密
    
    return new Promise((resolve, reject) => {
        outputStream.on('close', () => {
            parentPort.postMessage({ status: 'complete', path: output, keyPath: keyPath });
            resolve();
        });
        
        outputStream.on('error', reject);
        archive.on('error', reject);
        cipher.on('error', reject);

        archive.pipe(cipher).pipe(outputStream);

        parentPort.postMessage({ status: 'log', message: '正在打包并加密数据流...' });
        
        files.forEach(filePath => {
            const stat = fs.statSync(filePath);
            const filename = path.basename(filePath);
            if (stat.isDirectory()) {
                archive.directory(filePath, filename);
            } else {
                archive.file(filePath, { name: filename });
            }
        });

        archive.finalize();
    });
}

// --- 解密还原逻辑 ---
async function handleDecryption({ filePath, keyPath, targetDir }) {
    parentPort.postMessage({ status: 'log', message: '正在读取密钥文件...' });

    // 1. 验证并读取密钥
    let keyData;
    try {
        keyData = fs.readFileSync(keyPath);
    } catch (e) {
        throw new Error("无法读取密钥文件");
    }

    if (keyData.length !== 56) { // 8 + 16 + 32 = 56
        throw new Error("无效的密钥文件格式");
    }

    const header = keyData.subarray(0, 8);
    if (header.toString() !== 'YMKEY001') {
        throw new Error("密钥文件版本不匹配或已损坏");
    }

    const iv = keyData.subarray(8, 24);
    const key = keyData.subarray(24, 56);

    parentPort.postMessage({ status: 'log', message: '密钥验证通过，准备解密...' });

    // 2. 创建解密流
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const inputStream = fs.createReadStream(filePath);

    // 3. 解密并解压
    // 为了处理 ZIP 解压，我们需要先将解密后的数据流还原为完整的 Buffer
    // 注意：这限制了解密文件的大小不能超过 Node.js 的最大 Buffer 限制 (约2GB)
    
    const chunks = [];
    let decryptedLength = 0;
    const fileStat = fs.statSync(filePath);
    const totalSize = fileStat.size;

    inputStream.pipe(decipher);

    decipher.on('data', (chunk) => {
        chunks.push(chunk);
        decryptedLength += chunk.length;
        const percent = (decryptedLength / totalSize) * 100;
        parentPort.postMessage({ status: 'progress', percent: percent.toFixed(1) });
    });

    return new Promise((resolve, reject) => {
        decipher.on('end', () => {
            parentPort.postMessage({ status: 'log', message: '解密完成，正在展开 ZIP 包...' });
            try {
                const fullBuffer = Buffer.concat(chunks);
                const zip = new AdmZip(fullBuffer);
                zip.extractAllTo(targetDir, true);
                parentPort.postMessage({ status: 'complete', path: targetDir });
                resolve();
            } catch (e) {
                reject(new Error("解压失败：文件可能已损坏或密钥不匹配"));
            }
        });

        decipher.on('error', (err) => {
            reject(new Error("解密流错误：密钥可能不匹配"));
        });
        
        inputStream.on('error', reject);
    });
}