// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- install with: npm install && npx cap add android && npx cap add ios
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mediward.app',
  appName: 'MediWard',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1e293b',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    BiometricAuth: {
      androidBiometricStrength: 'STRONG',
    },
  },
};

export default config;
