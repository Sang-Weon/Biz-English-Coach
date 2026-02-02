export const decodeAudioData = async (
  base64String: string,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  try {
    const buffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
    return buffer;
  } catch {
    // Fallback for raw PCM 24000Hz mono (typical for Gemini TTS)
    const pcmData = new Int16Array(bytes.buffer);
    const channels = 1;
    const sampleRate = 24000;
    const frameCount = pcmData.length;
    const audioBuffer = audioContext.createBuffer(channels, frameCount, sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      channelData[i] = pcmData[i] / 32768.0;
    }
    return audioBuffer;
  }
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
