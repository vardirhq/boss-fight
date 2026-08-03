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
      code: 1,
      name: '1.0.0',
    },
  },
  assets: {
    source: 'public/icons/icon-source.png',
    output: 'assets-gen/',
  },
};
