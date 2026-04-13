// lib/firebase_options.dart
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.windows:
        return windows;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyBykRUo3pW3GoGmX4X12KDsJcAQk8tyx14',
    appId: '1:957904840532:web:bc77c5c28eb14265d48ac1',
    messagingSenderId: '957904840532',
    projectId: 'paulandsonsplastics-294a7',
    authDomain: 'paulandsonsplastics-294a7.firebaseapp.com',
    storageBucket: 'paulandsonsplastics-294a7.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBykRUo3pW3GoGmX4X12KDsJcAQk8tyx14',
    appId: '1:957904840532:android:bc77c5c28eb14265d48ac1',
    messagingSenderId: '957904840532',
    projectId: 'paulandsonsplastics-294a7',
    storageBucket: 'paulandsonsplastics-294a7.firebasestorage.app',
  );

  static const FirebaseOptions windows = FirebaseOptions(
    apiKey: 'AIzaSyBykRUo3pW3GoGmX4X12KDsJcAQk8tyx14',
    appId: '1:957904840532:android:bc77c5c28eb14265d48ac1', // Re-using Android ID for desktop is common for Firebase Desktop
    messagingSenderId: '957904840532',
    projectId: 'paulandsonsplastics-294a7',
    storageBucket: 'paulandsonsplastics-294a7.firebasestorage.app',
  );
}
