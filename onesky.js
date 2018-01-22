
const md5 = require('md5');
const request = require('request');
const queryString = require('query-string');
const FormData = require('form-data');
const fs = require('fs');
const filesDir = 'files';
const timeout = 15000;
const async = require('async');

module.exports = class OneSky {
    constructor(apiKey, secretKey) {
        this.apiKey = apiKey;
        this.secretKey = secretKey;
    }

    createProjectGroup(name, locale) {
        return new Promise((resolve, reject) => {

            const data =
                this._signRequestBody({
                    name,
                    locale
                });

            request.post({
                url: 'https://platform.api.onesky.io/1/project-groups',
                formData: data,
                timeout
            }, (err, resp, body) => {
                if (err) {
                    return reject(err);
                }

                const result = JSON.parse(body);
                if (result.meta.status !== 201) {
                    throw new Error(result.meta.message);
                }
                resolve(result.data);
            }
            );


        });

    }

    createProject(projectGroupId, projectType, name = null) {
        return new Promise((resolve, reject) => {

            const data =
                this._signRequestBody({
                    name,
                    'project_type': projectType
                });

            request.post({
                url: `https://platform.api.onesky.io/1/project-groups/${projectGroupId}/projects`,
                formData: data,
                timeout
            }, (err, resp, body) => {
                if (err) {
                    return reject(err);
                }
                const result = JSON.parse(body);
                if (result.meta.status !== 201) {
                    throw new Error(result.meta.message);
                }
                resolve(result.data);
            }
            );


        });

    }


    getProject(projectId) {
        return new Promise((resovle, reject) => {
            const queryParam = queryString.stringify(
                this._signRequestBody({})
            );
            request.get(
                `https://platform.api.onesky.io/1/projects/${projectId}?${queryParam}`,
                (err, resp, body) => {
                    if (err) {
                        return reject(err);
                    }
                    resovle(JSON.parse(body).data);
                }
            );
        });
    }

    getFiles(projectId, file, locale) {
        return new Promise((resolve, reject) => {


            const _get = () => {
                const queryParam = queryString.stringify(
                    this._signRequestBody({
                        locale, 'source_file_name': file
                    })
                );
                request.get(
                    `https://platform.api.onesky.io/1/projects/${projectId}/translations?${queryParam}`,
                    (err, resp, body) => {
                        if (err) {
                            return reject(err);
                        }

                        if (resp.statusCode == 202) {
                            console.log('wait for file ready');
                            setTimeout(_get, 10000);
                        } else if (resp.statusCode == 204) {
                            resolve({ file, locale, 'filePath': null });
                        } else if (resp.headers['content-description'] == 'File Transfer') {
                            const path = `${filesDir}/${projectId}-${locale}`;
                            const filePath = `${path}/${file}`;
                            if (!fs.existsSync(filesDir)) {
                                fs.mkdirSync(filesDir);
                            }
                            if (!fs.existsSync(path)) {
                                fs.mkdirSync(path);
                            }

                            fs.writeFileSync(filePath, body)
                            resolve({ file, locale, 'filePath': require('path').resolve(filePath) });
                        }
                    }
                );
            }
            _get();
        });
    }

    getLangauges(projectId) {
        return new Promise((resovle, reject) => {
            const queryParam = queryString.stringify(
                this._signRequestBody({})
            );
            request.get(
                `https://platform.api.onesky.io/1/projects/${projectId}/languages?${queryParam}`,
                (err, resp, body) => {
                    if (err) {
                        return reject(err);
                    }
                    resovle(JSON.parse(body).data);
                }
            );
        });
    }

    getFileList(projectId) {

        return new Promise((resovle, reject) => {

            let pages = [];
            const _get = (page) => {
                const queryParam = queryString.stringify(
                    this._signRequestBody({ page, 'per_page': 100 })
                );
                request.get(
                    `https://platform.api.onesky.io/1/projects/${projectId}/files?${queryParam}`,
                    (err, resp, body) => {
                        if (err) {
                            return reject(err);
                        }
                        const json = JSON.parse(body);

                        pages = pages.concat(json.data);
                        if (json.meta.next_page === null) {
                            resovle(pages);
                        } else {
                            _get(++page);
                        }
                    }
                )
            }


            _get(1);
        });


    }

    uploadFiles(projectId, fileFormat, file, locale) {
        const data = this._signRequestBody({
            locale,
            'file_format': fileFormat,
            'is_allow_translation_same_as_original': 'true',
            'file': file,

        });


        return new Promise((resolve, reject) => {
            async.retry({ times: 5, interval: 2000 }, (cb) => {
                request.post({
                    url: `https://platform.api.onesky.io/1/projects/${projectId}/files`,
                    formData: data,
                    timeout
                }, (err, resp, body) => {
                    if (err) {
                        cb(err, null);
                    } else {
                        cb(null, body);
                    }
                });
            }, function(err, body) {
                if (err) {
                    return reject(err);
                }
                const result = JSON.parse(body);
                resolve(result);
            });




        });
    }

    _signRequestBody(reqBody) {
        const now = Math.floor(Date.now() / 1000);
        return Object.assign({}, reqBody, {
            "api_key": this.apiKey,
            "timestamp": now,
            "dev_hash": md5(now + this.secretKey)
        });
    }
}