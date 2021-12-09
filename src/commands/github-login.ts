import { JwtGithubApi } from '../../api/auth-sls-rest-api';
import axios from 'axios';
import moment from 'moment';
import { Scms } from '../stores/scms';

type DeviceCodeRequest = {
  client_id: string;
  scope: string;
};

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

type AccessTokenRequest = {
  client_id: string;
  device_code: string;
  grant_type: string;
};

export type AccessTokenResponse = {
  error?: string;
  error_description?: string;
  access_token: string;
  token_type: string;
  scope: string;
};

export class GithubLogin {
  scms: Scms;

  constructor() {
    this.scms = new Scms();
  }

  async handle(): Promise<void> {
    const api = new JwtGithubApi();
    const { data: oauthDetail } = await api.getOauthDetail();
    const { clientId } = oauthDetail;

    const response = await axios.post<DeviceCodeResponse>(
      'https://github.com/login/device/code',
      {
        client_id: clientId,
        scope: 'user:email',
      } as DeviceCodeRequest,
      { headers: { Accept: 'application/json' } },
    );

    const { verification_uri: verificationUri, user_code: userCode } = response.data;

    console.log(`Please open the browser to ${verificationUri}, and enter the code:`);
    console.log(`\n${userCode}\n`);

    const accessTokenResponse = await this.getAccessToken(
      clientId,
      response.data,
      moment().add(response.data.expires_in, 'second'),
    );

    const location = this.scms.saveGithubToken(accessTokenResponse.access_token);
    console.log(`Saved GitHub credentials to ${location}`);
  }

  private getAccessToken(
    clientId: string,
    deviceCodeResponse: DeviceCodeResponse,
    tryUntil: moment.Moment,
  ): Promise<AccessTokenResponse> {
    return new Promise<AccessTokenResponse>((resolve, reject) => {
      const now = moment();
      if (now.isSameOrAfter(tryUntil)) {
        reject(new Error('Access token request has expired. Please re-run the `login` command'));
        return;
      }

      axios
        .post<AccessTokenResponse>(
          'https://github.com/login/oauth/access_token',
          {
            client_id: clientId,
            device_code: deviceCodeResponse.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          } as AccessTokenRequest,
          { headers: { Accept: 'application/json' } },
        )
        .then(({ data: accessTokenResponse }) => {
          if (accessTokenResponse.error) {
            if (accessTokenResponse.error === 'authorization_pending') {
              setTimeout(
                () =>
                  this.getAccessToken(clientId, deviceCodeResponse, tryUntil)
                    .then((response) => resolve(response))
                    .catch((error) => reject(error)),
                deviceCodeResponse.interval * 1000,
              );
              return;
            }
            reject(new Error(accessTokenResponse.error_description));
            return;
          }
          resolve(accessTokenResponse);
        })
        .catch((error) => reject(error));
    });
  }
}
