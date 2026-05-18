# Expo Router Example

Use [`expo-router`](https://docs.expo.dev/router/introduction/) to build native navigation using files in the `app/` directory.

## Launch your own

[![Launch with Expo](https://github.com/expo/examples/blob/master/.gh-assets/launch.svg?raw=true)](https://launch.expo.dev/?github=https://github.com/expo/examples/tree/master/with-router)

## 🚀 How to use

```sh
npx create-expo-app -e with-router
```

## Local API on a physical phone

Start the chat API server before opening the app:

```sh
pnpm server
```

For development on the same Wi-Fi, the app automatically derives your computer's LAN IP from the Expo dev server and calls `http://<your-computer-ip>:3001/api/chat`.

For production builds, tunnel URLs, or phones that are not on the same Wi-Fi, create a root `.env` file and point the app at a reachable HTTPS API:

```sh
EXPO_PUBLIC_API_URL=https://your-api.example.com/api/chat
```

## Deploy

Deploy on all platforms with Expo Application Services (EAS).

- Deploy the website: `npx eas-cli deploy` — [Learn more](https://docs.expo.dev/eas/hosting/get-started/)
- Deploy on iOS and Android using: `npx eas-cli build` — [Learn more](https://expo.dev/eas)

## 📝 Notes

- [Expo Router: Docs](https://docs.expo.dev/router/introduction/)
