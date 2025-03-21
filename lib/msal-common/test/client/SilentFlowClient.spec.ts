/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import sinon, { SinonStub } from "sinon";
import {
    AUTHENTICATION_RESULT,
    DEFAULT_OPENID_CONFIG_RESPONSE,
    TEST_CONFIG,
    TEST_DATA_CLIENT_INFO,
    ID_TOKEN_CLAIMS,
    TEST_URIS,
    TEST_TOKENS,
} from "../test_kit/StringConstants";
import { BaseClient } from "../../src/client/BaseClient";
import {
    AuthenticationScheme,
    Constants,
    CredentialType,
    ONE_DAY_IN_MS,
} from "../../src/utils/Constants";
import {
    ClientTestUtils,
    MockStorageClass,
    mockCrypto,
} from "./ClientTestUtils";
import { Authority } from "../../src/authority/Authority";
import { SilentFlowClient } from "../../src/client/SilentFlowClient";
import { RefreshTokenClient } from "../../src/client/RefreshTokenClient";
import { AuthenticationResult } from "../../src/response/AuthenticationResult";
import { AccountInfo } from "../../src/account/AccountInfo";
import * as AuthToken from "../../src/account/AuthToken";
import { AccountEntity } from "../../src/cache/entities/AccountEntity";
import { IdTokenEntity } from "../../src/cache/entities/IdTokenEntity";
import { AccessTokenEntity } from "../../src/cache/entities/AccessTokenEntity";
import { TimeUtils } from "../../src/utils/TimeUtils";
import { RefreshTokenEntity } from "../../src/cache/entities/RefreshTokenEntity";
import { CommonSilentFlowRequest } from "../../src/request/CommonSilentFlowRequest";
import { CacheManager } from "../../src/cache/CacheManager";
import {
    ClientAuthErrorCodes,
    createClientAuthError,
} from "../../src/error/ClientAuthError";
import {
    ClientConfigurationErrorCodes,
    createClientConfigurationError,
} from "../../src/error/ClientConfigurationError";
import { ClientConfiguration } from "../../src/config/ClientConfiguration";
import { CommonRefreshTokenRequest } from "../../src/request/CommonRefreshTokenRequest";
import { CcsCredentialType } from "../../src/account/CcsCredential";
import { ServerTelemetryManager } from "../../src/telemetry/server/ServerTelemetryManager";
import {
    InteractionRequiredAuthErrorCodes,
    createInteractionRequiredAuthError,
} from "../../src/error/InteractionRequiredAuthError";
import { StubPerformanceClient } from "../../src/telemetry/performance/StubPerformanceClient";
import { Logger } from "../../src/logger/Logger";

const testAccountEntity: AccountEntity = new AccountEntity();
testAccountEntity.homeAccountId = `${TEST_DATA_CLIENT_INFO.TEST_ENCODED_HOME_ACCOUNT_ID}`;
testAccountEntity.localAccountId = ID_TOKEN_CLAIMS.oid;
testAccountEntity.environment = "login.windows.net";
testAccountEntity.realm = ID_TOKEN_CLAIMS.tid;
testAccountEntity.username = ID_TOKEN_CLAIMS.preferred_username;
testAccountEntity.name = ID_TOKEN_CLAIMS.name;
testAccountEntity.authorityType = "MSSTS";

const testIdToken: IdTokenEntity = new IdTokenEntity();
testIdToken.homeAccountId = `${TEST_DATA_CLIENT_INFO.TEST_UID}.${TEST_DATA_CLIENT_INFO.TEST_UTID}`;
testIdToken.clientId = TEST_CONFIG.MSAL_CLIENT_ID;
testIdToken.environment = testAccountEntity.environment;
testIdToken.realm = ID_TOKEN_CLAIMS.tid;
testIdToken.secret = AUTHENTICATION_RESULT.body.id_token;
testIdToken.credentialType = CredentialType.ID_TOKEN;

