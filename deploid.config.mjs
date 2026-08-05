export default {
  appName: 'Boss Kamp',
  appId: 'no.vardir.bosskamp',
  web: {
    framework: 'vite',
    buildCommand: 'npm run build',
    webDir: 'dist',
    pwa: {
      serviceWorker: true,
    },
  },
  android: {
    packaging: 'capacitor',
    targetSdk: 35,
    minSdk: 24,
    permissions: ['INTERNET'],
    version: {
      code: 2,
      name: '1.0.1',
    },
    signing: {
      keystorePath: 'secrets/boss-kamp-upload.jks',
      alias: 'boss-kamp',
      storePasswordEnv: 'DEPLOID_ANDROID_STORE_PASSWORD',
      keyPasswordEnv: 'DEPLOID_ANDROID_KEY_PASSWORD',
    },
  },
  assets: {
    source: 'public/icons/icon-source.png',
    output: 'assets-gen/',
  },
};
