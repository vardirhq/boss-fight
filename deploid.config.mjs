export default {
  appName: 'Boss Kamp',
  appId: 'no.vardir.bosskamp',
  web: {
    framework: 'vite',
    buildCommand: 'npm run build',
    webDir: 'dist',
  },
  android: {
    packaging: 'capacitor',
    targetSdk: 35,
    minSdk: 24,
    permissions: ['INTERNET'],
    version: {
      code: 3,
      name: '1.1.0',
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
