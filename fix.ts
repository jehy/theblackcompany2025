import fs from 'fs';
import path from 'path';
import fsp from 'fs/promises';
import { exec } from 'child_process';
import promiseMap from 'p-map';


interface fixOptions {
    outputDir?: string;      // Директория для выходных файлов
    attachmentsDir?: string; // Поддиректория для медиафайлов (относительно outputDir)
    tags: string[];          // Теги для файла
}

async function fix(
    filePath: string,
    options: fixOptions = {tags: []}
): Promise<void> {

    // Получаем имя файла без расширения
    const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));
    
    // Нормализуем пути (убираем лишние точки и слэши)
    const outputDir = options.outputDir ? path.normalize(options.outputDir) : path.dirname(filePath);
    const attachmentsDir = options.attachmentsDir || 'attachments';

    
    // Формируем полный путь для выходного .md файла
    const outputFilePath = path.join(outputDir, `${fileNameWithoutExt}.md`);
    if(fs.existsSync(outputFilePath)){
        const data = await fsp.readFile(outputFilePath, 'utf8');
        const separated = data.split('---');
        const header = separated[1];
        const fixedHeader = header.split('\n').map(line=>{
            if(line.startsWith('title:')){
                const content = line.split('title:')[1]
                    .trim()
                    .replaceAll('ГОТОВ', '')
                    .replaceAll('"', '')
                    .replaceAll('!', ' ')
                    .replaceAll('_', ' ')
                    .replace(/ +(?= )/g,'')// remove duplicate spaces
                    .trim()
                return `title: "${content}"`;
            }
            return line;
        }).join('\n');
        const separatedFixed = [separated[0], fixedHeader, ...separated.slice(2)];
        const dataFixed = separatedFixed.join('---');
        await fsp.writeFile(outputFilePath, dataFixed, 'utf8');
    }
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

// Example usage:
const startDirectory = './docs'; // Replace with your desired starting directory
const allFiles = getAllFilesRecursive(startDirectory, []);
const filesWithMeta = allFiles.map(file=>{
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
});

await promiseMap(filesWithMeta, async file=> {
    console.log(`Processing file: ${file.file}`);
    if(file.extension !== '.docx') {
        console.log(`Skipping file: ${file.file}`);
        return;
    }
    await fix(file.file, {
        outputDir: `./source/_posts/${file.tags.join('/')}`,
        attachmentsDir: 'attachments',
        tags: file.tags,
    });
}, {concurrency: 10});