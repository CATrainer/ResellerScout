/**
 * CameraScreen — expo-camera full-screen capture with library fallback.
 *
 * On capture: convert to base64 + mime, push to store.setCapture, which advances to Loading.
 *
 * Permissions:
 *  - Camera granted via CameraView's useCameraPermissions.
 *  - Library via expo-image-picker (asks first use).
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Reticle } from '../components/Reticle';
import { useStore } from '../state/store';
import { colors, radii, spacing } from '../theme';

export function CameraScreen() {
  const goHome = useStore((s) => s.goHome);
  const setCapture = useStore((s) => s.setCapture);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const { width, height } = Dimensions.get('window');

  if (!permission) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator color={colors.coral} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.fallback}>
        <Text style={styles.fallbackTitle}>We need your camera</Text>
        <Text style={styles.fallbackBody}>
          To price an item we need to see it. You can use an existing photo instead if you'd rather.
        </Text>
        <Pressable style={styles.fallbackBtn} onPress={requestPermission}>
          <Text style={styles.fallbackBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable style={[styles.fallbackBtn, styles.fallbackBtnGhost]} onPress={() => pickFromLibrary(setCapture, setBusy)}>
          <Text style={[styles.fallbackBtnText, styles.fallbackBtnTextGhost]}>Pick from library</Text>
        </Pressable>
        <Pressable style={styles.backGhost} onPress={goHome}>
          <Text style={styles.backGhostText}>← Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const onShutter = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
        skipProcessing: true,
      });
      if (!photo?.base64 || !photo.uri) {
        throw new Error('Photo capture returned empty result.');
      }
      // CameraView always returns JPEG by default.
      setCapture({ uri: photo.uri, base64: photo.base64, mime: 'image/jpeg' });
    } catch (e) {
      if (__DEV__) console.warn('[CameraScreen] capture failed', e);
      setBusy(false);
    }
  };

  const onLibrary = () => pickFromLibrary(setCapture, setBusy);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      <Reticle width={width} height={height} />
      <SafeAreaView style={styles.chromeTop} pointerEvents="box-none">
        <Pressable style={styles.roundBtn} onPress={goHome}>
          <Text style={styles.roundBtnText}>←</Text>
        </Pressable>
        <Pressable style={styles.roundBtn} onPress={onLibrary}>
          <Text style={styles.roundBtnText}>⌸</Text>
        </Pressable>
      </SafeAreaView>
      <SafeAreaView style={styles.chromeBottom} pointerEvents="box-none">
        <Text style={styles.hint}>Line it up. One tap to scan.</Text>
        <Pressable
          onPress={onShutter}
          disabled={busy}
          style={({ pressed }) => [
            styles.shutterOuter,
            pressed && { transform: [{ scale: 0.95 }] },
            busy && { opacity: 0.6 },
          ]}
        >
          <View style={styles.shutterInner}>
            {busy ? <ActivityIndicator color={colors.ink} /> : null}
          </View>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

async function pickFromLibrary(
  setCapture: ReturnType<typeof useStore.getState>['setCapture'],
  setBusy: (b: boolean) => void,
) {
  setBusy(true);
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setBusy(false);
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (res.canceled || !res.assets?.[0]) {
      setBusy(false);
      return;
    }
    const asset = res.assets[0];
    const mime = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    if (!asset.base64 || !asset.uri) {
      setBusy(false);
      return;
    }
    setCapture({ uri: asset.uri, base64: asset.base64, mime });
  } catch (e) {
    if (__DEV__) console.warn('[CameraScreen] library pick failed', e);
    setBusy(false);
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  camera: { ...StyleSheet.absoluteFillObject },
  chromeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chromeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  hint: {
    color: colors.paper,
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.9,
    letterSpacing: 0.2,
    backgroundColor: 'rgba(11,11,15,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(11,11,15,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnText: { color: colors.paper, fontSize: 20, fontWeight: '700' },
  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.paper,
  },
  shutterInner: {
    flex: 1,
    width: '100%',
    borderRadius: 32,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  fallbackTitle: { color: colors.paper, fontSize: 22, fontWeight: '700' },
  fallbackBody: { color: colors.muteLight, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  fallbackBtn: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radii.md,
    backgroundColor: colors.coral,
  },
  fallbackBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.coral },
  fallbackBtnText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  fallbackBtnTextGhost: { color: colors.coral },
  backGhost: { marginTop: spacing.md },
  backGhostText: { color: colors.mute, fontSize: 13 },
});