const testAccessTokenEntity: AccessTokenEntity = new AccessTokenEntity();
testAccessTokenEntity.homeAccountId = `${TEST_DATA_CLIENT_INFO.TEST_UID}.${TEST_DATA_CLIENT_INFO.TEST_UTID}`;
testAccessTokenEntity.clientId = TEST_CONFIG.MSAL_CLIENT_ID;
testAccessTokenEntity.environment = testAccountEntity.environment;
testAccessTokenEntity.realm = ID_TOKEN_CLAIMS.tid;
testAccessTokenEntity.secret = AUTHENTICATION_RESULT.body.access_token;
testAccessTokenEntity.target =
    TEST_CONFIG.DEFAULT_SCOPES.join(" ") +
    " " +
    TEST_CONFIG.DEFAULT_GRAPH_SCOPE.join(" ");
testAccessTokenEntity.credentialType = CredentialType.ACCESS_TOKEN;
testAccessTokenEntity.cachedAt = `${TimeUtils.nowSeconds()}`;
testAccessTokenEntity.tokenType = AuthenticationScheme.BEARER;

const testAccessTokenWithAuthSchemeEntity: AccessTokenEntity =
    new AccessTokenEntity();
testAccessTokenWithAuthSchemeEntity.homeAccountId = `${TEST_DATA_CLIENT_INFO.TEST_UID}.${TEST_DATA_CLIENT_INFO.TEST_UTID}`;
testAccessTokenWithAuthSchemeEntity.clientId = TEST_CONFIG.MSAL_CLIENT_ID;
testAccessTokenWithAuthSchemeEntity.environment = testAccountEntity.environment;
testAccessTokenWithAuthSchemeEntity.realm = ID_TOKEN_CLAIMS.tid;
testAccessTokenWithAuthSchemeEntity.secret = TEST_TOKENS.POP_TOKEN;
testAccessTokenWithAuthSchemeEntity.target =
    TEST_CONFIG.DEFAULT_SCOPES.join(" ") +
    " " +
    TEST_CONFIG.DEFAULT_GRAPH_SCOPE.join(" ");
testAccessTokenWithAuthSchemeEntity.credentialType =
    CredentialType.ACCESS_TOKEN_WITH_AUTH_SCHEME;
testAccessTokenWithAuthSchemeEntity.cachedAt = `${TimeUtils.nowSeconds()}`;
testAccessTokenWithAuthSchemeEntity.tokenType = AuthenticationScheme.POP;

const testRefreshTokenEntity: RefreshTokenEntity = new RefreshTokenEntity();
testRefreshTokenEntity.homeAccountId = `${TEST_DATA_CLIENT_INFO.TEST_UID}.${TEST_DATA_CLIENT_INFO.TEST_UTID}`;
testRefreshTokenEntity.clientId = TEST_CONFIG.MSAL_CLIENT_ID;
testRefreshTokenEntity.environment = testAccountEntity.environment;
testRefreshTokenEntity.realm = ID_TOKEN_CLAIMS.tid;
testRefreshTokenEntity.secret = AUTHENTICATION_RESULT.body.refresh_token;
testRefreshTokenEntity.credentialType = CredentialType.REFRESH_TOKEN;

