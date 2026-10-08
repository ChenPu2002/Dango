/* 录音/拍照/文档 录入 Hook（供 App 中央 FAB 使用） */
import React, { useRef, useState } from 'react';
import * as Audio from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { addAudioJob, addPhotoJob, addDocJob, discardFile } from './pipeline';

const ASR_PRESET = {
  extension: '.m4a', sampleRate: 16000, numberOfChannels: 1, bitRate: 48000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
};

export function useRecorder(toast) {
  const recorder = Audio.useAudioRecorder(ASR_PRESET);
  const [rec, setRec] = useState({ on: false, sec: 0 });
  const timer = useRef(null);

  const start = async () => {
    const perm = await Audio.requestRecordingPermissionsAsync();
    if (!perm.granted) { toast('需要麦克风权限'); return; }
    try {
      await Audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      try { await recorder.prepareToRecordAsync(ASR_PRESET); } catch (e) { console.log('[dango] prepare warn:', String((e && e.message) || e).slice(0, 60)); }
      if (!recorder.isRecording) recorder.record();
      await new Promise((r) => setTimeout(r, 500));
      console.log('[dango] record started →', recorder.isRecording);
      if (!recorder.isRecording) throw new Error('麦克风未能启动');
      setRec({ on: true, sec: 0 });
      timer.current = setInterval(() => setRec((x) => ({ ...x, sec: x.sec + 1 })), 1000);
    } catch (e) { setRec({ on: false, sec: 0 }); toast('录音启动失败: ' + String((e && e.message) || e).slice(0, 50)); }
  };

  const stop = async () => {
    clearInterval(timer.current);
    try {
      await recorder.stop();
      await new Promise((r) => setTimeout(r, 400));
      const uri = recorder.uri;
      const dur = rec.sec;
      setRec({ on: false, sec: 0 });
      if (!uri) { toast('未生成录音文件'); return; }
      await addAudioJob(uri, dur);
      toast('已录入 · 转写+提炼自动进行');
    } catch (e) { setRec({ on: false, sec: 0 }); toast('停止失败: ' + String((e && e.message) || e).slice(0, 50)); }
  };

  const discard = async () => {
    clearInterval(timer.current);
    try { await recorder.stop(); await new Promise((r) => setTimeout(r, 300)); await discardFile(recorder.uri); } catch (_) {}
    setRec({ on: false, sec: 0 });
    toast('已丢弃');
  };

  const takePhoto = async () => {
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) { await addPhotoJob(r.assets[0].uri, r.assets[0].fileSize || 0); toast('照片已加入提炼'); }
  };
  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets[0]) { await addPhotoJob(r.assets[0].uri, r.assets[0].fileSize || 0); toast('照片已加入提炼'); }
  };
  const pickDoc = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'text/markdown', 'text/*'] });
    if (!r.canceled && r.assets && r.assets[0]) {
      const a = r.assets[0];
      if (!/\.(txt|md|markdown|csv)$/i.test(a.name || '')) { toast('文档暂支持 txt / md'); return; }
      await addDocJob(a.uri, a.name, a.size || 0); toast('文档已加入提炼');
    }
  };

  return { rec, start, stop, discard, takePhoto, pickPhoto, pickDoc };
}
