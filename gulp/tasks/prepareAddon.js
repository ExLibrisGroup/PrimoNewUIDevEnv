'use strict';
const gulp = require('gulp');
const config = require('../config.js');
const exec = require('child_process').exec;
const fs = require('fs');
const Promise = require('bluebird');
const prompt = require('prompt');
const camelCase = require('camel-case');
const streamToPromise = require('stream-to-promise');
const colors = require('colors/safe');


let buildParams = config.buildParams;

gulp.task('prepare-addon', ['select-view', 'custom-js','custom-scss','custom-css'], function() {
    let view = config.view();
    let packageJsonPath = buildParams.viewRootDir() + '/package.json';
    let npmId;
    let directoryName;
    let hookName;

    let runNpmInitIfNeeded = new Promise((resolve, reject) => {
        if (!fs.existsSync(packageJsonPath)) {
            // console.error("You need to run 'npm init' before running this gulp task");
            let childProcess = exec('npm init', {cwd: buildParams.viewRootDir()}, err => {
                if (err) {
                    reject(err);
                }
                resolve();
            });

            childProcess.stdout.on('data', function(data) {
                process.stdout.write(data);
            });

            process.stdin.on('readable', function() {
                let chunk = process.stdin.read();

                if(chunk !== null && childProcess.stdin.writable) {
                    childProcess.stdin.write(chunk);
                }

                setTimeout(() => {
                    if (fs.existsSync(packageJsonPath)) {
                        childProcess.stdin.end();
                    }
                }, 150);
            });
        } else {
            resolve();
        }
    });

    return runNpmInitIfNeeded
        .then(findNpmIdInPackageJson, handleError)
        .then(makeDirectory, handleError)
        .then(copyFiles, handleError)
        .then(compileAddon, handleError)
        .then(announceFinishedCompiling, handleError)
        .then(createDescriptorJson, handleError)
        .then(announceFinishedProcess, handleError);


    function findNpmIdInPackageJson() {
        return new Promise((resolve, reject) => {
            fs.readFile(packageJsonPath, (err, data) => {
                if (err) {
                    reject(err);
                }
                let packageJson = JSON.parse(data.toString());
                npmId = camelCase(packageJson.name);
                resolve();
            });
        });
    }


    function makeDirectory() {
        return new Promise((resolve, reject) => {
            directoryName = './addons/' + npmId;
            fs.mkdir(directoryName, err => reject(err));
            resolve();
        })
    }


    function copyFiles() {
        return streamToPromise(gulp.src(['./primo-explore/custom/' + view + '/package*.json', './primo-explore/custom/' + view + '/html/**', './primo-explore/custom/' + view + '/img/**', './primo-explore/custom/' + view + '/css/custom1.css', './primo-explore/custom/' + view + '/js/custom.js'], {base: './primo-explore/custom/' + view})
            .pipe(gulp.dest(directoryName)));
    }


    function compileAddon() {
        return new Promise((resolve, reject) => {
            let customJsPath = directoryName + '/js/' + buildParams.customFile;
            if (fs.existsSync(customJsPath)) {
                fs.readFile(customJsPath, (err, data) => {
                    if (err) {
                        reject(err);
                    }
                    let dataString = data.toString();

                    // remove comments
                    dataString = dataString.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '');

                    // group 1 = component name, group 2 = controller name if exists controller
                    let componentRegex = /\.component[\s]*?\([\s]*?['"](prm.*?After)['"](?:(?:(?!\.component)[\s\S])*?controller[\s]*?:[\s]*?['"](.*)['"])?/g;

                    if (dataString.match(componentRegex).length > 1) {
                        let arr = [];
                        let match;
                        while (match = componentRegex.exec(dataString)) {
                            arr.push(match[1]);
                        }
                        reject(new Error('Only one Primo hook allowed, you tried to use several: ' + arr.toString()));
                    }

                    let match = componentRegex.exec(dataString);

                    if (match) {
                        hookName = match[1];
                        let controllerName = match[2]; // may be null

                        dataString = dataString.replace(new RegExp(controllerName || '', 'g'), npmId + 'Controller');
                        dataString = dataString.replace(new RegExp(hookName, 'g'), npmId);
                    }

                    // remove wrapping function
                    let wrappingFunctionRegex = /\s*?\(\s*?function\s*?\(\s*?\)\s*?{\s*(?:["']use strict["'];\s*)?([\s\S]*)\s*?}\s*?\)\s*?\(\s*?\)\s*?;?/g;
                    if (match = wrappingFunctionRegex.exec(dataString)) {
                        dataString = dataString.replace(wrappingFunctionRegex, match[1]);
                    }

                    // remove app declaration
                    // group 1 = app variable name
                    let appDeclarationViewOrCentralCustomRegex = /[\s]*(?:var|let)?[\s]*(.*?)[\s]*=[\s]*angular[\s]*\.module\([\s]*['"](?:view|central)Custom['"][\s]*,[\s]*\[['"]angularLoad['"]\]\);/g;
                    if (match = appDeclarationViewOrCentralCustomRegex.exec(dataString)) {
                        // remove matched line
                        dataString = dataString.replace(appDeclarationViewOrCentralCustomRegex, '');

                        // change all the occurrences of the variable to 'app'
                        let variableName = match[1];
                        if (variableName !== 'app') {
                            let variableUseRegex = new RegExp('([[=(,]\\s*?)' + variableName + '([^\\w])|([^\\w])' + variableName + '(\\s*?[.)|\\]}=;])', 'gm');
                            dataString = dataString.replace(variableUseRegex, '$1$3app$2$4');
                        }
                    }

                    // remove constant config if exists
                    // group 1 = config name
                    let studioConfigDeclerationRegex = /\.(?:constant|value|service|factory)[\s]*?\([\s]*['"](.*?StudioConfig)/g;
                    if (dataString.match(studioConfigDeclerationRegex)) {
                        dataString = dataString.replace(studioConfigDeclerationRegex, '$&DevenvTest');
                    }

                    // group 1 = module name
                    let moduleRegex = /\.module[\s]*?\([\s]*((?:').*?(?:')|(?:").*?(?:")|.*?)[\s]*?[),]/g;

                    // push all modules
                    while (match = moduleRegex.exec(dataString)) {
                        dataString = dataString + '\napp.requires.push(' + match[1] + ');';
                    }

                    // write content to {{npmId}}.js
                    let wstream = fs.createWriteStream(directoryName + '/js/' + npmId + '.js');
                    wstream.write(dataString);
                    wstream.end();

                    // delete custom.js file
                    fs.unlink(customJsPath, err1 => {
                        if (err1) {
                            reject(err1);
                        }
                    });

                    resolve();

                });
            } else {
                resolve();
            }
        });
    }


    function announceFinishedCompiling() {
        console.log('\n');
        console.log('Finished compiling addon\n');
        console.log(colors.green('Addon can be found at /addons/' + npmId + '\n'));
    }


    function createDescriptorJson() {
        return new Promise((resolve, reject) => {
            let npmignorePath = directoryName + '/.npmignore';
            let descriptorJsonFileName = 'descriptor.json';
            let descriptorJsonPath = directoryName + '/' + descriptorJsonFileName;

            console.log("Creating '.npmignore' file\n");

            // create .npmignore file with descriptor.json
            let wstream = fs.createWriteStream(npmignorePath);
            wstream.write(descriptorJsonFileName + '\n');
            wstream.end();

            console.log("Creating 'descriptor.json' file\n");

            // needed values for descriptor.json: face (image), notes (description), who (author), what (title), linkGit, npmid, version, hook
            let descriptor = {'face': '', 'notes': '', 'who': '', 'what': '', 'linkGit': '', 'npmid': '', 'version': '', 'hook': hookName};

            // get known values from package.json
            fs.readFile(packageJsonPath, (err, data) => {
                if (err) {
                    reject(err);
                }
                let packageJson = JSON.parse(data.toString());
                descriptor.notes = packageJson.description;
                descriptor.who = packageJson.author.name || packageJson.author; // maybe empty, but is string
                if (packageJson.repository) {
                    descriptor.linkGit = packageJson.repository.url || packageJson.repository; // maybe null
                }
                descriptor.npmid = packageJson.name;
                descriptor.version = packageJson.version;

                // until here have: notes (description), who (author) {maybe}, linkGit {maybe}, npmid, version, hook
                // need to ask for: face (image), who (author) {maybe}, what (title), linkGit {maybe}

                // ask for values not exists already
                console.log("This utility will walk you through creating a 'descriptor.json' file.\n" +
                    "It only covers the most common items, and tries to guess sensible defaults.");
                prompt.start();
                prompt.colors = false;
                prompt.message = '';
                let properties = [
                    {
                        name: 'what',
                        message: 'Enter title',
                        required: true,
                        default: descriptor.npmid
                    }, {
                        name: 'face',
                        message: 'Enter a link to photo of you',
                        required: true
                    }
                ];

                if (!descriptor.who) {
                    properties.push(
                        {
                            name: 'who',
                            message: 'Enter author/s name/s',
                            required: true
                        });
                }

                if (!descriptor.linkGit) {
                    properties.push(
                        {
                            name: 'linkGit',
                            message: 'Enter link to repository',
                            required: true
                        });
                }

                prompt.get(properties, (err, result) => {
                    if (err) {
                        reject(err);
                    }

                    descriptor.what = result.what;
                    descriptor.face = result.face;
                    if (result.who) {
                        descriptor.who = result.who;
                    }
                    if (result.linkGit) {
                        descriptor.linkGit = result.linkGit;
                    }

                    // create descriptor json with values
                    wstream = fs.createWriteStream(descriptorJsonPath);
                    wstream.write(JSON.stringify(descriptor));
                    wstream.close();

                    resolve();
                });
            });
        });
    }


    function announceFinishedProcess() {
        console.log('\n');
        console.log(colors.green("Please update 'descriptor.json' file with the fields at https://github.com/primousers/primostudio and publish to NPM\n"));
    }


    function handleError(err) {
        // if fails at any time - clean addon folder
        if (directoryName) {
            fs.unlink(directoryName);
        }
        console.error(err.message);
    }
});