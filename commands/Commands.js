"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const Action_1 = require("../common/Action");
/* eslint-enable */
class Commands {
    constructor(github, config, action) {
        this.github = github;
        this.config = config;
        this.action = action;
    }
    async matches(command, issue) {
        if (command.requireLabel && !issue.labels.includes(command.requireLabel)) {
            return false;
        }
        if (command.disallowLabel && issue.labels.includes(command.disallowLabel)) {
            return false;
        }
        if ('label' in this.action) {
            return command.type === 'label' && this.action.label === command.name;
        }
        else {
            return (command.type === 'comment' &&
                !!this.action.comment.match(new RegExp(`(/|\\\\)${escapeRegExp(command.name)}(\\s|$)`)) &&
                ((await this.github.hasWriteAccess(this.action.user)) ||
                    command.allowUsers.includes(this.action.user.name) ||
                    (this.action.user.name === issue.author.name && command.allowUsers.includes('@author'))));
        }
    }
    async perform(command, issue) {
        var _a, _b;
        if (!(await this.matches(command, issue)))
            return;
        console.log(`Running command ${command.name}:`);
        await Action_1.trackEvent('command', { name: command.name });
        const tasks = [];
        if ('comment' in this.action && (command.name === 'label' || command.name === 'assign')) {
            const args = [];
            let argList = ((_b = (_a = this.action.comment.match(new RegExp(String.raw `(?:\\|/)${command.name}(.*)(?:\r)?(?:\n|$)`))) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : '').trim();
            while (argList) {
                const task = argList[0] === '-' ? 'remove' : 'add';
                if (task === 'remove')
                    argList = argList.slice(1);
                if (argList[0] === '"') {
                    const endIndex = argList.indexOf('"', 1);
                    if (endIndex === -1)
                        throw Error('Unable to parse arglist. Could not find matching double quote');
                    args.push({ task, name: argList.slice(1, endIndex) });
                    argList = argList.slice(endIndex + 1).trim();
                }
                else {
                    const endIndex = argList.indexOf(' ', 1);
                    if (endIndex === -1) {
                        args.push({ task, name: argList });
                        argList = '';
                    }
                    else {
                        args.push({ task, name: argList.slice(0, endIndex) });
                        argList = argList.slice(endIndex + 1).trim();
                    }
                }
            }
            if (command.name === 'label') {
                tasks.push(...args.map((arg) => arg.task === 'add'
                    ? this.github.addLabel(arg.name)
                    : this.github.removeLabel(arg.name)));
            }
            if (command.name === 'assign') {
                tasks.push(...args.map((arg) => arg.task === 'add'
                    ? this.github.addAssignee(arg.name[0] === '@' ? arg.name.slice(1) : arg.name)
                    : this.github.removeAssignee(arg.name[0] === '@' ? arg.name.slice(1) : arg.name)));
            }
        }
        if (command.action === 'close') {
            tasks.push(this.github.closeIssue());
        }
        if (command.comment && (command.action !== 'close' || issue.open)) {
            tasks.push(this.github.postComment(command.comment));
        }
        if (command.addLabel) {
            tasks.push(this.github.addLabel(command.addLabel));
        }
        if (command.removeLabel) {
            tasks.push(this.github.removeLabel(command.removeLabel));
        }
        await Promise.all(tasks);
    }
    async run() {
        const issue = await this.github.getIssue();
        return Promise.all(this.config.map((command) => this.perform(command, issue)));
    }
}
exports.Commands = Commands;
// From user CoolAJ86 on https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
//# sourceMappingURL=Commands.js.map