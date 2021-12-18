"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Assume = void 0;
const github_sls_rest_api_1 = require("../../api/github-sls-rest-api");
const messages_1 = require("../messages");
const scms_1 = require("../stores/scms");
const axios_1 = __importDefault(require("axios"));
const client_sts_1 = require("@aws-sdk/client-sts");
const loglevel_1 = __importDefault(require("loglevel"));
const open_1 = __importDefault(require("open"));
const show_1 = require("./show");
const inquirer_1 = __importDefault(require("inquirer"));
const command_1 = require("../command");
class Assume {
    scms;
    show;
    constructor() {
        this.scms = new scms_1.Scms();
        this.show = new show_1.Show();
    }
    async list(org, refresh) {
        const accessToken = this.scms.getGithubToken();
        if (!accessToken) {
            throw new Error(messages_1.NO_GITHUB_CLIENT);
        }
        const idpApi = new github_sls_rest_api_1.IDPApi(new github_sls_rest_api_1.Configuration({
            accessToken: accessToken,
        }));
        const { data: roles } = await idpApi.listRoles(org, refresh);
        console.table(roles.results, ['org', 'provider', 'role']);
    }
    async handle(role, headless = false, org, provider) {
        loglevel_1.default.debug(`Assuming ${role} (headless: ${headless} org: ${org} provider: ${provider})`);
        const token = this.scms.getGithubToken();
        if (!token) {
            throw new Error(messages_1.NO_GITHUB_CLIENT);
        }
        if (!role && !headless) {
            const roles = await this.show.fetchRoles(org);
            if (!roles.length) {
                throw new Error(`No roles are available to assume`);
            }
            command_1.ui.updateBottomBar('');
            const { roleIx } = await inquirer_1.default.prompt({
                type: 'list',
                name: 'roleIx',
                message: `What role would you like to assume?`,
                choices: roles.map((r, ix) => {
                    return { name: `${r.role} [${r.provider}@${r.org}]`, value: ix };
                }),
            });
            role = roles[roleIx].role;
            org = roles[roleIx].org;
            provider = roles[roleIx].provider;
        }
        if (!role) {
            throw new Error(`Please specify a role to assume`);
        }
        const idpApi = new github_sls_rest_api_1.IDPApi(new github_sls_rest_api_1.Configuration({
            accessToken: token,
        }));
        try {
            const { data: response } = await idpApi.assumeRole(role, org, provider);
            if (headless) {
                await this.assumeTerminal(response);
            }
            else {
                await this.assumeBrowser(response);
            }
        }
        catch (e) {
            if (axios_1.default.isAxiosError(e) && e.response) {
                if (e.response.status === 403) {
                    throw new Error((0, messages_1.ERROR_ASSUMING_ROLE)(role, `Reason: ${e.response.data.message}`));
                }
                else if (e.response.status === 404) {
                    throw new Error((0, messages_1.MULTIPLE_ROLES)(role, `Reason: ${e.response.data.message}`));
                }
                else {
                    throw e;
                }
            }
            throw e;
        }
        return;
    }
    async assumeBrowser(samlResponse) {
        loglevel_1.default.debug('Opening browser to:', samlResponse.browserUri);
        await (0, open_1.default)(samlResponse.browserUri);
    }
    async assumeTerminal(samlResponse) {
        switch (samlResponse.recipient) {
            case 'https://signin.aws.amazon.com/saml':
                await this.assumeAws(samlResponse);
                break;
            default:
                throw new Error((0, messages_1.TERMINAL_NOT_SUPPORTED)(samlResponse.provider, samlResponse.recipient));
        }
    }
    async assumeAws(samlResponse) {
        loglevel_1.default.debug(`Assuming AWS role ${samlResponse.role}`);
        const sts = new client_sts_1.STS({});
        const opts = samlResponse.sdkOptions;
        if (!opts) {
            throw new Error('Missing sdk options from saml response');
        }
        const response = await sts.assumeRoleWithSAML({
            ...opts,
            SAMLAssertion: samlResponse.samlResponse,
        });
        if (!response.Credentials ||
            !response.Credentials.AccessKeyId ||
            !response.Credentials.SecretAccessKey ||
            !response.Credentials.SessionToken) {
            throw new Error('Missing credentials');
        }
        this.outputEnv({
            AWS_ACCESS_KEY_ID: response.Credentials.AccessKeyId,
            AWS_SECRET_ACCESS_KEY: response.Credentials.SecretAccessKey,
            AWS_SESSION_TOKEN: response.Credentials.SessionToken,
        });
    }
    outputEnv(vars) {
        const { platform } = process;
        let prefix = 'export';
        switch (platform) {
            case 'win32':
                prefix = 'setx';
                break;
            default:
                break;
        }
        Object.entries(vars).forEach(([key, value]) => {
            console.log(`${prefix} ${key}="${value}"`);
        });
    }
}
exports.Assume = Assume;
//# sourceMappingURL=assume.js.map