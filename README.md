# module-sdk-tools

CLI helpers for building SDKs and updating client dependencies.

## Install

```bash
bun add -D "ssh://git@github.com/mendesbarreto/module-sdk-tools#<tag>"
```

## Commands

```bash
sdk-tools init
sdk-tools export-openapi
sdk-tools build-js-sdk
sdk-tools build-react-sdk
sdk-tools validate-config
sdk-tools report
sdk-tools update-sdks
```

## Update SDKs

```bash
sdk-tools update-sdks
sdk-tools update-sdks --only module-personal-profile-react-sdk
```

## Config

Create `sdk-tools.config.ts` in your project root.

```bash
sdk-tools init
```

```ts
import type { SdkToolsConfig } from 'module-sdk-tools';

const config: SdkToolsConfig = {
  serviceUrlMap: {
    local: 'http://localhost:3126',
    development: 'https://dev-api.example.com',
    staging: 'https://staging-api.example.com',
    production: 'https://api.example.com',
  },
  jsSdkPackageName: 'module-personal-profile-js-sdk',
  reactSdkPackageName: 'module-personal-profile-react-sdk',
  sdkDependencies: ['module-personal-profile-react-sdk'],
  sdkDependencyPattern: '.*-sdk$',
};

export default config;
```
