const OneSky = require('./onesky');
const fs = require('fs');
const readline = require('readline')
const async = require('async');
const config = require('./config.json');


const projects = config.PROJECTS
    .split(',').map(s => s.trim(s)).map(s => parseInt(s));
const onesky = new OneSky(
    config.API_KEY,
    config.API_SECRET
)

const toClient = new OneSky(
    config.API_KEY,
    config.API_SECRET
)

let newProjectGroupName;
const baseLang = config.BASE_LANG;
const fileFormat = config.FILE_FORMAT;

const getProjectFiles = async (projectId) => {


    //get files  
    const filenames = (await onesky.getFileList(projectId)).map(f => f.file_name);
    console.log('files: ', filenames.join(', '));

    //get project languages
    const locales = (await onesky.getLangauges(projectId)).map(l => l.code);
    console.log('locales: ', locales.join(', '));

    const downloadFileConfigs = [].concat.apply([], locales.map(locale => filenames.map(filename => ({ filename, locale }))));
    let files = [];


    return new Promise((resolve, reject) => {
        async.parallelLimit(
            downloadFileConfigs.map(config =>
                async.retryable({ times: 5, interval: 2000 }, async () => {

                    console.log(`downloading ${config.filename}(${config.locale})`);
                    const file = await onesky.getFiles(projectId, config.filename, config.locale);
                    if (file.filePath !== null) {
                        console.log(`File ${file.file}(${file.locale}) downloaded`);
                        return file;
                    } else {
                        console.log(`File ${file.file} ${file.locale} no translation`);
                    }
                    return null;

                })
            ),
            10, (err, result) => {
                if (err) {
                    return reject(err);
                }
                resolve(result.filter(s => s !== null));
            }
        )
    });

};

const uploadFiles = (newProjectId, fileFormat, files) => new Promise((resolve, reject) => {

    async.parallelLimit(
        files.map(fileConfig => async () => {
            console.log(`import file ${fileConfig.file}(${fileConfig.locale}) - ${fileConfig.filePath}`);
            const rs = fs.createReadStream(fileConfig.filePath);
            const uploadResult = await toClient.uploadFiles(
                newProjectId,
                fileFormat,
                rs,
                fileConfig.locale
            );
            console.log(uploadResult.meta.status == 201 ?
                ` file ${fileConfig.file}(${fileConfig.locale}) - ${fileConfig.filePath} imported ` :
                uploadResult
            );
            return uploadResult;
        }),
        10,
        (err, result) => {
            if (err) {
                return reject(err);
            }
            resolve();
        }
    )
})

const exec = (async () => {
    try {
        let projectFiles = {}, noOfFile = 0;//{ file, locale, 'filePath'}

        if (fs.existsSync('download-files.config')) {
            console.log('read from previous downloaded files');
            const prevProjecdtFiles = fs.readFileSync('download-files.config');
            projectFiles = JSON.parse(prevProjecdtFiles);
        } else {
            for (let projectId of projects) {
                const files = await getProjectFiles(projectId);
                projectFiles[projectId] = files;
                noOfFile += files.length;
            }
            const prevProjecdtFiles = fs.writeFileSync('download-files.config', JSON.stringify(projectFiles));
            console.log(`Totally downloaded ${noOfFile} files`);
        }

        console.log('create new project group');

        const newProjectGroup = await toClient.createProjectGroup(newProjectGroupName, baseLang);
        for (let projectId of projects) {
            console.log('create new project');
            const projectInfo = await onesky.getProject(projectId);
            const newProjectInfo = await toClient.createProject(newProjectGroup.id, projectInfo.project_type.code, projectInfo.name);

            const newProjectId = newProjectInfo.id;
            const files = projectFiles[projectId];
            console.log(`new Project created : ${newProjectId}`);
            console.log('starting import files');



            const baseLangFiles = files.filter(f => f.locale === baseLang);
            const translationFiles = files.filter(f => f.locale !== baseLang);
            await uploadFiles(newProjectId, fileFormat, baseLangFiles);
            await uploadFiles(newProjectId, fileFormat, translationFiles);


        }
        fs.unlinkSync('download-files.config');
        console.log('done.. exit');
        process.exit(0);
    } catch (e) {
        console.error(' ERROR : ', e);
        process.exit(0);

    }
});


console.log('Start copy project : ', projects);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'Qihoo > '
});


rl.prompt();
rl.question('Input new project group name: ', (answer) => {
    newProjectGroupName = answer;
    exec();
})

rl.on('close', () => {
    console.log('Have a great day!');
    process.exit(0);
});




