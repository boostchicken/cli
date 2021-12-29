import { GithubSlsRestApiRoleResponse } from '../../api/github-sls-rest-api';
import { Scms } from '../stores/scms';
import { Show } from './show';
import { AwsHelper } from '../helpers/aws/awsHelper';
export declare class Assume {
    scms: Scms;
    show: Show;
    awsHelper: AwsHelper;
    constructor();
    handle(role?: string, headless?: boolean, org?: string, provider?: string): Promise<void>;
    private assumeBrowser;
    private assumeTerminal;
    promptRole(org?: string, provider?: string): Promise<GithubSlsRestApiRoleResponse>;
}
//# sourceMappingURL=assume.d.ts.map