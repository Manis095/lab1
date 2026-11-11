import { useEffect, useState, RefObject } from 'react';

export function useWebcam(video: RefObject<HTMLVideoElement | null>, attivo: boolean) {
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    if (!attivo) return;

    let annullato = false;
    let flusso: MediaStream | undefined;

    const vincoli: MediaStreamConstraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
        facingMode: "user",
      },
      audio: false,
    };

    navigator.mediaDevices.getUserMedia(vincoli)
      .then(f => {
        if (annullato) {
          f.getTracks().forEach(t => t.stop());
          return;
        }
        flusso = f;
        if (video.current) {
          video.current.srcObject = f;
        }
      })
      .catch(e => setErrore((e as DOMException).name));

    return () => {
      annullato = true;
      flusso?.getTracks().forEach(t => t.stop());
    };
  }, [attivo, video]);

  return errore;
}