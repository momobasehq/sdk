# Momobase SDK

[![npm](https://img.shields.io/npm/v/momobase.svg)](https://www.npmjs.com/package/momobase)
[![Release](https://img.shields.io/github/v/release/momobasehq/sdk.svg)](https://github.com/momobasehq/sdk/releases)
[![SDK](https://github.com/momobasehq/sdk/actions/workflows/build.yml/badge.svg)](https://github.com/momobasehq/sdk/actions/workflows/build.yml)
[![License](https://img.shields.io/npm/l/momobase.svg)](LICENSE.txt)

TypeScript client for the Momobase payment and administration APIs.

## Install

```sh
npm install momobase
```

## Usage

```ts
import { MomobaseClient } from "momobase";

const client = new MomobaseClient({
    baseUrl: "https://payments.example.com",
    clientId: "app_client_...",
    clientSecret: "mb_..."
});

const payment = await client.collections.create({
    payment_method: "momo",
    account: "256770000000",
    amount: 50000,
    currency: "UGX",
    country: "UG",
    reference: "ORDER-1"
});
```

## Documentation

See the [Momobase SDK documentation](https://momobasehq.github.io/sdk/) for authentication, payment flows, administration, and the complete API.

## License

[MIT](LICENSE.txt)