describe("SilentFlowClient unit tests", () => {
    const testAccount: AccountInfo = {
        authorityType: "MSSTS",
        homeAccountId: TEST_DATA_CLIENT_INFO.TEST_ENCODED_HOME_ACCOUNT_ID,
        environment: "login.windows.net",
        tenantId: ID_TOKEN_CLAIMS.tid,
        username: ID_TOKEN_CLAIMS.preferred_username,
        localAccountId: ID_TOKEN_CLAIMS.oid,
        idTokenClaims: ID_TOKEN_CLAIMS,
        name: ID_TOKEN_CLAIMS.name,
        nativeAccountId: undefined,
    };

    afterEach(() => {
        sinon.restore();
    });

    const logger = new Logger({});

    let stubPerformanceClient: StubPerformanceClient;
    beforeEach(async () => {
        stubPerformanceClient = new StubPerformanceClient();
    });

    describe("Constructor", () => {
        it("creates a SilentFlowClient", async () => {
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            expect(client).not.toBeNull();
            expect(client instanceof SilentFlowClient).toBe(true);
            expect(client instanceof BaseClient).toBe(true);
        });
    });

    describe("Success cases", () => {
        it("acquireCachedToken returns correct token even if offline_access is not present in access token entity", async () => {
            const testScopes = [
                Constants.OPENID_SCOPE,
                Constants.PROFILE_SCOPE,
                ...TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
            ];
            testAccessTokenEntity.target = testScopes.join(" ");
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);

            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };

            const response = await client.acquireCachedToken(silentFlowRequest);
            const authResult: AuthenticationResult = response[0];
            expect(authResult.authority).toBe(
                `${TEST_URIS.DEFAULT_INSTANCE}${TEST_CONFIG.TENANT}/`
            );
            expect(authResult.uniqueId).toEqual(ID_TOKEN_CLAIMS.oid);
            expect(authResult.tenantId).toEqual(ID_TOKEN_CLAIMS.tid);
            expect(authResult.scopes).toEqual(testScopes);
            expect(authResult.account).toEqual(testAccount);
            expect(authResult.idToken).toEqual(testIdToken.secret);
            expect(authResult.idTokenClaims).toEqual(ID_TOKEN_CLAIMS);
            expect(authResult.accessToken).toEqual(
                testAccessTokenEntity.secret
            );
            expect(authResult.state).toHaveLength(0);
        });

        it("acquireCachedToken does not throw when given empty object string for claims", async () => {
            const testScopes = [
                Constants.OPENID_SCOPE,
                Constants.PROFILE_SCOPE,
                ...TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
            ];
            testAccessTokenEntity.target = testScopes.join(" ");
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
                claims: "{}",
            };

            const response = await client.acquireCachedToken(silentFlowRequest);
            const authResult: AuthenticationResult = response[0];
            expect(authResult.authority).toEqual(
                `${TEST_URIS.DEFAULT_INSTANCE}${TEST_CONFIG.TENANT}/`
            );
            expect(authResult.uniqueId).toEqual(ID_TOKEN_CLAIMS.oid);
            expect(authResult.tenantId).toEqual(ID_TOKEN_CLAIMS.tid);
            expect(authResult.scopes).toEqual(testScopes);
            expect(authResult.account).toEqual(testAccount);
            expect(authResult.idToken).toEqual(testIdToken.secret);
            expect(authResult.idTokenClaims).toEqual(ID_TOKEN_CLAIMS);
            expect(authResult.accessToken).toEqual(
                testAccessTokenEntity.secret
            );
            expect(authResult.state).toBe("");
        });

        it("acquireCachedToken throws when given valid claims with default configuration", async () => {
            const testScopes = [
                Constants.OPENID_SCOPE,
                Constants.PROFILE_SCOPE,
                ...TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
            ];
            testAccessTokenEntity.target = testScopes.join(" ");
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
                claims: `{ "access_token": { "xms_cc":{"values":["cp1"] } }}`,
            };

            await expect(
                client.acquireCachedToken(silentFlowRequest)
            ).rejects.toMatchObject(
                createClientAuthError(ClientAuthErrorCodes.tokenRefreshRequired)
            );
        });

        it("acquireCachedToken does not throw when given valid claims with claimsBasedCachingEnabled", async () => {
            const testScopes = [
                Constants.OPENID_SCOPE,
                Constants.PROFILE_SCOPE,
                ...TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
            ];
            testAccessTokenEntity.target = testScopes.join(" ");
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(
                {
                    ...config,
                    cacheOptions: {
                        ...config.cacheOptions,
                        claimsBasedCachingEnabled: true,
                    },
                },
                stubPerformanceClient
            );
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
                claims: `{ "access_token": { "xms_cc":{"values":["cp1"] } }}`,
            };

            const response = await client.acquireCachedToken(silentFlowRequest);
            const authResult: AuthenticationResult = response[0];
            expect(authResult.authority).toEqual(
                `${TEST_URIS.DEFAULT_INSTANCE}${TEST_CONFIG.TENANT}/`
            );
            expect(authResult.uniqueId).toEqual(ID_TOKEN_CLAIMS.oid);
            expect(authResult.tenantId).toEqual(ID_TOKEN_CLAIMS.tid);
            expect(authResult.scopes).toEqual(testScopes);
            expect(authResult.account).toEqual(testAccount);
            expect(authResult.idToken).toEqual(testIdToken.secret);
            expect(authResult.idTokenClaims).toEqual(ID_TOKEN_CLAIMS);
            expect(authResult.accessToken).toEqual(
                testAccessTokenEntity.secret
            );
            expect(authResult.state).toBe("");
        });

        it("acquireCachedToken returns correct token when max age is provided and has not transpired yet", async () => {
            const testScopes = [
                Constants.OPENID_SCOPE,
                Constants.PROFILE_SCOPE,
                ...TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
            ];
            testAccessTokenEntity.target = testScopes.join(" ");
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);

            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
                maxAge: ONE_DAY_IN_MS * 3,
            };

            const response = await client.acquireCachedToken(silentFlowRequest);
            const authResult: AuthenticationResult = response[0];
            expect(authResult.authority).toBe(
                `${TEST_URIS.DEFAULT_INSTANCE}${TEST_CONFIG.TENANT}/`
            );
            expect(authResult.uniqueId).toEqual(ID_TOKEN_CLAIMS.oid);
            expect(authResult.tenantId).toEqual(ID_TOKEN_CLAIMS.tid);
            expect(authResult.scopes).toEqual(testScopes);
            expect(authResult.account).toEqual(testAccount);
            expect(authResult.idToken).toEqual(testIdToken.secret);
            expect(authResult.idTokenClaims).toEqual(ID_TOKEN_CLAIMS);
            expect(authResult.accessToken).toEqual(
                testAccessTokenEntity.secret
            );
            expect(authResult.state).toHaveLength(0);
        });
    });

    describe("Error cases", () => {
        it("Throws error if account is not included in request object", async () => {
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            await expect(
                client.acquireToken({
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    // @ts-ignore
                    account: null,
                    authority: TEST_CONFIG.validAuthority,
                    correlationId: TEST_CONFIG.CORRELATION_ID,
                    forceRefresh: false,
                })
            ).rejects.toMatchObject(
                createClientAuthError(
                    ClientAuthErrorCodes.noAccountInSilentRequest
                )
            );
            await expect(
                client.acquireCachedToken({
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    // @ts-ignore
                    account: null,
                    authority: TEST_CONFIG.validAuthority,
                    correlationId: TEST_CONFIG.CORRELATION_ID,
                    forceRefresh: false,
                })
            ).rejects.toMatchObject(
                createClientAuthError(
                    ClientAuthErrorCodes.noAccountInSilentRequest
                )
            );
        });

        it("Throws error if request object is null or undefined", async () => {
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            //@ts-ignore
            await expect(client.acquireToken(null)).rejects.toMatchObject(
                createClientConfigurationError(
                    ClientConfigurationErrorCodes.tokenRequestEmpty
                )
            );
            //@ts-ignore
            await expect(client.acquireToken(undefined)).rejects.toMatchObject(
                createClientConfigurationError(
                    ClientConfigurationErrorCodes.tokenRequestEmpty
                )
            );
            //@ts-ignore
            await expect(client.acquireCachedToken(null)).rejects.toMatchObject(
                createClientConfigurationError(
                    ClientConfigurationErrorCodes.tokenRequestEmpty
                )
            );

            await expect(
                //@ts-ignore
                client.acquireCachedToken(undefined)
            ).rejects.toMatchObject(
                createClientConfigurationError(
                    ClientConfigurationErrorCodes.tokenRequestEmpty
                )
            );
        });

        it("Throws error if scopes are not included in request object", async () => {
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            await expect(
                client.acquireToken({
                    //@ts-ignore
                    scopes: undefined,
                    account: testAccount,
                    authority: TEST_CONFIG.validAuthority,
                    correlationId: TEST_CONFIG.CORRELATION_ID,
                    forceRefresh: false,
                })
            ).rejects.toMatchObject(
                createClientConfigurationError(
                    ClientConfigurationErrorCodes.emptyInputScopesError
                )
            );
        });

        it("Throws error if scopes are empty in request object", async () => {
            const tokenRequest: CommonSilentFlowRequest = {
                scopes: [],
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            await expect(
                client.acquireToken(tokenRequest)
            ).rejects.toMatchObject(
                createClientConfigurationError(
                    ClientConfigurationErrorCodes.emptyInputScopesError
                )
            );
        });

        it("Throws error if it does not find token in cache", async () => {
            const testScope2 = "scope2";
            const testAccountEntity: AccountEntity = new AccountEntity();
            testAccountEntity.homeAccountId =
                TEST_DATA_CLIENT_INFO.TEST_ENCODED_HOME_ACCOUNT_ID;
            testAccountEntity.localAccountId = "testId";
            testAccountEntity.environment = "login.windows.net";
            testAccountEntity.realm = "testTenantId";
            testAccountEntity.username = "username@contoso.com";
            testAccountEntity.authorityType = "MSSTS";
            sinon
                .stub(MockStorageClass.prototype, "getAccount")
                .returns(testAccountEntity);
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            const tokenRequest: CommonSilentFlowRequest = {
                scopes: [testScope2],
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            await expect(
                client.acquireToken(tokenRequest)
            ).rejects.toMatchObject(
                createInteractionRequiredAuthError(
                    InteractionRequiredAuthErrorCodes.noTokensFound
                )
            );
        });

        it("acquireCachedToken throws refresh requiredError if forceRefresh set to true", async () => {
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);

            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: true,
            };

            expect(
                client.acquireCachedToken(silentFlowRequest)
            ).rejects.toMatchObject(
                createClientAuthError(ClientAuthErrorCodes.tokenRefreshRequired)
            );
        });

        it("acquireCachedToken throws refresh requiredError if access token is expired", async () => {
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(true);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };

            expect(
                client.acquireCachedToken(silentFlowRequest)
            ).rejects.toMatchObject(
                createClientAuthError(ClientAuthErrorCodes.tokenRefreshRequired)
            );
        });

        it("acquireCachedToken throws refresh requiredError if access token was cached after the current time", async () => {
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, <any>"wasClockTurnedBack").returns(true);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };

            expect(
                client.acquireCachedToken(silentFlowRequest)
            ).rejects.toMatchObject(
                createClientAuthError(ClientAuthErrorCodes.tokenRefreshRequired)
            );
        });

        it("acquireCachedToken throws refresh requiredError if no access token is cached", async () => {
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon.stub(CacheManager.prototype, "getAccessToken").returns(null);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);
            const config =
                await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_SCOPES,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };

            expect(
                client.acquireCachedToken(silentFlowRequest)
            ).rejects.toMatchObject(
                createClientAuthError(ClientAuthErrorCodes.tokenRefreshRequired)
            );
        });
    });

    describe("acquireToken tests", () => {
        let config: ClientConfiguration;
        let client: SilentFlowClient;
        const testAccount: AccountInfo = {
            authorityType: "MSSTS",
            homeAccountId: `${TEST_DATA_CLIENT_INFO.TEST_ENCODED_HOME_ACCOUNT_ID}`,
            tenantId: ID_TOKEN_CLAIMS.tid,
            environment: "login.windows.net",
            username: ID_TOKEN_CLAIMS.preferred_username,
            name: ID_TOKEN_CLAIMS.name,
            localAccountId: ID_TOKEN_CLAIMS.oid,
            idTokenClaims: ID_TOKEN_CLAIMS,
            nativeAccountId: undefined,
        };

        let extractTokenClaims: SinonStub;

        beforeEach(async () => {
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            AUTHENTICATION_RESULT.body.client_info =
                TEST_DATA_CLIENT_INFO.TEST_DECODED_CLIENT_INFO;
            sinon
                .stub(
                    RefreshTokenClient.prototype,
                    <any>"executePostToTokenEndpoint"
                )
                .resolves(AUTHENTICATION_RESULT);
            extractTokenClaims = sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);

            config = await ClientTestUtils.createTestClientConfiguration();
            client = new SilentFlowClient(config, stubPerformanceClient);
        });

        afterEach(() => {
            sinon.restore();
        });

        it("acquireToken returns token from cache", async () => {
            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };

            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);
            const refreshTokenSpy = sinon.stub(
                RefreshTokenClient.prototype,
                "acquireToken"
            );

            const authResult = await client.acquireToken(silentFlowRequest);
            expect(refreshTokenSpy.called).toBe(false);
            const expectedScopes = [
                Constants.OPENID_SCOPE,
                Constants.PROFILE_SCOPE,
                TEST_CONFIG.DEFAULT_GRAPH_SCOPE[0],
            ];
            expect(authResult.uniqueId).toEqual(ID_TOKEN_CLAIMS.oid);
            expect(authResult.tenantId).toEqual(ID_TOKEN_CLAIMS.tid);
            expect(authResult.scopes).toEqual(expectedScopes);
            expect(authResult.account).toEqual(testAccount);
            expect(authResult.idToken).toEqual(testIdToken.secret);
            expect(authResult.idTokenClaims).toEqual(ID_TOKEN_CLAIMS);
            expect(authResult.accessToken).toEqual(
                testAccessTokenEntity.secret
            );
            expect(authResult.state).toHaveLength(0);
        });

        it("acquireToken calls refreshToken if refresh is required", async () => {
            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };

            const expectedRefreshRequest: CommonRefreshTokenRequest = {
                ...silentFlowRequest,
                refreshToken: testRefreshTokenEntity.secret,
                authenticationScheme:
                    TEST_CONFIG.TOKEN_TYPE_BEARER as AuthenticationScheme,
                ccsCredential: {
                    credential: testAccount.homeAccountId,
                    type: CcsCredentialType.HOME_ACCOUNT_ID,
                },
            };

            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(true);
            const refreshTokenClientSpy = sinon.stub(
                RefreshTokenClient.prototype,
                "acquireToken"
            );

            await client.acquireToken(silentFlowRequest);
            expect(refreshTokenClientSpy.called).toBe(true);
            expect(
                refreshTokenClientSpy.calledWith(expectedRefreshRequest)
            ).toBe(true);
        });

        it("acquireCachedToken returns cached token", async () => {
            config.serverTelemetryManager = new ServerTelemetryManager(
                {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID,
                    apiId: 862,
                    correlationId: "test-correlation-id",
                },
                new MockStorageClass(
                    TEST_CONFIG.MSAL_CLIENT_ID,
                    mockCrypto,
                    logger
                )
            );
            client = new SilentFlowClient(config, stubPerformanceClient);
            const telemetryCacheHitSpy = sinon
                .stub(ServerTelemetryManager.prototype, "incrementCacheHits")
                .returns(1);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };

            const response = await client.acquireCachedToken(silentFlowRequest);
            const authResult: AuthenticationResult = response[0];
            const expectedScopes = [
                Constants.OPENID_SCOPE,
                Constants.PROFILE_SCOPE,
                TEST_CONFIG.DEFAULT_GRAPH_SCOPE[0],
            ];
            expect(telemetryCacheHitSpy.calledOnce).toBe(true);
            expect(authResult.uniqueId).toEqual(ID_TOKEN_CLAIMS.oid);
            expect(authResult.tenantId).toEqual(ID_TOKEN_CLAIMS.tid);
            expect(authResult.scopes).toEqual(expectedScopes);
            expect(authResult.account).toEqual(testAccount);
            expect(authResult.idToken).toEqual(testIdToken.secret);
            expect(authResult.idTokenClaims).toEqual(ID_TOKEN_CLAIMS);
            expect(authResult.accessToken).toEqual(
                testAccessTokenEntity.secret
            );
            expect(authResult.state).toHaveLength(0);
        });

        it("Throws error if max age is equal to 0 or has transpired since the last end-user authentication", async () => {
            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
                maxAge: 0, // 0 indicates an immediate refresh
            };

            await expect(
                client.acquireCachedToken(silentFlowRequest)
            ).rejects.toMatchObject(
                createClientAuthError(ClientAuthErrorCodes.maxAgeTranspired)
            );
        });

        it("Throws error if max age is requested and auth time is not included in the token claims", async () => {
            const idTokenClaimsWithoutAuthTime = {
                ...ID_TOKEN_CLAIMS,
                auth_time: undefined,
            };
            extractTokenClaims.returns(idTokenClaimsWithoutAuthTime);

            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
                maxAge: ONE_DAY_IN_MS * 3,
            };

            await expect(
                client.acquireCachedToken(silentFlowRequest)
            ).rejects.toMatchObject(
                createClientAuthError(ClientAuthErrorCodes.authTimeNotFound)
            );
        });

        it("acquireCachedToken throws refresh requiredError if access token is expired", async () => {
            const client = new SilentFlowClient(config, stubPerformanceClient);
            sinon.stub(TimeUtils, "isTokenExpired").returns(true);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };

            expect(
                client.acquireCachedToken(silentFlowRequest)
            ).rejects.toMatchObject(
                createClientAuthError(ClientAuthErrorCodes.tokenRefreshRequired)
            );
        });

        it("refreshes token if refreshOn time has passed", async () => {
            sinon.restore();
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            AUTHENTICATION_RESULT.body.client_info =
                TEST_DATA_CLIENT_INFO.TEST_DECODED_CLIENT_INFO;
            sinon
                .stub(
                    RefreshTokenClient.prototype,
                    <any>"executePostToTokenEndpoint"
                )
                .resolves(AUTHENTICATION_RESULT);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            testAccessTokenEntity.refreshOn = `${
                Number(testAccessTokenEntity.cachedAt) - 1
            }`;
            testAccessTokenEntity.expiresOn = `${
                Number(testAccessTokenEntity.cachedAt) +
                AUTHENTICATION_RESULT.body.expires_in
            }`;
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);
            sinon
                .stub(MockStorageClass.prototype, "getAccount")
                .returns(testAccountEntity);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
            };

            if (!config.storageInterface) {
                fail("config.storageInterface is undefined");
            }

            // The cached token returned from acquireToken below is mocked, which means it won't exist in the cache at this point
            const accessTokenKey: string | undefined = config.storageInterface
                .getKeys()
                .find((value) => value.indexOf("accesstoken") >= 0);
            expect(accessTokenKey).toBeUndefined();

            // Acquire a token (from the cache). The refresh_in value is expired, so there will be an asynchronous network request
            // to refresh the token. That result will be stored in the cache.
            await client.acquireToken(silentFlowRequest);

            /**
             * Wait up to two seconds for acquireToken and its mocked network requests to complete and
             * populate the cache (in the background). Periodically check the cache to ensure the refreshed token
             * exists (the network request was successful).
             * @param cache config.storageInterface
             * @returns AccessTokenEntity - the access token in the cache
             */
            const waitUntilAccessTokenInCacheThenReturnIt = async (
                cache: CacheManager
            ): Promise<AccessTokenEntity | null> => {
                let counter: number = 0;
                return await new Promise((resolve) => {
                    // every one millisecond
                    const interval = setInterval(() => {
                        // look for the access token's key in the cache
                        const accessTokenKey = cache
                            .getKeys()
                            .find((value) => value.indexOf("accesstoken") >= 0);

                        // if the access token's key is in the cache
                        if (accessTokenKey) {
                            // use it to get the access token (from the cache)
                            const accessTokenFromCache: AccessTokenEntity | null =
                                cache.getAccessTokenCredential(accessTokenKey);
                            // return it and clear the interval
                            resolve(accessTokenFromCache);
                            clearInterval(interval);
                            // otherwise, if the access token's key is NOT in the cache (yet)
                        } else {
                            counter++;
                            // if 2 seconds have elapsed while waiting for the access token's key to be in the cache,
                            // exit the interval so that this test doesn't time out
                            if (counter === 2000) {
                                resolve(null);
                            }
                        }
                    }, 1); // 1 millisecond
                });
            };
            const accessTokenFromCache: AccessTokenEntity | null =
                await waitUntilAccessTokenInCacheThenReturnIt(
                    config.storageInterface
                );

            expect(accessTokenFromCache?.clientId).toEqual(
                testAccessTokenEntity.clientId
            );
        });

        it("Adds tokenQueryParameters to the /token request", (done) => {
            sinon.restore();
            AUTHENTICATION_RESULT.body.client_info =
                TEST_DATA_CLIENT_INFO.TEST_DECODED_CLIENT_INFO;
            sinon
                .stub(
                    RefreshTokenClient.prototype,
                    <any>"executePostToTokenEndpoint"
                )
                .callsFake((url: string) => {
                    try {
                        expect(
                            url.includes(
                                "/token?testParam1=testValue1&testParam3=testValue3"
                            )
                        ).toBeTruthy();
                        expect(
                            !url.includes("/token?testParam2=")
                        ).toBeTruthy();
                        done();
                        return AUTHENTICATION_RESULT;
                    } catch (error) {
                        done(error);
                        return error;
                    }
                });
            sinon
                .stub(
                    Authority.prototype,
                    <any>"getEndpointMetadataFromNetwork"
                )
                .resolves(DEFAULT_OPENID_CONFIG_RESPONSE.body);
            sinon
                .stub(AuthToken, "extractTokenClaims")
                .returns(ID_TOKEN_CLAIMS);
            testAccessTokenEntity.refreshOn = `${
                Number(testAccessTokenEntity.cachedAt) - 1
            }`;
            testAccessTokenEntity.expiresOn = `${
                Number(testAccessTokenEntity.cachedAt) +
                AUTHENTICATION_RESULT.body.expires_in
            }`;
            sinon
                .stub(CacheManager.prototype, "readAccountFromCache")
                .returns(testAccountEntity);
            sinon
                .stub(CacheManager.prototype, "getIdToken")
                .returns(testIdToken);
            sinon
                .stub(CacheManager.prototype, "getAccessToken")
                .returns(testAccessTokenEntity);
            sinon
                .stub(CacheManager.prototype, "getRefreshToken")
                .returns(testRefreshTokenEntity);
            sinon
                .stub(MockStorageClass.prototype, "getAccount")
                .returns(testAccountEntity);

            const silentFlowRequest: CommonSilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                authority: TEST_CONFIG.validAuthority,
                correlationId: TEST_CONFIG.CORRELATION_ID,
                forceRefresh: false,
                tokenQueryParameters: {
                    testParam1: "testValue1",
                    testParam2: "",
                    testParam3: "testValue3",
                },
            };

            client.acquireToken(silentFlowRequest).catch((error) => {
                // Catch errors thrown after the function call this test is testing
            });
        });
    });
});
