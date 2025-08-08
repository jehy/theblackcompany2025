import fs from 'fs';
import path from 'path';
import fsp from 'fs/promises';
import { exec } from 'child_process';
import promiseMap from 'p-map';


interface ConvertOptions {
    outputDir?: string;      // Директория для выходных файлов
    attachmentsDir?: string; // Поддиректория для медиафайлов (относительно outputDir)
    tags: string[];          // Теги для файла
}

async function convertDocxToMarkdown(
    filePath: string,
    options: ConvertOptions = {tags: []}
): Promise<void> {
    // Получаем имя файла без расширения
    const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));
    
    // Нормализуем пути (убираем лишние точки и слэши)
    const outputDir = options.outputDir ? path.normalize(options.outputDir) : path.dirname(filePath);
    const attachmentsDir = options.attachmentsDir || 'attachments';
    
    // Полный путь к директории с медиафайлами
    const fullAttachmentsPath = path.join(outputDir, attachmentsDir, fileNameWithoutExt);
    
    // Создаем директории, если они не существуют
    await fsp.mkdir(fullAttachmentsPath, { recursive: true });
    
    // Формируем полный путь для выходного .md файла
    const outputFilePath = path.join(outputDir, `${fileNameWithoutExt}.md`);
    const date = '2025-08-07T19:54:40.114Z';//new Date().toISOString()

    const header = `---
title: "${fileNameWithoutExt}"
date: ${date}
categories:\n - [${options.tags.map(tag=>`"${tag}"`).join(', ')}]
---`;
    
//tags:\n${options.tags.map(tag => ` - ${tag}`).join('\n')}
    // Формируем команду
    const command = `pandoc -t markdown_strict --extract-media='${fullAttachmentsPath}' '${filePath}' -o '${outputFilePath}'`;
    
    console.log(`Executing: ${command}`);
    
    await new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
            }
            console.log(`File converted successfully: ${outputFilePath}`);
            console.log(`Media files saved to: ${fullAttachmentsPath}`);
            resolve(null);
        });
    });
    const data = fs.readFileSync(outputFilePath, 'utf8');
    await fsp.writeFile(outputFilePath, `${header}\n\n${data}`, 'utf8');
}


function getAllFilesRecursive(dirPath: string, arrayOfFiles:Array<string>):Array<string> {

  // Read the directory contents
  const files = fs.readdirSync(dirPath, { withFileTypes: true }); // withFileTypes for Dirent objects

  files.forEach(file => {
    const fullPath = path.join(dirPath, file.name);

    if (file.isDirectory()) {
      // If it's a directory, recursively call the function
      getAllFilesRecursive(fullPath, arrayOfFiles);
    } else {
      // If it's a file, add its path to the array
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

function getFileMeta(file: string): {extension: string, tags: string[], title: string, file: string} {

    const data = file.split('/');
    const extension = path.extname(file);
    //const extension = data[data.length-1].split('.')[1];
    const tags = data.slice(1, data.length-1);
    const title = data[data.length-1].replace(extension, '').trim();
    return {
        file,
        extension,
        tags,
        title,
    };
}
// Example usage:
const startDirectory = './docs'; // Replace with your desired starting directory
const allNewFiles = getAllFilesRecursive(startDirectory, []);
const newFilesWithMeta = allNewFiles.map(file=>getFileMeta(file));
const existingFiles = getAllFilesRecursive('./source/_posts', []).map(file=>getFileMeta(file));
console.log(`existingFiles`, existingFiles);

const nonExistingFIles = newFilesWithMeta.filter(file=>{
    const exists =  existingFiles.find(existingFile=>{
        return existingFile.title === file.title;
    });
    if(exists){
        console.log(`File already exists: ${file.file}`);
        return false;
    }
    return true;
});

await promiseMap(nonExistingFIles, async file=> {
    console.log(`Processing file: ${file.file}`);
    if(file.extension !== '.docx') {
        console.log(`Skipping file: ${file.file}`);
        return;
    }
    await convertDocxToMarkdown(file.file, {
        outputDir: `./source/_posts/${file.tags.join('/')}`,
        attachmentsDir: 'attachments',
        tags: file.tags,
    });
}, {concurrency: 10});